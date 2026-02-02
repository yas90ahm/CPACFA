/**
 * Segment reporting repository — operating segments, financials, reconciliation (IFRS 8 / ASC 280).
 */

import type { Pool } from 'pg';

export interface OperatingSegmentRow {
  id: string;
  tenantId: string;
  segmentName: string;
  description?: string;
  codmReportBasis?: string;
  aggregationCriteria?: string;
  isReportable: boolean;
  createdAt: string;
}

export interface SegmentFinancialsRow {
  id: string;
  tenantId: string;
  segmentId: string;
  periodLabel: string;
  revenue?: number;
  intersegmentRevenue?: number;
  externalRevenue?: number;
  profitLoss?: number;
  assets?: number;
  liabilities?: number;
  capitalExpenditures?: number;
  depreciation?: number;
  createdAt: string;
}

export interface ReconcilingItem {
  description: string;
  amount: number;
}

export interface SegmentReconciliationRow {
  id: string;
  tenantId: string;
  periodLabel: string;
  itemType: 'revenue' | 'profit' | 'assets';
  segmentTotal: number;
  consolidatedTotal: number;
  reconcilingItems: ReconcilingItem[];
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Operating Segments CRUD
export async function createSegment(
  pool: Pool,
  tenantId: string,
  segment: Omit<OperatingSegmentRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<OperatingSegmentRow> {
  const id = nextId('seg');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO operating_segments (id, tenant_id, segment_name, description, codm_report_basis, aggregation_criteria, is_reportable, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, tenantId, segment.segmentName, segment.description ?? null, segment.codmReportBasis ?? null, segment.aggregationCriteria ?? null, segment.isReportable ?? true, now]
  );
  return { id, tenantId, ...segment, isReportable: segment.isReportable ?? true, createdAt: now };
}

export async function getSegment(pool: Pool, tenantId: string, id: string): Promise<OperatingSegmentRow | null> {
  const r = await pool.query('SELECT * FROM operating_segments WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    segmentName: row.segment_name,
    description: row.description ?? undefined,
    codmReportBasis: row.codm_report_basis ?? undefined,
    aggregationCriteria: row.aggregation_criteria ?? undefined,
    isReportable: row.is_reportable,
    createdAt: row.created_at,
  };
}

export async function listSegments(pool: Pool, tenantId: string): Promise<OperatingSegmentRow[]> {
  const r = await pool.query('SELECT * FROM operating_segments WHERE tenant_id = $1 ORDER BY segment_name', [tenantId]);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    segmentName: row.segment_name,
    description: row.description ?? undefined,
    codmReportBasis: row.codm_report_basis ?? undefined,
    aggregationCriteria: row.aggregation_criteria ?? undefined,
    isReportable: row.is_reportable,
    createdAt: row.created_at,
  }));
}

export async function updateSegment(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<OperatingSegmentRow>
): Promise<OperatingSegmentRow | null> {
  const updates: string[] = [];
  const params: unknown[] = [id];
  let idx = 2;
  if (patch.segmentName !== undefined) { updates.push(`segment_name = $${idx++}`); params.push(patch.segmentName); }
  if (patch.description !== undefined) { updates.push(`description = $${idx++}`); params.push(patch.description); }
  if (patch.isReportable !== undefined) { updates.push(`is_reportable = $${idx++}`); params.push(patch.isReportable); }
  if (updates.length === 0) return getSegment(pool, tenantId, id);
  params.push(tenantId);
  await pool.query(`UPDATE operating_segments SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx}`, params);
  return getSegment(pool, tenantId, id);
}

export async function deleteSegment(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM operating_segments WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

// Segment Financials CRUD
export async function createSegmentFinancials(
  pool: Pool,
  tenantId: string,
  financials: Omit<SegmentFinancialsRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<SegmentFinancialsRow> {
  const id = nextId('sfin');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO segment_financials (id, tenant_id, segment_id, period_label, revenue, intersegment_revenue, external_revenue, profit_loss, assets, liabilities, capital_expenditures, depreciation, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id, tenantId, financials.segmentId, financials.periodLabel,
      financials.revenue ?? null, financials.intersegmentRevenue ?? 0, financials.externalRevenue ?? null,
      financials.profitLoss ?? null, financials.assets ?? null, financials.liabilities ?? null,
      financials.capitalExpenditures ?? null, financials.depreciation ?? null, now
    ]
  );
  return { id, tenantId, ...financials, createdAt: now };
}

export async function listSegmentFinancials(pool: Pool, tenantId: string, periodLabel?: string, segmentId?: string): Promise<SegmentFinancialsRow[]> {
  let sql = 'SELECT * FROM segment_financials WHERE tenant_id = $1';
  const params: unknown[] = [tenantId];
  let idx = 2;
  if (periodLabel) { sql += ` AND period_label = $${idx++}`; params.push(periodLabel); }
  if (segmentId) { sql += ` AND segment_id = $${idx++}`; params.push(segmentId); }
  sql += ' ORDER BY created_at';
  const r = await pool.query(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    segmentId: row.segment_id,
    periodLabel: row.period_label,
    revenue: row.revenue != null ? Number(row.revenue) : undefined,
    intersegmentRevenue: row.intersegment_revenue != null ? Number(row.intersegment_revenue) : undefined,
    externalRevenue: row.external_revenue != null ? Number(row.external_revenue) : undefined,
    profitLoss: row.profit_loss != null ? Number(row.profit_loss) : undefined,
    assets: row.assets != null ? Number(row.assets) : undefined,
    liabilities: row.liabilities != null ? Number(row.liabilities) : undefined,
    capitalExpenditures: row.capital_expenditures != null ? Number(row.capital_expenditures) : undefined,
    depreciation: row.depreciation != null ? Number(row.depreciation) : undefined,
    createdAt: row.created_at,
  }));
}

// Reconciliation CRUD
export async function createReconciliation(
  pool: Pool,
  tenantId: string,
  reconciliation: Omit<SegmentReconciliationRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<SegmentReconciliationRow> {
  const id = nextId('srec');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO segment_reconciliation (id, tenant_id, period_label, item_type, segment_total, consolidated_total, reconciling_items, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, tenantId, reconciliation.periodLabel, reconciliation.itemType, reconciliation.segmentTotal, reconciliation.consolidatedTotal, JSON.stringify(reconciliation.reconcilingItems), now]
  );
  return { id, tenantId, ...reconciliation, createdAt: now };
}

export async function listReconciliations(pool: Pool, tenantId: string, periodLabel?: string): Promise<SegmentReconciliationRow[]> {
  let sql = 'SELECT * FROM segment_reconciliation WHERE tenant_id = $1';
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
    itemType: row.item_type,
    segmentTotal: Number(row.segment_total),
    consolidatedTotal: Number(row.consolidated_total),
    reconcilingItems: row.reconciling_items ?? [],
    createdAt: row.created_at,
  }));
}
