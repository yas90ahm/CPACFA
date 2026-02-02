/**
 * Immutable audit ledger — append-only, hash-chained. No UPDATE/DELETE.
 */

import type { Pool } from 'pg';
import { createHash } from 'crypto';
import type {
  AuditLedgerEntryInput,
  AuditLedgerEntry,
  AuditLedgerEventType,
  AuditLedgerVerifyResult,
} from '../../types/audit_ledger.js';

function nextId(): string {
  return `al-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function computeEntryHash(payload: {
  tenantId: string;
  periodLabel: string | null;
  eventType: AuditLedgerEventType;
  deterministicFlagSnapshot: Record<string, unknown>;
  agentDissentSnapshot: Record<string, unknown> | null;
  userPromptRationale: string;
  previousEntryHash: string | null;
  createdAt: string;
}): string {
  const canonical = JSON.stringify({
    tenantId: payload.tenantId,
    periodLabel: payload.periodLabel,
    eventType: payload.eventType,
    deterministicFlagSnapshot: payload.deterministicFlagSnapshot,
    agentDissentSnapshot: payload.agentDissentSnapshot,
    userPromptRationale: payload.userPromptRationale,
    previousEntryHash: payload.previousEntryHash,
    createdAt: payload.createdAt,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export async function getLatestHash(pool: Pool, tenantId: string): Promise<string | null> {
  const r = await pool.query<{ entry_hash: string }>(
    'SELECT entry_hash FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
    [tenantId]
  );
  return r.rows[0]?.entry_hash ?? null;
}

export async function appendEntry(
  pool: Pool,
  input: Omit<AuditLedgerEntryInput, 'previousEntryHash' | 'entryHash'> & { createdBy?: string }
): Promise<AuditLedgerEntry> {
  const id = nextId();
  const createdAt = new Date().toISOString();
  const previousEntryHash = await getLatestHash(pool, input.tenantId);
  const payload = {
    tenantId: input.tenantId,
    periodLabel: input.periodLabel ?? null,
    eventType: input.eventType,
    deterministicFlagSnapshot: input.deterministicFlagSnapshot,
    agentDissentSnapshot: input.agentDissentSnapshot ?? null,
    userPromptRationale: input.userPromptRationale,
    previousEntryHash,
    createdAt,
  };
  const entryHash = computeEntryHash(payload);

  await pool.query(
    `INSERT INTO audit_ledger (
      id, tenant_id, period_label, event_type, deterministic_flag_snapshot,
      agent_dissent_snapshot, user_prompt_rationale, previous_entry_hash, entry_hash,
      created_at, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      input.tenantId,
      input.periodLabel ?? null,
      input.eventType,
      JSON.stringify(input.deterministicFlagSnapshot),
      input.agentDissentSnapshot != null ? JSON.stringify(input.agentDissentSnapshot) : null,
      input.userPromptRationale,
      previousEntryHash,
      entryHash,
      createdAt,
      input.createdBy ?? null,
    ]
  );

  return {
    id,
    tenantId: input.tenantId,
    periodLabel: input.periodLabel ?? null,
    eventType: input.eventType,
    deterministicFlagSnapshot: input.deterministicFlagSnapshot,
    agentDissentSnapshot: input.agentDissentSnapshot ?? null,
    userPromptRationale: input.userPromptRationale,
    previousEntryHash,
    entryHash,
    createdAt,
    createdBy: input.createdBy ?? null,
  };
}

/** Count ledger entries for tenant/period and event type (for integrity check). */
export async function countByTenantPeriodAndEventType(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  eventType: string
): Promise<number> {
  const r = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM audit_ledger WHERE tenant_id = $1 AND period_label = $2 AND event_type = $3',
    [tenantId, periodLabel, eventType]
  );
  return Number(r.rows[0]?.count ?? 0);
}

export async function verifyChain(pool: Pool, tenantId: string): Promise<AuditLedgerVerifyResult> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string | null;
    event_type: string;
    deterministic_flag_snapshot: unknown;
    agent_dissent_snapshot: unknown;
    user_prompt_rationale: string;
    previous_entry_hash: string | null;
    entry_hash: string;
    created_at: string;
  }>(
    'SELECT id, tenant_id, period_label, event_type, deterministic_flag_snapshot, agent_dissent_snapshot, user_prompt_rationale, previous_entry_hash, entry_hash, created_at FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at ASC',
    [tenantId]
  );
  const rows = r.rows;
  let prevHash: string | null = null;
  for (const row of rows) {
    const computed = computeEntryHash({
      tenantId: row.tenant_id,
      periodLabel: row.period_label,
      eventType: row.event_type as AuditLedgerEventType,
      deterministicFlagSnapshot: (row.deterministic_flag_snapshot as Record<string, unknown>) ?? {},
      agentDissentSnapshot: (row.agent_dissent_snapshot as Record<string, unknown>) ?? null,
      userPromptRationale: row.user_prompt_rationale,
      previousEntryHash: row.previous_entry_hash,
      createdAt: row.created_at,
    });
    if (computed !== row.entry_hash) {
      return { valid: false, brokenAtEntryId: row.id, message: 'Hash mismatch' };
    }
    if (row.previous_entry_hash !== prevHash) {
      return { valid: false, brokenAtEntryId: row.id, message: 'Chain link broken (previous_entry_hash)' };
    }
    prevHash = row.entry_hash;
  }
  return { valid: true };
}
