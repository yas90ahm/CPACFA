/**
 * Business combination repository.
 */

import type { Pool } from 'pg';

export interface AcquisitionRow {
  id: string;
  tenantId: string;
  acquisitionName: string;
  acquisitionDate: string;
  acquireeName: string;
  purchasePrice: string;
  cashConsideration?: string;
  stockConsideration?: string;
  contingentConsideration?: string;
  fairValueNetAssets?: string;
  goodwill?: string;
  bargainPurchaseGain?: string;
  status: 'in_progress' | 'completed' | 'finalized';
  measurementPeriodEnd?: string;
  notes?: string;
  createdAt: string;
}

export interface PPALineItemRow {
  id: string;
  tenantId: string;
  acquisitionId: string;
  itemType: 'asset' | 'liability' | 'intangible';
  description: string;
  bookValue?: string;
  fairValue?: string;
  fairValueAdjustment?: string;
  valuationMethod?: string;
  usefulLifeYears?: number;
  notes?: string;
  createdAt: string;
}

export interface ContingentConsiderationRow {
  id: string;
  tenantId: string;
  acquisitionId: string;
  earnOutType: 'revenue' | 'ebitda' | 'retention' | 'milestone';
  targetMetric?: string;
  targetValue?: string;
  maxPayout?: string;
  fairValueAtAcquisition?: string;
  currentFairValue?: string;
  probabilityWeighted: boolean;
  scenarios?: Array<{ probability: number; payout: number }>;
  notes?: string;
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createAcquisition(pool: Pool, tenantId: string, acq: Omit<AcquisitionRow, 'id' | 'createdAt' | 'tenantId'>): Promise<AcquisitionRow> {
  const id = nextId('acq');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO acquisitions (id, tenant_id, acquisition_name, acquisition_date, acquiree_name, purchase_price, cash_consideration, stock_consideration, contingent_consideration, fair_value_net_assets, goodwill, bargain_purchase_gain, status, measurement_period_end, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [id, tenantId, acq.acquisitionName, acq.acquisitionDate, acq.acquireeName, acq.purchasePrice, acq.cashConsideration ?? null, acq.stockConsideration ?? null, acq.contingentConsideration ?? null, acq.fairValueNetAssets ?? null, acq.goodwill ?? null, acq.bargainPurchaseGain ?? null, acq.status ?? 'in_progress', acq.measurementPeriodEnd ?? null, acq.notes ?? null, now]
  );
  return { id, tenantId, ...acq, createdAt: now };
}

export async function getAcquisition(pool: Pool, tenantId: string, id: string): Promise<AcquisitionRow | null> {
  const r = await pool.query('SELECT * FROM acquisitions WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return { id: row.id, tenantId: row.tenant_id, acquisitionName: row.acquisition_name, acquisitionDate: row.acquisition_date, acquireeName: row.acquiree_name, purchasePrice: String(row.purchase_price), cashConsideration: row.cash_consideration != null ? String(row.cash_consideration) : undefined, stockConsideration: row.stock_consideration != null ? String(row.stock_consideration) : undefined, contingentConsideration: row.contingent_consideration != null ? String(row.contingent_consideration) : undefined, fairValueNetAssets: row.fair_value_net_assets != null ? String(row.fair_value_net_assets) : undefined, goodwill: row.goodwill != null ? String(row.goodwill) : undefined, bargainPurchaseGain: row.bargain_purchase_gain != null ? String(row.bargain_purchase_gain) : undefined, status: row.status, measurementPeriodEnd: row.measurement_period_end, notes: row.notes, createdAt: row.created_at };
}

export async function listAcquisitions(pool: Pool, tenantId: string): Promise<AcquisitionRow[]> {
  const r = await pool.query('SELECT * FROM acquisitions WHERE tenant_id = $1 ORDER BY acquisition_date DESC', [tenantId]);
  return r.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, acquisitionName: row.acquisition_name, acquisitionDate: row.acquisition_date, acquireeName: row.acquiree_name, purchasePrice: String(row.purchase_price), cashConsideration: row.cash_consideration != null ? String(row.cash_consideration) : undefined, stockConsideration: row.stock_consideration != null ? String(row.stock_consideration) : undefined, contingentConsideration: row.contingent_consideration != null ? String(row.contingent_consideration) : undefined, fairValueNetAssets: row.fair_value_net_assets != null ? String(row.fair_value_net_assets) : undefined, goodwill: row.goodwill != null ? String(row.goodwill) : undefined, bargainPurchaseGain: row.bargain_purchase_gain != null ? String(row.bargain_purchase_gain) : undefined, status: row.status, measurementPeriodEnd: row.measurement_period_end, notes: row.notes, createdAt: row.created_at }));
}

