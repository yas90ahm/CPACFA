/**
 * Postgres: control pool (identity) and per-tenant pools (BYOD).
 * DATABASE_URL = control DB. Tenant DB URLs stored in tenants.database_url.
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const { Pool } = pg;

const MAX_TENANT_POOLS = 50;

let controlPool: pg.Pool | null = null;
const tenantPoolsByUrl = new Map<string, pg.Pool>();
const tenantPoolLru: string[] = [];

export function getControlPool(): pg.Pool {
  if (!controlPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    controlPool = new Pool({ connectionString: url, max: 20 });
  }
  return controlPool;
}

/** Backward compatibility: getPool() = control pool. */
export function getPool(): pg.Pool {
  return getControlPool();
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Query control DB (auth, tenant lookup). Use for user_repository and auth routes. */
export async function queryControl<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getControlPool().query<T>(text, params);
}

/** Query default pool (control). Kept for backward compat; prefer queryControl for control DB. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getControlPool().query<T>(text, params);
}

function evictOldestTenantPool(): void {
  if (tenantPoolLru.length === 0) return;
  const url = tenantPoolLru.shift();
  if (url) {
    const pool = tenantPoolsByUrl.get(url);
    tenantPoolsByUrl.delete(url);
    pool?.end().catch(() => {});
  }
}

function getOrCreateTenantPool(url: string): pg.Pool {
  let pool = tenantPoolsByUrl.get(url);
  if (pool) {
    const i = tenantPoolLru.indexOf(url);
    if (i >= 0) {
      tenantPoolLru.splice(i, 1);
    }
    tenantPoolLru.push(url);
    return pool;
  }
  if (tenantPoolsByUrl.size >= MAX_TENANT_POOLS) {
    evictOldestTenantPool();
  }
  pool = new Pool({ connectionString: url, max: 10 });
  tenantPoolsByUrl.set(url, pool);
  tenantPoolLru.push(url);
  return pool;
}

/**
 * Get pool for tenant: control DB if tenant has no database_url (shared-DB), else tenant's DB.
 */
export async function getTenantPool(tenantId: string): Promise<pg.Pool> {
  const control = getControlPool();
  const r = await control.query<{ database_url: string | null }>(
    'SELECT database_url FROM tenants WHERE id = $1',
    [tenantId]
  );
  const databaseUrl = r.rows[0]?.database_url ?? null;
  if (!databaseUrl || databaseUrl.trim() === '') {
    return control;
  }
  return getOrCreateTenantPool(databaseUrl);
}

