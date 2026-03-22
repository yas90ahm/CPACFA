/**
 * tenant_period_reconciliations and tenant_recon_items.
 * Variance, is_within_tolerance, unexplained_variance are DB-generated.
 */

import type { Pool } from 'pg';
import type {
  PeriodReconciliation,
  ReconItem,
  PeriodReconStatus,
  ReconItemType,
} from '../../types/period_reconciliation.js';

interface ReconRow {
  recon_id: string;
  tenant_id: string;
  period_id: string;
  entity_id: string;
  requirement_id: string;
  account_code: string;
  account_name: string | null;
  gl_balance: string | null;
  supporting_balance: string | null;
  variance: string | null;
  tolerance_amount: string;
  is_within_tolerance: boolean | null;
  reconciling_items_total: string;
  unexplained_variance: string | null;
  supporting_source: string | null;
  supporting_document_refs: string[];
  variance_explanation: string | null;
  status: string;
  prepared_by: string | null;
  prepared_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  prior_period_session_id: string | null;
  prior_period_gl_balance: string | null;
  prior_period_supporting_balance: string | null;
  copied_from_prior: boolean;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  item_id: string;
  recon_id: string;
  description: string;
  amount: string;
  item_type: string;
  needs_aje: boolean;
  aje_id: string | null;
  created_at: string;
  created_by: string | null;
  carried_from_period: string | null;
  original_created_at: string | null;
  resolved_at: string | null;
}

const RECON_COLS = `recon_id, tenant_id, period_id, entity_id, requirement_id, account_code,
  gl_balance, supporting_balance, variance, tolerance_amount, is_within_tolerance, reconciling_items_total,
  unexplained_variance, supporting_source, supporting_document_refs, variance_explanation,
  status, prepared_by, prepared_at, reviewed_by, reviewed_at, notes,
  prior_period_session_id, prior_period_gl_balance, prior_period_supporting_balance, copied_from_prior,
  created_at, updated_at`;