export async function deleteAcquisition(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM acquisitions WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

export async function addPPALineItem(pool: Pool, tenantId: string, item: Omit<PPALineItemRow, 'id' | 'createdAt' | 'tenantId'>): Promise<PPALineItemRow> {
  const id = nextId('ppa');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO ppa_line_items (id, tenant_id, acquisition_id, item_type, description, book_value, fair_value, fair_value_adjustment, valuation_method, useful_life_years, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, tenantId, item.acquisitionId, item.itemType, item.description, item.bookValue ?? null, item.fairValue ?? null, item.fairValueAdjustment ?? null, item.valuationMethod ?? null, item.usefulLifeYears ?? null, item.notes ?? null, now]
  );
  return { id, tenantId, ...item, createdAt: now };
}

export async function listPPALineItems(pool: Pool, tenantId: string, acquisitionId: string): Promise<PPALineItemRow[]> {
  const r = await pool.query('SELECT * FROM ppa_line_items WHERE tenant_id = $1 AND acquisition_id = $2 ORDER BY item_type, description', [tenantId, acquisitionId]);
  return r.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, acquisitionId: row.acquisition_id, itemType: row.item_type, description: row.description, bookValue: row.book_value != null ? String(row.book_value) : undefined, fairValue: row.fair_value != null ? String(row.fair_value) : undefined, fairValueAdjustment: row.fair_value_adjustment != null ? String(row.fair_value_adjustment) : undefined, valuationMethod: row.valuation_method, usefulLifeYears: row.useful_life_years != null ? Number(row.useful_life_years) : undefined, notes: row.notes, createdAt: row.created_at }));
}

export async function addContingentConsideration(pool: Pool, tenantId: string, cc: Omit<ContingentConsiderationRow, 'id' | 'createdAt' | 'tenantId'>): Promise<ContingentConsiderationRow> {
  const id = nextId('cc');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO contingent_consideration (id, tenant_id, acquisition_id, earn_out_type, target_metric, target_value, max_payout, fair_value_at_acquisition, current_fair_value, probability_weighted, scenarios, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [id, tenantId, cc.acquisitionId, cc.earnOutType, cc.targetMetric ?? null, cc.targetValue ?? null, cc.maxPayout ?? null, cc.fairValueAtAcquisition ?? null, cc.currentFairValue ?? null, cc.probabilityWeighted ?? true, cc.scenarios ? JSON.stringify(cc.scenarios) : null, cc.notes ?? null, now]
  );
  return { id, tenantId, ...cc, createdAt: now };
}

export async function listContingentConsideration(pool: Pool, tenantId: string, acquisitionId: string): Promise<ContingentConsiderationRow[]> {
  const r = await pool.query('SELECT * FROM contingent_consideration WHERE tenant_id = $1 AND acquisition_id = $2 ORDER BY created_at', [tenantId, acquisitionId]);
  return r.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, acquisitionId: row.acquisition_id, earnOutType: row.earn_out_type, targetMetric: row.target_metric, targetValue: row.target_value != null ? String(row.target_value) : undefined, maxPayout: row.max_payout != null ? String(row.max_payout) : undefined, fairValueAtAcquisition: row.fair_value_at_acquisition != null ? String(row.fair_value_at_acquisition) : undefined, currentFairValue: row.current_fair_value != null ? String(row.current_fair_value) : undefined, probabilityWeighted: row.probability_weighted, scenarios: row.scenarios, notes: row.notes, createdAt: row.created_at }));
}
