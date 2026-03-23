/**
 * Postgres: control pool (identity) and per-tenant pools (BYOD).
 * DATABASE_URL = control DB. Tenant DB URLs stored in tenants.database_url.
 *
 * AI boundary: when AI_BOUNDARY_DB_ROLES=true (demo/staging/prod), two pools per tenant:
 * - core pool (core_writer): DML on core.*, INSERT on audit.*, DML on ai.* for HITL
 * - ai pool (ai_writer): INSERT/SELECT/UPDATE on ai.* ONLY; cannot write core.*
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const { Pool } = pg;

const MAX_TENANT_POOLS = 50;

let controlPool: pg.Pool | null = null;
const tenantPoolsByUrl = new Map<string, pg.Pool>();
const tenantPoolLru: string[] = [];

/** AI pool cache: key = AI connection URL. */
const tenantAiPoolsByUrl = new Map<string, pg.Pool>();
const tenantAiPoolLru: string[] = [];

/** True when DB role separation is enforced (demo/staging/prod). */
export function isAiBoundaryDbRolesEnabled(): boolean {
  return process.env.AI_BOUNDARY_DB_ROLES === 'true';
}

/** Build AI connection URL from base URL using AI_DB_USER / AI_DB_PASSWORD. BYOD: same host/db, different user. */
function buildAiConnectionUrl(baseUrl: string): string {
  const aiUser = process.env.AI_DB_USER?.trim();
  const aiPassword = process.env.AI_DB_PASSWORD?.trim();
  if (!aiUser) return baseUrl;
  try {
    const u = new URL(baseUrl);
    u.username = aiUser;
    u.password = aiPassword ?? '';
    return u.toString();
  } catch {
    return baseUrl;
  }
}

