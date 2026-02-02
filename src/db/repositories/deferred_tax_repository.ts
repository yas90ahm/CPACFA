/**
 * Deferred tax repository — temporary differences, valuation allowance, rate changes (IAS 12 / ASC 740).
 */

import type { Pool } from 'pg';

export interface DeferredTaxItemRow {
  id: string;
  tenantId: string;
  periodLabel: string;
  itemType: 'temporary_difference' | 'nol_carryforward' | 'tax_credit';
  description: string;
  bookBasis?: number;
  taxBasis?: number;
  temporaryDifference?: number;
  taxRate?: number;
  deferredTaxAsset?: number;
  deferredTaxLiability?: number;
  reversalPattern?: '1_year' | '2_5_years' | 'indefinite';
  sourceAccount?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ValuationAllowanceRow {
  id: string;
  tenantId: string;
  periodLabel: string;
  deferredTaxAssetGross: number;
  valuationAllowance: number;
  deferredTaxAssetNet: number;
  assessment: string;
  factors?: { positiveSources?: string[]; negativeSources?: string[]; rationale?: string };
  createdAt: string;
}

export interface RateChangeRow {
  id: string;
  tenantId: string;
  periodLabel: string;
  oldRate?: number;
  newRate?: number;
  enactmentDate?: string;
  impactAmount?: number;
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToItem(row: any): DeferredTaxItemRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label,
    itemType: row.item_type,
    description: row.description,
    bookBasis: row.book_basis != null ? Number(row.book_basis) : undefined,
    taxBasis: row.tax_basis != null ? Number(row.tax_basis) : undefined,
    temporaryDifference: row.temporary_difference != null ? Number(row.temporary_difference) : undefined,
    taxRate: row.tax_rate != null ? Number(row.tax_rate) : undefined,
    deferredTaxAsset: row.deferred_tax_asset != null ? Number(row.deferred_tax_asset) : undefined,
    deferredTaxLiability: row.deferred_tax_liability != null ? Number(row.deferred_tax_liability) : undefined,
    reversalPattern: row.reversal_pattern ?? undefined,
    sourceAccount: row.source_account ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createDeferredTaxItem(
  pool: Pool,
  tenantId: string,
  item: Omit<DeferredTaxItemRow, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>
): Promise<DeferredTaxItemRow> {
  const id = nextId('dti');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO deferred_tax_items (id, tenant_id, period_label, item_type, description, book_basis, tax_basis, temporary_difference, tax_rate, deferred_tax_asset, deferred_tax_liability, reversal_pattern, source_account, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id, tenantId, item.periodLabel, item.itemType, item.description, item.bookBasis ?? null, item.taxBasis ?? null,
      item.temporaryDifference ?? null, item.taxRate ?? null, item.deferredTaxAsset ?? null, item.deferredTaxLiability ?? null,
      item.reversalPattern ?? null, item.sourceAccount ?? null, item.notes ?? null, now, now,
    ]
  );
  return { id, tenantId, ...item, createdAt: now, updatedAt: now };
}

export async function listDeferredTaxItems(pool: Pool, tenantId: string, periodLabel?: string): Promise<DeferredTaxItemRow[]> {
  let sql = 'SELECT * FROM deferred_tax_items WHERE tenant_id = $1';
  const params: unknown[] = [tenantId];
  if (periodLabel) {
    sql += ' AND period_label = $2';
    params.push(periodLabel);
  }
  sql += ' ORDER BY created_at';
  const r = await pool.query(sql, params);
  return r.rows.map(rowToItem);
}

export async function getDeferredTaxItem(pool: Pool, tenantId: string, id: string): Promise<DeferredTaxItemRow | null> {
  const r = await pool.query('SELECT * FROM deferred_tax_items WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return r.rows[0] ? rowToItem(r.rows[0]) : null;
}

export async function updateDeferredTaxItem(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<DeferredTaxItemRow>
): Promise<DeferredTaxItemRow | null> {
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = $2'];
  const params: unknown[] = [id, now];
  let idx = 3;
  if (patch.bookBasis !== undefined) { updates.push(`book_basis = $${idx++}`); params.push(patch.bookBasis); }
  if (patch.taxBasis !== undefined) { updates.push(`tax_basis = $${idx++}`); params.push(patch.taxBasis); }
  if (patch.temporaryDifference !== undefined) { updates.push(`temporary_difference = $${idx++}`); params.push(patch.temporaryDifference); }
  if (patch.taxRate !== undefined) { updates.push(`tax_rate = $${idx++}`); params.push(patch.taxRate); }
  if (patch.deferredTaxAsset !== undefined) { updates.push(`deferred_tax_asset = $${idx++}`); params.push(patch.deferredTaxAsset); }
  if (patch.deferredTaxLiability !== undefined) { updates.push(`deferred_tax_liability = $${idx++}`); params.push(patch.deferredTaxLiability); }
  if (patch.notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(patch.notes); }
  params.push(tenantId);
  await pool.query(`UPDATE deferred_tax_items SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx}`, params);
  return getDeferredTaxItem(pool, tenantId, id);
}

export async function deleteDeferredTaxItem(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM deferred_tax_items WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

// Valuation Allowance
export async function createValuationAllowance(
  pool: Pool,
  tenantId: string,
  allowance: Omit<ValuationAllowanceRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<ValuationAllowanceRow> {
  const id = nextId('dva');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO deferred_tax_valuation_allowance (id, tenant_id, period_label, deferred_tax_asset_gross, valuation_allowance, deferred_tax_asset_net, assessment, factors, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, tenantId, allowance.periodLabel, allowance.deferredTaxAssetGross, allowance.valuationAllowance, allowance.deferredTaxAssetNet, allowance.assessment, allowance.factors ? JSON.stringify(allowance.factors) : null, now]
  );
  return { id, tenantId, ...allowance, createdAt: now };
}

export async function listValuationAllowances(pool: Pool, tenantId: string, periodLabel?: string): Promise<ValuationAllowanceRow[]> {
  let sql = 'SELECT * FROM deferred_tax_valuation_allowance WHERE tenant_id = $1';
  const params: unknown[] = [tenantId];
  if (periodLabel) {
    sql += ' AND period_label = $2';
    params.push(periodLabel);
  }
  sql += ' ORDER BY created_at DESC';
  const r = await pool.query(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label,
    deferredTaxAssetGross: Number(row.deferred_tax_asset_gross),
    valuationAllowance: Number(row.valuation_allowance),
    deferredTaxAssetNet: Number(row.deferred_tax_asset_net),
    assessment: row.assessment,
    factors: row.factors ?? undefined,
    createdAt: row.created_at,
  }));
}

// Rate Changes
export async function createRateChange(
  pool: Pool,
  tenantId: string,
  rateChange: Omit<RateChangeRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<RateChangeRow> {
  const id = nextId('drc');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO deferred_tax_rate_changes (id, tenant_id, period_label, old_rate, new_rate, enactment_date, impact_amount, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, tenantId, rateChange.periodLabel, rateChange.oldRate ?? null, rateChange.newRate ?? null, rateChange.enactmentDate ?? null, rateChange.impactAmount ?? null, now]
  );
  return { id, tenantId, ...rateChange, createdAt: now };
}

export async function listRateChanges(pool: Pool, tenantId: string): Promise<RateChangeRow[]> {
  const r = await pool.query('SELECT * FROM deferred_tax_rate_changes WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label,
    oldRate: row.old_rate != null ? Number(row.old_rate) : undefined,
    newRate: row.new_rate != null ? Number(row.new_rate) : undefined,
    enactmentDate: row.enactment_date ?? undefined,
    impactAmount: row.impact_amount != null ? Number(row.impact_amount) : undefined,
    createdAt: row.created_at,
  }));
}
