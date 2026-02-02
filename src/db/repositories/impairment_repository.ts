/**
 * Impairment testing repository — CGUs, goodwill allocation, impairment tests (IAS 36 / ASC 350).
 */

import type { Pool } from 'pg';

export interface CGURow {
  id: string;
  tenantId: string;
  cguName: string;
  description?: string;
  allocationBasis?: 'revenue' | 'headcount' | 'assets';
  segmentId?: string;
  createdAt: string;
}

export interface GoodwillAllocationRow {
  id: string;
  tenantId: string;
  cguId: string;
  acquisitionDate?: string;
  goodwillAmount: number;
  allocationRationale?: string;
  createdAt: string;
}

export interface ImpairmentTestRow {
  id: string;
  tenantId: string;
  periodLabel: string;
  testDate: string;
  cguId?: string;
  assetType: 'goodwill' | 'intangible' | 'ppe' | 'investment';
  assetDescription?: string;
  carryingAmount: number;
  recoverableAmount: number;
  impairmentLoss?: number;
  method: 'value_in_use' | 'fair_value_less_costs' | 'value_in_use_and_fair_value_less_costs';
  assumptions?: { discountRate?: number; growthRate?: number; cashFlows?: number[] };
  qualitativeAssessment?: string;
  quantitativeRequired?: boolean;
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// CGU CRUD
export async function createCGU(
  pool: Pool,
  tenantId: string,
  cgu: Omit<CGURow, 'id' | 'createdAt' | 'tenantId'>
): Promise<CGURow> {
  const id = nextId('cgu');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO cash_generating_units (id, tenant_id, cgu_name, description, allocation_basis, segment_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, tenantId, cgu.cguName, cgu.description ?? null, cgu.allocationBasis ?? null, cgu.segmentId ?? null, now]
  );
  return { id, tenantId, ...cgu, createdAt: now };
}

export async function getCGU(pool: Pool, tenantId: string, id: string): Promise<CGURow | null> {
  const r = await pool.query('SELECT * FROM cash_generating_units WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    cguName: row.cgu_name,
    description: row.description ?? undefined,
    allocationBasis: row.allocation_basis ?? undefined,
    segmentId: row.segment_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listCGUs(pool: Pool, tenantId: string): Promise<CGURow[]> {
  const r = await pool.query('SELECT * FROM cash_generating_units WHERE tenant_id = $1 ORDER BY cgu_name', [tenantId]);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    cguName: row.cgu_name,
    description: row.description ?? undefined,
    allocationBasis: row.allocation_basis ?? undefined,
    segmentId: row.segment_id ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function deleteCGU(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM cash_generating_units WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

// Goodwill Allocation
export async function createGoodwillAllocation(
  pool: Pool,
  tenantId: string,
  allocation: Omit<GoodwillAllocationRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<GoodwillAllocationRow> {
  const id = nextId('gwa');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO goodwill_allocation (id, tenant_id, cgu_id, acquisition_date, goodwill_amount, allocation_rationale, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, tenantId, allocation.cguId, allocation.acquisitionDate ?? null, allocation.goodwillAmount, allocation.allocationRationale ?? null, now]
  );
  return { id, tenantId, ...allocation, createdAt: now };
}

export async function listGoodwillAllocations(pool: Pool, tenantId: string, cguId?: string): Promise<GoodwillAllocationRow[]> {
  let sql = 'SELECT * FROM goodwill_allocation WHERE tenant_id = $1';
  const params: unknown[] = [tenantId];
  if (cguId) {
    sql += ' AND cgu_id = $2';
    params.push(cguId);
  }
  sql += ' ORDER BY created_at DESC';
  const r = await pool.query(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    cguId: row.cgu_id,
    acquisitionDate: row.acquisition_date ?? undefined,
    goodwillAmount: Number(row.goodwill_amount),
    allocationRationale: row.allocation_rationale ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function getTotalGoodwillForCGU(pool: Pool, tenantId: string, cguId: string): Promise<number> {
  const r = await pool.query(
    'SELECT COALESCE(SUM(goodwill_amount), 0) as total FROM goodwill_allocation WHERE tenant_id = $1 AND cgu_id = $2',
    [tenantId, cguId]
  );
  return Number(r.rows[0]?.total ?? 0);
}

// Impairment Tests
export async function createImpairmentTest(
  pool: Pool,
  tenantId: string,
  test: Omit<ImpairmentTestRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<ImpairmentTestRow> {
  const id = nextId('imt');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO impairment_tests (id, tenant_id, period_label, test_date, cgu_id, asset_type, asset_description, carrying_amount, recoverable_amount, impairment_loss, method, assumptions, qualitative_assessment, quantitative_required, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id, tenantId, test.periodLabel, test.testDate, test.cguId ?? null, test.assetType, test.assetDescription ?? null,
      test.carryingAmount, test.recoverableAmount, test.impairmentLoss ?? null, test.method,
      test.assumptions ? JSON.stringify(test.assumptions) : null, test.qualitativeAssessment ?? null,
      test.quantitativeRequired ?? null, now
    ]
  );
  return { id, tenantId, ...test, createdAt: now };
}

export async function getImpairmentTest(pool: Pool, tenantId: string, id: string): Promise<ImpairmentTestRow | null> {
  const r = await pool.query('SELECT * FROM impairment_tests WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label,
    testDate: row.test_date,
    cguId: row.cgu_id ?? undefined,
    assetType: row.asset_type,
    assetDescription: row.asset_description ?? undefined,
    carryingAmount: Number(row.carrying_amount),
    recoverableAmount: Number(row.recoverable_amount),
    impairmentLoss: row.impairment_loss != null ? Number(row.impairment_loss) : undefined,
    method: row.method,
    assumptions: row.assumptions ?? undefined,
    qualitativeAssessment: row.qualitative_assessment ?? undefined,
    quantitativeRequired: row.quantitative_required ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listImpairmentTests(pool: Pool, tenantId: string, periodLabel?: string): Promise<ImpairmentTestRow[]> {
  let sql = 'SELECT * FROM impairment_tests WHERE tenant_id = $1';
  const params: unknown[] = [tenantId];
  if (periodLabel) {
    sql += ' AND period_label = $2';
    params.push(periodLabel);
  }
  sql += ' ORDER BY test_date DESC';
  const r = await pool.query(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label,
    testDate: row.test_date,
    cguId: row.cgu_id ?? undefined,
    assetType: row.asset_type,
    assetDescription: row.asset_description ?? undefined,
    carryingAmount: Number(row.carrying_amount),
    recoverableAmount: Number(row.recoverable_amount),
    impairmentLoss: row.impairment_loss != null ? Number(row.impairment_loss) : undefined,
    method: row.method,
    assumptions: row.assumptions ?? undefined,
    qualitativeAssessment: row.qualitative_assessment ?? undefined,
    quantitativeRequired: row.quantitative_required ?? undefined,
    createdAt: row.created_at,
  }));
}