function rowToRecon(r: ReconRow): PeriodReconciliation {
  return {
    reconId: r.recon_id,
    tenantId: r.tenant_id,
    periodId: r.period_id,
    entityId: r.entity_id,
    requirementId: r.requirement_id,
    accountCode: r.account_code,
    accountName: r.account_name ?? null,
    glBalance: r.gl_balance,
    supportingBalance: r.supporting_balance,
    variance: r.variance,
    toleranceAmount: r.tolerance_amount,
    isWithinTolerance: r.is_within_tolerance,
    reconcilingItemsTotal: r.reconciling_items_total,
    unexplainedVariance: r.unexplained_variance,
    supportingSource: r.supporting_source,
    supportingDocumentRefs: r.supporting_document_refs ?? [],
    varianceExplanation: r.variance_explanation,
    status: r.status as PeriodReconStatus,
    preparedBy: r.prepared_by,
    preparedAt: r.prepared_at,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    notes: r.notes ?? null,
    priorPeriodSessionId: r.prior_period_session_id ?? null,
    priorPeriodGlBalance: r.prior_period_gl_balance ?? null,
    priorPeriodSupportingBalance: r.prior_period_supporting_balance ?? null,
    copiedFromPrior: r.copied_from_prior ?? false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToItem(r: ItemRow): ReconItem {
  return {
    itemId: r.item_id,
    reconId: r.recon_id,
    description: r.description,
    amount: r.amount,
    itemType: r.item_type as ReconItem['itemType'],
    needsAje: r.needs_aje,
    ajeId: r.aje_id,
    createdAt: r.created_at,
    createdBy: r.created_by,
    carriedFromPeriod: r.carried_from_period ?? null,
    originalCreatedAt: r.original_created_at ?? null,
    resolvedAt: r.resolved_at ?? null,
  };
}

export async function insertPeriodReconciliation(
  pool: Pool,
  reconId: string,
  input: {
    tenantId: string;
    periodId: string;
    entityId: string;
    requirementId: string;
    accountCode: string;
    glBalance?: number | string | null;
    toleranceAmount: number | string;
  }
): Promise<PeriodReconciliation> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tenant_period_reconciliations (
      recon_id, tenant_id, period_id, entity_id, requirement_id, account_code,
      gl_balance, tolerance_amount, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
    ON CONFLICT (period_id, account_code) DO NOTHING`,
    [
      reconId,
      input.tenantId,
      input.periodId,
      input.entityId,
      input.requirementId,
      input.accountCode,
      input.glBalance != null ? String(input.glBalance) : null,
      String(input.toleranceAmount),
      now,
    ]
  );
  const rec = await getPeriodReconciliationById(pool, input.tenantId, reconId);
  if (!rec) throw new Error('Failed to fetch recon after insert');
  return rec;
}

export async function getPeriodReconciliationById(
  pool: Pool,
  tenantId: string,
  reconId: string
): Promise<PeriodReconciliation | null> {
  const r = await pool.query<ReconRow>(
    `SELECT r.recon_id, r.tenant_id, r.period_id, r.entity_id, r.requirement_id, r.account_code,
       req.account_name,
       r.gl_balance, r.supporting_balance, r.variance, r.tolerance_amount, r.is_within_tolerance,
       r.reconciling_items_total, r.unexplained_variance, r.supporting_source, r.supporting_document_refs,
       r.variance_explanation, r.status, r.prepared_by, r.prepared_at, r.reviewed_by, r.reviewed_at,
       r.notes, r.prior_period_session_id, r.prior_period_gl_balance, r.prior_period_supporting_balance,
       r.copied_from_prior, r.created_at, r.updated_at
     FROM tenant_period_reconciliations r
     LEFT JOIN tenant_recon_requirements req ON r.requirement_id = req.requirement_id
     WHERE r.tenant_id = $1 AND r.recon_id = $2`,
    [tenantId, reconId]
  );
  const row = r.rows[0];
  return row ? rowToRecon(row) : null;
}

export async function listPeriodReconciliationsByPeriod(
  pool: Pool,
  tenantId: string,
  periodId: string
): Promise<PeriodReconciliation[]> {
  const r = await pool.query<ReconRow>(
    `SELECT r.recon_id, r.tenant_id, r.period_id, r.entity_id, r.requirement_id, r.account_code,
       req.account_name,
       r.gl_balance, r.supporting_balance, r.variance, r.tolerance_amount, r.is_within_tolerance,
       r.reconciling_items_total, r.unexplained_variance, r.supporting_source, r.supporting_document_refs,
       r.variance_explanation, r.status, r.prepared_by, r.prepared_at, r.reviewed_by, r.reviewed_at,
       r.notes, r.prior_period_session_id, r.prior_period_gl_balance, r.prior_period_supporting_balance,
       r.copied_from_prior, r.created_at, r.updated_at
     FROM tenant_period_reconciliations r
     LEFT JOIN tenant_recon_requirements req ON r.requirement_id = req.requirement_id
     WHERE r.tenant_id = $1 AND r.period_id = $2
     ORDER BY r.account_code`,
    [tenantId, periodId]
  );
  return r.rows.map(rowToRecon);
}

export async function getPeriodReconciliationByPeriodAndAccount(
  pool: Pool,
  tenantId: string,
  periodId: string,
  accountCode: string
): Promise<PeriodReconciliation | null> {
  const r = await pool.query<ReconRow>(
    `SELECT ${RECON_COLS} FROM tenant_period_reconciliations WHERE tenant_id = $1 AND period_id = $2 AND account_code = $3`,
    [tenantId, periodId, accountCode]
  );
  const row = r.rows[0];
  return row ? rowToRecon(row) : null;
}

export async function updateReconSupportingBalance(
  pool: Pool,
  tenantId: string,
  reconId: string,
  supportingBalance: string,
  supportingSource: string | null
): Promise<PeriodReconciliation | null> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE tenant_period_reconciliations
     SET supporting_balance = $1, supporting_source = $2, updated_at = $3,
         status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END
     WHERE tenant_id = $4 AND recon_id = $5`,
    [supportingBalance, supportingSource, now, tenantId, reconId]
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getPeriodReconciliationById(pool, tenantId, reconId);
}

export async function updateReconGLBalance(
  pool: Pool,
  tenantId: string,
  reconId: string,
  glBalance: string | null
): Promise<PeriodReconciliation | null> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE tenant_period_reconciliations SET gl_balance = $1, updated_at = $2 WHERE tenant_id = $3 AND recon_id = $4`,
    [glBalance, now, tenantId, reconId]
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getPeriodReconciliationById(pool, tenantId, reconId);
}

/**
 * Batch-update GL balances for multiple recons in a single query.
 * Returns all updated recons with refreshed computed columns.
 */
export async function batchUpdateReconGLBalances(
  pool: Pool,
  tenantId: string,
  periodId: string,
  updates: Array<{ reconId: string; glBalance: string | null }>
): Promise<PeriodReconciliation[]> {
  if (updates.length === 0) return [];
  const now = new Date().toISOString();

  // Build a single UPDATE ... FROM VALUES batch
  const values: unknown[] = [now, tenantId];
  const valueClauses: string[] = [];
  let idx = 3;
  for (const u of updates) {
    valueClauses.push(`($${idx}::uuid, $${idx + 1}::numeric)`);
    values.push(u.reconId, u.glBalance);
    idx += 2;
  }

  await pool.query(
    `UPDATE tenant_period_reconciliations AS r
     SET gl_balance = v.gl_balance, updated_at = $1
     FROM (VALUES ${valueClauses.join(', ')}) AS v(recon_id, gl_balance)
     WHERE r.tenant_id = $2 AND r.recon_id = v.recon_id`,
    values
  );

  // Fetch all updated recons in one query
  return listPeriodReconciliationsByPeriod(pool, tenantId, periodId);
}

export async function updateReconReconcilingItemsTotal(
  pool: Pool,
  tenantId: string,
  reconId: string,
  total: string
): Promise<PeriodReconciliation | null> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE tenant_period_reconciliations SET reconciling_items_total = $1, updated_at = $2 WHERE tenant_id = $3 AND recon_id = $4`,
    [total, now, tenantId, reconId]
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getPeriodReconciliationById(pool, tenantId, reconId);
}

export async function updateReconStatus(
  pool: Pool,
  tenantId: string,
  reconId: string,
  status: PeriodReconStatus,
  extra: {
    varianceExplanation?: string | null;
    preparedBy?: string | null;
    preparedAt?: string | null;
    reviewedBy?: string | null;
    reviewedAt?: string | null;
    /** Expected current status — row-level guard to prevent concurrent overwrites. */
    expectedStatus?: PeriodReconStatus;
  } = {}
): Promise<PeriodReconciliation | null> {
  const now = new Date().toISOString();
  const sets: string[] = ['status = $1', 'updated_at = $2'];
  const params: unknown[] = [status, now];
  let i = 3;
  if (extra.varianceExplanation !== undefined) {
    sets.push(`variance_explanation = $${i++}`);
    params.push(extra.varianceExplanation);
  }
  if (extra.preparedBy !== undefined) {
    sets.push(`prepared_by = $${i++}`, `prepared_at = $${i++}`);
    params.push(extra.preparedBy, extra.preparedAt ?? now);
  }
  if (extra.reviewedBy !== undefined) {
    sets.push(`reviewed_by = $${i++}`, `reviewed_at = $${i++}`);
    params.push(extra.reviewedBy, extra.reviewedAt ?? now);
  }
  params.push(tenantId, reconId);
  let sql = `UPDATE tenant_period_reconciliations SET ${sets.join(', ')} WHERE tenant_id = $${i} AND recon_id = $${i + 1}`;
  if (extra.expectedStatus) {
    i += 2;
    sql += ` AND status = $${i}`;
    params.push(extra.expectedStatus);
  }
  const r = await pool.query(sql, params);
  if ((r.rowCount ?? 0) === 0) return null;
  return getPeriodReconciliationById(pool, tenantId, reconId);
}

/** Get recons from the most recent CERTIFIED session for the same entity (prior period). */
export async function getPriorPeriodRecons(
  pool: Pool,
  tenantId: string,
  entityId: string,
  excludeSessionId: string
): Promise<PeriodReconciliation[]> {
  // Find the most recent CERTIFIED (or LOCKED) session for the same entity
  const sessionResult = await pool.query<{ id: string }>(
    `SELECT id FROM close_sessions
     WHERE tenant_id = $1 AND entity_id = $2 AND id != $3
       AND status IN ('certified', 'locked')
     ORDER BY period_end DESC LIMIT 1`,
    [tenantId, entityId, excludeSessionId]
  );
  if (sessionResult.rows.length === 0) return [];
  const priorSessionId = sessionResult.rows[0].id;
  return listPeriodReconciliationsByPeriod(pool, tenantId, priorSessionId);
}

/** Copy prior period data into a reconciliation record. */
export async function copyFromPriorPeriod(
  pool: Pool,
  tenantId: string,
  reconId: string,
  priorRecon: PeriodReconciliation
): Promise<PeriodReconciliation | null> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE tenant_period_reconciliations
     SET prior_period_session_id = $1,
         prior_period_gl_balance = $2,
         prior_period_supporting_balance = $3,
         supporting_balance = $4,
         supporting_source = $5,
         copied_from_prior = TRUE,
         status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
         updated_at = $6
     WHERE tenant_id = $7 AND recon_id = $8`,
    [
      priorRecon.periodId,
      priorRecon.glBalance,
      priorRecon.supportingBalance,
      priorRecon.supportingBalance,
      priorRecon.supportingSource,
      now,
      tenantId,
      reconId,
    ]
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getPeriodReconciliationById(pool, tenantId, reconId);
}

/** Set prior period reference fields (without copying balances). */
export async function setPriorPeriodRef(
  pool: Pool,
  tenantId: string,
  reconId: string,
  priorSessionId: string,
  priorGlBalance: string | null,
  priorSupportingBalance: string | null
): Promise<void> {
  await pool.query(
    `UPDATE tenant_period_reconciliations
     SET prior_period_session_id = $1,
         prior_period_gl_balance = $2,
         prior_period_supporting_balance = $3
     WHERE tenant_id = $4 AND recon_id = $5`,
    [priorSessionId, priorGlBalance, priorSupportingBalance, tenantId, reconId]
  );
}

export async function updateReconNotes(
  pool: Pool,
  tenantId: string,
  reconId: string,
  notes: string | null
): Promise<PeriodReconciliation | null> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE tenant_period_reconciliations SET notes = $1, updated_at = $2 WHERE tenant_id = $3 AND recon_id = $4`,
    [notes, now, tenantId, reconId]
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getPeriodReconciliationById(pool, tenantId, reconId);
}

