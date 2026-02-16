/**
 * Integration test harness: deterministic tenant + DB state per test.
 *
 * API:
 * - createTenant(suiteName?): creates fresh tenant with unique id, registers in tenants table
 * - getClientForTenant(tenantId, role?): returns pool + authToken for API calls
 * - resetTenantState(tenantId): deletes all tenant-scoped data (preserves tenant row)
 * - teardown(tenantId): resetTenantState + delete tenant row
 *
 * Usage: beforeAll createTenant, afterAll teardown. No shared tenant_id across tests.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Pool } from 'pg';
import { getTenantPool, queryControl } from '../../src/db/index.js';
import { getTestAuthTokenWithRole } from './testHelpers.js';

export interface TenantContext {
  tenantId: string;
  authToken: string;
  authTokenWithRole: (role: string) => string;
  getPool: () => Promise<Pool>;
}

const createdTenants: Set<string> = new Set();

/**
 * Create a fresh tenant with unique tenant_id. Registers in tenants table (database_url=NULL for shared control DB).
 * Call teardown(tenantId) in afterAll.
 */
export async function createTenant(suiteName?: string): Promise<TenantContext> {
  const suffix = uuidv4().slice(0, 8);
  const tenantId = suiteName
    ? `int-${suiteName.replace(/\W/g, '-').slice(0, 20)}-${suffix}`
    : `int-${suffix}`;

  await queryControl(
    'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
    [tenantId, `Test ${tenantId}`]
  );
  createdTenants.add(tenantId);

  const authToken = getTestAuthTokenWithRole(tenantId);
  const authTokenWithRole = (role: string) => getTestAuthTokenWithRole(tenantId, role);
  const getPool = () => getTenantPool(tenantId);

  return { tenantId, authToken, authTokenWithRole, getPool };
}

/**
 * Get pool + authToken for an existing tenant. Use when test needs a second tenant (e.g. tenant isolation).
 */
export async function getClientForTenant(tenantId: string, role?: string): Promise<{ pool: Pool; authToken: string }> {
  const pool = await getTenantPool(tenantId);
  const authToken = getTestAuthTokenWithRole(tenantId, role ?? 'preparer');
  return { pool, authToken };
}

/** Tenant-scoped tables to clean, in FK-safe order (children before parents). */
const TENANT_CLEANUP_ORDER: Array<{ table: string; where: string }> = [
  { table: 'recon_match_group_items', where: 'match_group_id IN (SELECT id FROM recon_match_groups WHERE recon_run_id IN (SELECT rr.id FROM recon_runs rr JOIN close_sessions cs ON rr.close_session_id = cs.id WHERE cs.tenant_id = $1))' },
  { table: 'recon_match_groups', where: 'recon_run_id IN (SELECT rr.id FROM recon_runs rr JOIN close_sessions cs ON rr.close_session_id = cs.id WHERE cs.tenant_id = $1)' },
  { table: 'recon_exceptions', where: 'recon_run_id IN (SELECT rr.id FROM recon_runs rr JOIN close_sessions cs ON rr.close_session_id = cs.id WHERE cs.tenant_id = $1)' },
  { table: 'recon_signoffs', where: 'recon_run_id IN (SELECT rr.id FROM recon_runs rr JOIN close_sessions cs ON rr.close_session_id = cs.id WHERE cs.tenant_id = $1)' },
  { table: 'recon_items', where: 'recon_run_id IN (SELECT rr.id FROM recon_runs rr JOIN close_sessions cs ON rr.close_session_id = cs.id WHERE cs.tenant_id = $1)' },
  { table: 'recon_runs', where: 'close_session_id IN (SELECT id FROM close_sessions WHERE tenant_id = $1)' },
  { table: 'evidence_links', where: 'tenant_id = $1' },
  { table: 'journal_entry_lines', where: 'je_id IN (SELECT id FROM journal_entries WHERE tenant_id = $1)' },
  { table: 'je_attachments', where: 'je_id IN (SELECT id FROM journal_entries WHERE tenant_id = $1)' },
  { table: 'certification_artifacts', where: 'tenant_id = $1' },
  // ledger_snapshots: immutable (no DELETE). Skip; orphaned rows remain but tenant is deleted.
  { table: 'statement_packages', where: 'tenant_id = $1' },
  { table: 'journal_entries', where: 'tenant_id = $1' },
  { table: 'evidence_records', where: 'tenant_id = $1' },
  { table: 'close_checklist_items', where: 'tenant_id = $1' },
  { table: 'close_sessions', where: 'tenant_id = $1' },
  { table: 'period_trial_balance', where: 'tenant_id = $1' },
  { table: 'period_export_checks', where: 'tenant_id = $1' },
  { table: 'period_locks', where: 'tenant_id = $1' },
  // audit_ledger: append-only (no DELETE). Skip; orphaned rows remain but tenant is deleted.
  { table: 'tenant_hitl_staging', where: 'tenant_id = $1' },
  { table: 'tenant_ai_proposals', where: 'tenant_id = $1' },
  { table: 'ai_call_log', where: 'tenant_id = $1' },
  { table: 'tenant_triage_assessments', where: 'tenant_id = $1' },
  { table: 'tenant_issue_items', where: 'tenant_id = $1' },
  { table: 'tenant_decision_records', where: 'tenant_id = $1' },
  { table: 'tenant_justifications', where: 'tenant_id = $1' },
];

/**
 * Delete all tenant-scoped data for the given tenant. Preserves the tenant row.
 * Call before reusing tenant or in teardown.
 */
export async function resetTenantState(tenantId: string): Promise<void> {
  const pool = await getTenantPool(tenantId);
  for (const { table, where } of TENANT_CLEANUP_ORDER) {
    try {
      await pool.query(`DELETE FROM ${table} WHERE ${where}`, [tenantId]);
    } catch (e) {
      const msg = (e as Error).message || String(e);
      // Table may not exist; or immutable/append-only (ledger_snapshots, audit_ledger). Skip.
      if (msg.includes('does not exist') || msg.includes('prohibited') || msg.includes('append-only') || msg.includes('immutable')) continue;
      throw e;
    }
  }
}

/**
 * Full teardown: reset tenant state and remove tenant row.
 * Call in afterAll for every createTenant.
 */
export async function teardown(tenantId: string): Promise<void> {
  await resetTenantState(tenantId);
  await queryControl('DELETE FROM tenants WHERE id = $1', [tenantId]);
  createdTenants.delete(tenantId);
}

/**
 * Teardown all tenants created via createTenant in this process.
 * Used by global afterAll if individual teardowns were missed.
 */
export async function teardownAll(): Promise<void> {
  const ids = Array.from(createdTenants);
  for (const id of ids) {
    try {
      await teardown(id);
    } catch (e) {
      console.warn(`integrationHarness teardown ${id}:`, e);
    }
  }
}
