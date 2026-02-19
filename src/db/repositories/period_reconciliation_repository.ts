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
}

const RECON_COLS = `recon_id, tenant_id, period_id, entity_id, requirement_id, account_code,
  gl_balance, supporting_balance, variance, tolerance_amount, is_within_tolerance, reconciling_items_total,
  unexplained_variance, supporting_source, supporting_document_refs, variance_explanation,
  status, prepared_by, prepared_at, reviewed_by, reviewed_at, created_at, updated_at`;

function rowToRecon(r: ReconRow): PeriodReconciliation {
  return {
    reconId: r.recon_id,
    tenantId: r.tenant_id,
    periodId: r.period_id,
    entityId: r.entity_id,
    requirementId: r.requirement_id,
    accountCode: r.account_code,
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
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
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
    `SELECT ${RECON_COLS} FROM tenant_period_reconciliations WHERE tenant_id = $1 AND recon_id = $2`,
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
    `SELECT ${RECON_COLS} FROM tenant_period_reconciliations WHERE tenant_id = $1 AND period_id = $2 ORDER BY account_code`,
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
  const r = await pool.query(
    `UPDATE tenant_period_reconciliations SET ${sets.join(', ')} WHERE tenant_id = $${i} AND recon_id = $${i + 1}`,
    params
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
    `SELECT item_id, recon_id, description, amount, item_type, needs_aje, aje_id, created_at, created_by
     FROM tenant_recon_items WHERE item_id = $1`,
    [itemId]
  );
  const row = r.rows[0];
  return row ? rowToItem(row) : null;
}

export async function listReconItemsByReconId(pool: Pool, reconId: string): Promise<ReconItem[]> {
  const r = await pool.query<ItemRow>(
    `SELECT item_id, recon_id, description, amount, item_type, needs_aje, aje_id, created_at, created_by
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