export async function insertReconItem(
  pool: Pool,
  itemId: string,
  input: {
    reconId: string;
    description: string;
    amount: number | string;
    itemType: ReconItemType;
    needsAje?: boolean;
    createdBy?: string | null;
  }
): Promise<ReconItem> {
  await pool.query(
    `INSERT INTO tenant_recon_items (item_id, recon_id, description, amount, item_type, needs_aje, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      itemId,
      input.reconId,
      input.description,
      String(input.amount),
      input.itemType,
      input.needsAje ?? false,
      input.createdBy ?? null,
    ]
  );
  const item = await getReconItemById(pool, itemId);
  if (!item) throw new Error('Failed to fetch item after insert');
  return item;
}

export async function getReconItemById(pool: Pool, itemId: string): Promise<ReconItem | null> {
  const r = await pool.query<ItemRow>(
    `SELECT item_id, recon_id, description, amount, item_type, needs_aje, aje_id, created_at, created_by,
            carried_from_period, original_created_at, resolved_at
     FROM tenant_recon_items WHERE item_id = $1`,
    [itemId]
  );
  const row = r.rows[0];
  return row ? rowToItem(row) : null;
}

export async function listReconItemsByReconId(pool: Pool, reconId: string): Promise<ReconItem[]> {
  const r = await pool.query<ItemRow>(
    `SELECT item_id, recon_id, description, amount, item_type, needs_aje, aje_id, created_at, created_by,
            carried_from_period, original_created_at, resolved_at
     FROM tenant_recon_items WHERE recon_id = $1 ORDER BY created_at`,
    [reconId]
  );
  return r.rows.map(rowToItem);
}

export async function deleteReconItem(pool: Pool, itemId: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM tenant_recon_items WHERE item_id = $1', [itemId]);
  return (r.rowCount ?? 0) > 0;
}

export async function updateReconItemAjeId(
  pool: Pool,
  itemId: string,
  ajeId: string | null
): Promise<boolean> {
  const r = await pool.query(
    'UPDATE tenant_recon_items SET needs_aje = true, aje_id = $1 WHERE item_id = $2',
    [ajeId, itemId]
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Copy reconciling items from a prior-period recon to the current recon.
 * AJE links are cleared since AJEs are period-specific.
 */
export async function copyReconItemsFromPrior(
  pool: Pool,
  currentReconId: string,
  priorReconId: string,
  createdBy: string | null
): Promise<ReconItem[]> {
  const priorItems = await listReconItemsByReconId(pool, priorReconId);
  if (priorItems.length === 0) return [];

  const created: ReconItem[] = [];
  for (const item of priorItems) {
    const newId = crypto.randomUUID();
    const newItem = await insertReconItem(pool, newId, {
      reconId: currentReconId,
      description: `[Carried forward] ${item.description}`,
      amount: item.amount,
      itemType: item.itemType,
      needsAje: item.needsAje,
      createdBy,
    });
    created.push(newItem);
  }
  return created;
}

/**
 * Carry forward unresolved items from one session's recons to another session's recons.
 * Only copies items where resolved_at IS NULL. Sets carried_from_period and original_created_at.
 */
export async function carryForwardUnresolvedItems(
  pool: Pool,
  tenantId: string,
  fromSessionId: string,
  toSessionId: string
): Promise<ReconItem[]> {
  // Get all recons for source session
  const fromRecons = await listPeriodReconciliationsByPeriod(pool, tenantId, fromSessionId);
  const toRecons = await listPeriodReconciliationsByPeriod(pool, tenantId, toSessionId);
  const toByAccount = new Map(toRecons.map((r) => [r.accountCode, r]));

  // Get the source session's period label
  const sessResult = await pool.query<{ period_end: string | null }>(
    `SELECT period_end FROM close_sessions WHERE id = $1 AND tenant_id = $2`,
    [fromSessionId, tenantId]
  );
  const fromPeriodLabel = (sessResult.rows[0]?.period_end ?? '').slice(0, 7);

  const created: ReconItem[] = [];

  for (const fromRecon of fromRecons) {
    const toRecon = toByAccount.get(fromRecon.accountCode);
    if (!toRecon) continue; // No matching recon in target session

    // Get unresolved items from source recon
    const items = await listReconItemsByReconId(pool, fromRecon.reconId);
    const unresolvedItems = items.filter((i) => i.resolvedAt === null);

    for (const item of unresolvedItems) {
      const newId = crypto.randomUUID();
      const originalCreatedAt = item.originalCreatedAt ?? item.createdAt;
      await pool.query(
        `INSERT INTO tenant_recon_items
           (item_id, recon_id, description, amount, item_type, needs_aje, created_by,
            carried_from_period, original_created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newId,
          toRecon.reconId,
          `[Carried forward] ${item.description.replace(/^\[Carried forward\] /, '')}`,
          item.amount,
          item.itemType,
          false, // AJE links are period-specific, clear them
          item.createdBy,
          fromPeriodLabel,
          originalCreatedAt,
        ]
      );
      const newItem = await getReconItemById(pool, newId);
      if (newItem) created.push(newItem);
    }
  }
  return created;
}

/**
 * Resolve (clear) a reconciling item by setting resolved_at.
 */
export async function resolveReconItem(
  pool: Pool,
  tenantId: string,
  itemId: string
): Promise<ReconItem | null> {
  // Verify the item belongs to a recon owned by this tenant
  const itemResult = await pool.query<{ recon_id: string }>(
    `SELECT ri.recon_id FROM tenant_recon_items ri
     JOIN tenant_period_reconciliations r ON r.recon_id = ri.recon_id
     WHERE ri.item_id = $1 AND r.tenant_id = $2`,
    [itemId, tenantId]
  );
  if (itemResult.rows.length === 0) return null;

  await pool.query(
    `UPDATE tenant_recon_items SET resolved_at = NOW() WHERE item_id = $1`,
    [itemId]
  );
  return getReconItemById(pool, itemId);
}