export function getControlPool(): pg.Pool {
  if (!controlPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    controlPool = new Pool({ connectionString: url, max: 20 });
    controlPool.on('connect', (client) => {
      client.query(`SET search_path = ${CORE_SEARCH_PATH}`).catch(() =>
        client.query('SET search_path = public').catch(() => {})
      );
    });
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

const CORE_SEARCH_PATH = 'core, ai, audit, public';
const AI_SEARCH_PATH = 'ai, public';

function getOrCreateTenantPool(url: string): pg.Pool {
  let pool = tenantPoolsByUrl.get(url);
  if (pool) {
    const i = tenantPoolLru.indexOf(url);
    if (i >= 0) tenantPoolLru.splice(i, 1);
    tenantPoolLru.push(url);
    return pool;
  }
  if (tenantPoolsByUrl.size >= MAX_TENANT_POOLS) evictOldestTenantPool();
  pool = new Pool({ connectionString: url, max: 10 });
  pool.on('connect', (client) => {
    client.query(`SET search_path = ${CORE_SEARCH_PATH}`).catch(() =>
      client.query('SET search_path = public').catch(() => {})
    );
  });
  tenantPoolsByUrl.set(url, pool);
  tenantPoolLru.push(url);
  return pool;
}

function evictOldestTenantAiPool(): void {
  if (tenantAiPoolLru.length === 0) return;
  const url = tenantAiPoolLru.shift();
  if (url) {
    const pool = tenantAiPoolsByUrl.get(url);
    tenantAiPoolsByUrl.delete(url);
    pool?.end().catch(() => {});
  }
}

function getOrCreateTenantAiPool(url: string): pg.Pool {
  let pool = tenantAiPoolsByUrl.get(url);
  if (pool) {
    const i = tenantAiPoolLru.indexOf(url);
    if (i >= 0) tenantAiPoolLru.splice(i, 1);
    tenantAiPoolLru.push(url);
    return pool;
  }
  if (tenantAiPoolsByUrl.size >= MAX_TENANT_POOLS) evictOldestTenantAiPool();
  pool = new Pool({ connectionString: url, max: 5 });
  pool.on('connect', (client) => {
    client.query(`SET search_path = ${AI_SEARCH_PATH}`).catch(() =>
      client.query('SET search_path = public').catch(() => {})
    );
  });
  tenantAiPoolsByUrl.set(url, pool);
  tenantAiPoolLru.push(url);
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
  { version: 85, file: '085_close_sessions_certified_snapshot_id.sql' },
  { version: 86, file: '086_tenant_evidence_anchoring.sql' },
  { version: 87, file: '087_evidence_links_assertion.sql' },
  { version: 88, file: '088_tenant_evidence_policy.sql' },
  { version: 89, file: '089_certification_artifacts.sql' },
  { version: 90, file: '090_evidence_storage_path.sql' },
  { version: 91, file: '091_append_only_triggers.sql' },
  { version: 92, file: '092_tenant_financial_config.sql' },
  { version: 93, file: '093_ai_boundary_schemas.sql' },
  { version: 94, file: '094_tenant_chart_of_accounts.sql' },
  { version: 95, file: '095_general_ledger.sql' },
  { version: 96, file: '096_period_trial_balance_gl_derived_source.sql' },
  { version: 97, file: '097_gl_performance_indexes.sql' },
  { version: 98, file: '098_close_session_state_machine.sql' },
  { version: 99, file: '099_tenant_close_issues.sql' },
  { version: 100, file: '100_migrate_issues_to_close_issues.sql' },
  { version: 101, file: '101_tenant_recon_requirements.sql' },
  { version: 102, file: '102_tenant_period_reconciliations.sql' },
  { version: 103, file: '103_close_session_statements_stale.sql' },
  { version: 104, file: '104_audit_ledger_before_after_state.sql' },
  { version: 105, file: '105_je_immutability_trigger.sql' },
  { version: 106, file: '106_prevent_posted_je_lines_modification.sql' },
  { version: 107, file: '107_je_memo_required.sql' },
  { version: 108, file: '108_normal_balance_accounts.sql' },
  { version: 109, file: '109_coa_mapping_history.sql' },
  { version: 110, file: '110_statement_package_cash_flow_equity.sql' },
  { version: 111, file: '111_tenant_aje_templates.sql' },
  { version: 112, file: '112_tenant_variance_analysis.sql' },
  { version: 113, file: '113_document_deprecated_tables.sql' },
  { version: 114, file: '114_statement_lines_hierarchy.sql' },
  { version: 115, file: '115_je_rejection_metadata.sql' },
  { version: 116, file: '116_aje_template_skip_reason.sql' },
  { version: 117, file: '117_variance_ai_draft_explanation.sql' },
  { version: 118, file: '118_tenant_entity_settings.sql' },
  { version: 120, file: '120_certification_artifacts_immutability.sql' },
  { version: 121, file: '121_money_column_precision.sql' },
  { version: 122, file: '122_gl_account_name.sql' },
  { version: 123, file: '123_fix_unexplained_variance_sign.sql' },
  { version: 124, file: '124_coa_mapping_cash_flow_class.sql' },
  { version: 125, file: '125_cf_taxonomy_lines.sql' },
  { version: 126, file: '126_oci_discontinued_taxonomy.sql' },
  { version: 127, file: '127_variance_explanation_source.sql' },
  { version: 128, file: '128_audit_ledger_chain_enforcement.sql' },
  { version: 129, file: '129_ai_classification_suggestions.sql' },
  { version: 130, file: '130_reject_zero_zero_je_lines.sql' },
  { version: 131, file: '131_je_balance_trigger_on_post.sql' },
  { version: 132, file: '132_recon_items_total_auto_update.sql' },
  { version: 133, file: '133_je_reversal_support.sql' },
  { version: 134, file: '134_gl_upload_history.sql' },
  { version: 135, file: '135_recon_notes_column.sql' },
  { version: 136, file: '136_recon_prior_period_ref.sql' },
  { version: 137, file: '137_mapping_auto_accept.sql' },
  { version: 138, file: '138_template_auto_apply.sql' },
  { version: 139, file: '139_fiscal_year_end_day.sql' },
  { version: 140, file: '140_cumulative_statement_packages.sql' },
  { version: 141, file: '141_cascade_performance_indexes.sql' },
  { version: 142, file: '142_is_subtotal_hierarchy.sql' },
  { version: 143, file: '143_bs_current_noncurrent.sql' },
  { version: 144, file: '144_multi_currency_gl.sql' },
  { version: 145, file: '145_notifications.sql' },
  { version: 146, file: '146_consolidation_fx_configs.sql' },
  { version: 147, file: '147_gl_health_analysis.sql' },
  { version: 148, file: '148_expanded_taxonomy.sql' },
  { version: 149, file: '149_ai_call_log_metrics.sql' },
  { version: 150, file: '150_recon_item_carry_forward.sql' },
  { version: 151, file: '151_audit_chain_checkpoints.sql' },
  { version: 152, file: '152_xbrl_taxonomy_anchoring.sql' },
  { version: 153, file: '153_xbrl_full_taxonomy.sql' },
  { version: 154, file: '154_gl_account_analysis.sql' },
  { version: 155, file: '155_je_immutability_exported_status.sql' },
  { version: 156, file: '156_audit_ledger_chain_for_update.sql' },
  { version: 164, file: '164_period_budgets.sql' },
  { version: 165, file: '165_ebitda_addbacks.sql' },
  { version: 166, file: '166_recon_source_data.sql' },
  { version: 167, file: '167_cf_classification.sql' },
  { version: 168, file: '168_pe_hierarchy.sql' },
  { version: 169, file: '169_variance_classification.sql' },
  { version: 171, file: '171_pe_manufacturer_taxonomy_lines.sql' },
  { version: 172, file: '172_pgvector_gaap.sql' },
  { version: 173, file: '173_taxonomy_is_hidden.sql' },
  { version: 184, file: '184_row_level_security.sql' },
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

/**
 * Get AI-scoped pool for tenant. Use for AI writes (ai_call_log, tenant_ai_proposals, HITL staging, etc).
 * When AI_BOUNDARY_DB_ROLES=true: returns pool with ai_writer role (cannot write core.*).
 * Otherwise: returns same pool as getTenantPool (no separation, dev/test).
 */
export async function getTenantAiPool(tenantId: string): Promise<pg.Pool> {
  const corePool = await getTenantPool(tenantId);
  if (!isAiBoundaryDbRolesEnabled()) return corePool;
  const control = getControlPool();
  const r = await control.query<{ database_url: string | null }>(
    'SELECT database_url FROM tenants WHERE id = $1',
    [tenantId]
  );
  const tenantDbUrl = r.rows[0]?.database_url ?? null;
  const baseUrl = tenantDbUrl?.trim() || (process.env.DATABASE_URL ?? '');
  const effectiveAiUrl = tenantDbUrl?.trim()
    ? buildAiConnectionUrl(tenantDbUrl)
    : (process.env.DATABASE_AI_URL?.trim() || buildAiConnectionUrl(baseUrl));
  return getOrCreateTenantAiPool(effectiveAiUrl);
}

/** Get AI pool with migrations applied (ensures schema 093 has run). */
export async function getTenantAiPoolWithMigrations(tenantId: string): Promise<pg.Pool> {
  await getTenantPoolWithMigrations(tenantId);
  return getTenantAiPool(tenantId);
}

/**
 * Validate a tenant ID to prevent injection when used in SET commands.
 * Tenant IDs must be UUID-like or simple alphanumeric strings.
 */
function isValidTenantId(tenantId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(tenantId) && tenantId.length <= 128;
}

/**
 * Create a tenant-scoped pool proxy that sets app.current_tenant_id on every
 * connection checkout. This is required for Row-Level Security (RLS) policies
 * that reference current_setting('app.current_tenant_id').
 *
 * The proxy intercepts:
 * - connect(): acquires a client, sets the session variable, returns the client
 * - query(): acquires a client, sets the session variable, runs the query, releases
 *
 * The underlying pool is shared and may serve multiple tenants (shared-DB mode),
 * so the tenant context MUST be set on each checkout, not on pool creation.
 */
export function createTenantScopedPool(pool: pg.Pool, tenantId: string): pg.Pool {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId}`);
  }

  const setTenantContext = `SET app.current_tenant_id = '${tenantId}'`;

  // Wrap connect() to set tenant context on each checkout
  const originalConnect = pool.connect.bind(pool);
  const scopedConnect = async (): Promise<pg.PoolClient> => {
    const client = await originalConnect();
    try {
      await client.query(setTenantContext);
    } catch (err) {
      client.release();
      throw err;
    }
    return client;
  };

  // Wrap query() to set tenant context before each direct query
  const originalQuery = pool.query.bind(pool);
  const scopedQuery = async (...args: unknown[]): Promise<pg.QueryResult> => {
    const client = await originalConnect();
    try {
      await client.query(setTenantContext);
      // pg.Pool.query accepts (text, values?) or (QueryConfig)
      const result = await (client.query as (...a: unknown[]) => Promise<pg.QueryResult>)(...args);
      return result;
    } finally {
      client.release();
    }
  };

  // Create a proxy that intercepts connect and query, passes everything else through
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === 'connect') return scopedConnect;
      if (prop === 'query') return scopedQuery;
      return Reflect.get(target, prop, receiver);
    },
  });
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
  for (const pool of tenantAiPoolsByUrl.values()) {
    await pool.end().catch(() => {});
  }
  tenantAiPoolsByUrl.clear();
  tenantAiPoolLru.length = 0;
}