const TENANT_MIGRATION_FILES: { version: number; file: string }[] = [
  { version: 3, file: '003_tenant_schema.sql' },
  { version: 4, file: '004_tenant_intercompany.sql' },
  { version: 5, file: '005_tenant_data_quality.sql' },
  { version: 6, file: '006_tenant_tax_compliance.sql' },
  { version: 7, file: '007_tenant_approvals.sql' },
  { version: 8, file: '008_tenant_data_catalog.sql' },
  { version: 9, file: '009_tenant_statement_registry.sql' },
  { version: 11, file: '011_tenant_document_requests.sql' },
  { version: 12, file: '012_tenant_budget_versions.sql' },
  { version: 13, file: '013_tenant_onboarding.sql' },
  { version: 14, file: '014_tenant_reconciliation_todos.sql' },
  { version: 15, file: '015_tenant_kpi_history.sql' },
  { version: 16, file: '016_tenant_pbc.sql' },
  { version: 17, file: '017_tenant_sampling_results.sql' },
  { version: 18, file: '018_tenant_controls.sql' },
  { version: 19, file: '019_tenant_period_close.sql' },
  { version: 20, file: '020_tenant_reconciliation_resolutions.sql' },
  { version: 21, file: '021_tenant_disclosure_checklist.sql' },
  { version: 22, file: '022_tenant_close_checklist.sql' },
  { version: 23, file: '023_sampling_run_metadata.sql' },
  { version: 24, file: '024_period_close_reviewer.sql' },
  { version: 25, file: '025_tenant_control_assertions.sql' },
  { version: 26, file: '026_tenant_close_checklist_templates.sql' },
  { version: 27, file: '027_tenant_close_calendar_config.sql' },
  { version: 28, file: '028_tenant_audit_engagements.sql' },
  { version: 29, file: '029_stock_based_compensation.sql' },
  { version: 30, file: '030_deferred_tax.sql' },
  { version: 31, file: '031_impairment_testing.sql' },
  { version: 32, file: '032_segment_reporting.sql' },
  { version: 33, file: '033_dcf_valuations.sql' },
  { version: 34, file: '034_comparable_analysis.sql' },
  { version: 35, file: '035_precedent_transactions.sql' },
  { version: 36, file: '036_business_combinations.sql' },
  { version: 37, file: '037_equity_method_investments.sql' },
  { version: 38, file: '038_portfolio_analytics.sql' },
  { version: 39, file: '039_tenant_leases.sql' },
  { version: 40, file: '040_tenant_fixed_assets.sql' },
  { version: 41, file: '041_tenant_revenue_recognition.sql' },
  { version: 42, file: '042_tenant_eps.sql' },
  { version: 43, file: '043_tenant_lbo_models.sql' },
  { version: 44, file: '044_disclosure_checklist_framework.sql' },
  { version: 45, file: '045_tenant_policy_memory.sql' },
  { version: 46, file: '046_revenue_schedule_type.sql' },
  { version: 47, file: '047_close_audit_trail.sql' },
  { version: 48, file: '048_professional_audit_flags.sql' },
  { version: 49, file: '049_lease_classification_basis.sql' },
  { version: 50, file: '050_revenue_allocation_rationale.sql' },
  { version: 51, file: '051_audit_ledger.sql' },
  { version: 52, file: '052_period_export_checks.sql' },
  { version: 53, file: '053_portfolio_performance_finalized.sql' },
  { version: 54, file: '054_risk_context_conflicts.sql' },
  { version: 55, file: '055_risk_context_liquidity.sql' },
  { version: 56, file: '056_risk_context_last_dcf.sql' },
  { version: 57, file: '057_risk_context_qualitative_evidence.sql' },
  { version: 58, file: '058_period_financial_data_state.sql' },
  { version: 59, file: '059_close_adjustments_posted_external_id.sql' },
  { version: 60, file: '060_period_trial_balance.sql' },
  { version: 61, file: '061_tenant_close_calendar_entries.sql' },
  { version: 62, file: '062_tenant_hitl_staging_and_supervisor_sessions.sql' },
  { version: 63, file: '063_tenant_supervisor_sessions_reasoning_logs.sql' },
  { version: 64, file: '064_tenant_draft_adjustments.sql' },
  { version: 65, file: '065_tenant_close_sessions.sql' },
  { version: 66, file: '066_tenant_issue_items.sql' },
  { version: 67, file: '067_tenant_triage_assessments.sql' },
  { version: 68, file: '068_fs_taxonomy_lines.sql' },
  { version: 69, file: '069_coa_mapping_rules.sql' },
  { version: 70, file: '070_tenant_decision_records.sql' },
  { version: 71, file: '071_tenant_recon_tables.sql' },
  { version: 72, file: '072_tenant_journal_entries.sql' },
  { version: 73, file: '073_tenant_close_checklist_items.sql' },
  { version: 74, file: '074_statement_packages.sql' },
  { version: 76, file: '076_tenant_justifications.sql' },
  { version: 77, file: '077_tenant_shadow_audit_findings.sql' },
  { version: 78, file: '078_close_sessions_certified.sql' },
  { version: 79, file: '079_audit_ledger_hash_version.sql' },
  { version: 80, file: '080_ai_call_log.sql' },
  { version: 81, file: '081_shadow_audit_ai_metadata.sql' },
  { version: 82, file: '082_tenant_ai_proposals.sql' },
  { version: 83, file: '083_ledger_snapshots.sql' },
  { version: 84, file: '084_journal_entry_lines_amount_provenance.sql' },
];
const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

async function getTenantAppliedVersion(pool: pg.Pool): Promise<number[]> {
  try {
    const r = await pool.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
    return r.rows.map((row) => row.version);
  } catch {
    return [];
  }
}

/**
 * Run tenant schema migrations (003, 004, ...) on the given pool if not already applied.
 */
export async function runTenantMigrations(pool: pg.Pool): Promise<void> {
  const applied = await getTenantAppliedVersion(pool);
  for (const { version, file } of TENANT_MIGRATION_FILES) {
    if (applied.includes(version)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
  }
}

/**
 * Get tenant pool and ensure tenant schema is applied (lazy migration).
 * When tenants share the control DB (no database_url), tenant migrations run on the control pool.
 */
export async function getTenantPoolWithMigrations(tenantId: string): Promise<pg.Pool> {
  const pool = await getTenantPool(tenantId);
  await runTenantMigrations(pool);
  return pool;
}

export async function closePool(): Promise<void> {
  if (controlPool) {
    await controlPool.end();
    controlPool = null;
  }
  for (const pool of tenantPoolsByUrl.values()) {
    await pool.end().catch(() => {});
  }
  tenantPoolsByUrl.clear();
  tenantPoolLru.length = 0;
}
