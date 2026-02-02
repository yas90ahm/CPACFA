/**
 * Stock-based compensation repository — grants, valuations, expense schedules (IFRS 2 / ASC 718).
 */

import type { Pool } from 'pg';

export interface VestingScheduleEntry {
  date: string;
  shares: number;
  vested: boolean;
}

export interface StockGrantRow {
  id: string;
  tenantId: string;
  grantDate: string;
  grantType: 'rsu' | 'option' | 'espp' | 'sar';
  recipientId?: string;
  recipientName?: string;
  sharesGranted: number;
  grantPrice?: number;
  fairValuePerShare?: number;
  vestingType: 'time' | 'performance' | 'market';
  vestingSchedule: VestingScheduleEntry[];
  expirationDate?: string;
  status: 'active' | 'vested' | 'forfeited' | 'exercised';
  forfeitureDate?: string;
  exerciseDate?: string;
  exercisePrice?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockValuationRow {
  id: string;
  tenantId: string;
  grantId: string;
  valuationDate: string;
  method: 'black_scholes' | 'grant_date_price' | 'monte_carlo';
  fairValuePerShare: number;
  parameters?: { volatility?: number; riskFreeRate?: number; expectedTerm?: number; dividendYield?: number };
  createdAt: string;
}

export interface StockExpenseRow {
  id: string;
  tenantId: string;
  grantId: string;
  periodLabel: string;
  expenseAmount: number;
  cumulativeExpense: number;
  sharesVested: number;
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToGrant(row: any): StockGrantRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    grantDate: row.grant_date,
    grantType: row.grant_type,
    recipientId: row.recipient_id ?? undefined,
    recipientName: row.recipient_name ?? undefined,
    sharesGranted: Number(row.shares_granted),
    grantPrice: row.grant_price != null ? Number(row.grant_price) : undefined,
    fairValuePerShare: row.fair_value_per_share != null ? Number(row.fair_value_per_share) : undefined,
    vestingType: row.vesting_type,
    vestingSchedule: row.vesting_schedule ?? [],
    expirationDate: row.expiration_date ?? undefined,
    status: row.status,
    forfeitureDate: row.forfeiture_date ?? undefined,
    exerciseDate: row.exercise_date ?? undefined,
    exercisePrice: row.exercise_price != null ? Number(row.exercise_price) : undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createGrant(
  pool: Pool,
  tenantId: string,
  grant: Omit<StockGrantRow, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>
): Promise<StockGrantRow> {
  const id = nextId('sg');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO stock_grants (id, tenant_id, grant_date, grant_type, recipient_id, recipient_name, shares_granted, grant_price, fair_value_per_share, vesting_type, vesting_schedule, expiration_date, status, forfeiture_date, exercise_date, exercise_price, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      id, tenantId, grant.grantDate, grant.grantType, grant.recipientId ?? null, grant.recipientName ?? null,
      grant.sharesGranted, grant.grantPrice ?? null, grant.fairValuePerShare ?? null, grant.vestingType,
      JSON.stringify(grant.vestingSchedule), grant.expirationDate ?? null, grant.status ?? 'active',
      grant.forfeitureDate ?? null, grant.exerciseDate ?? null, grant.exercisePrice ?? null,
      grant.notes ?? null, now, now
    ]
  );
  return { id, tenantId, ...grant, createdAt: now, updatedAt: now };
}

export async function getGrant(pool: Pool, tenantId: string, id: string): Promise<StockGrantRow | null> {
  const r = await pool.query('SELECT * FROM stock_grants WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return r.rows[0] ? rowToGrant(r.rows[0]) : null;
}

export async function listGrants(
  pool: Pool,
  tenantId: string,
  filters?: { status?: string; grantType?: string }
): Promise<StockGrantRow[]> {
  let sql = 'SELECT * FROM stock_grants WHERE tenant_id = $1';
  const params: unknown[] = [tenantId];
  let idx = 2;
  if (filters?.status) {
    sql += ` AND status = $${idx++}`;
    params.push(filters.status);
  }
  if (filters?.grantType) {
    sql += ` AND grant_type = $${idx++}`;
    params.push(filters.grantType);
  }
  sql += ' ORDER BY grant_date DESC';
  const r = await pool.query(sql, params);
  return r.rows.map(rowToGrant);
}

export async function updateGrant(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<StockGrantRow>
): Promise<StockGrantRow | null> {
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = $2'];
  const params: unknown[] = [id, now];
  let idx = 3;
  if (patch.status !== undefined) { updates.push(`status = $${idx++}`); params.push(patch.status); }
  if (patch.forfeitureDate !== undefined) { updates.push(`forfeiture_date = $${idx++}`); params.push(patch.forfeitureDate); }
  if (patch.exerciseDate !== undefined) { updates.push(`exercise_date = $${idx++}`); params.push(patch.exerciseDate); }
  if (patch.exercisePrice !== undefined) { updates.push(`exercise_price = $${idx++}`); params.push(patch.exercisePrice); }
  if (patch.fairValuePerShare !== undefined) { updates.push(`fair_value_per_share = $${idx++}`); params.push(patch.fairValuePerShare); }
  if (patch.vestingSchedule !== undefined) { updates.push(`vesting_schedule = $${idx++}`); params.push(JSON.stringify(patch.vestingSchedule)); }
  if (patch.notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(patch.notes); }
  params.push(tenantId);
  await pool.query(`UPDATE stock_grants SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx}`, params);
  return getGrant(pool, tenantId, id);
}

export async function recordValuation(
  pool: Pool,
  tenantId: string,
  valuation: { grantId: string; valuationDate: string; method: string; fairValuePerShare: number; parameters?: any }
): Promise<StockValuationRow> {
  const id = nextId('sv');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO stock_grant_valuations (id, tenant_id, grant_id, valuation_date, method, fair_value_per_share, parameters, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, tenantId, valuation.grantId, valuation.valuationDate, valuation.method, valuation.fairValuePerShare, valuation.parameters ? JSON.stringify(valuation.parameters) : null, now]
  );
  return { id, tenantId, grantId: valuation.grantId, valuationDate: valuation.valuationDate, method: valuation.method as StockValuationRow['method'], fairValuePerShare: valuation.fairValuePerShare, parameters: valuation.parameters, createdAt: now };
}

export async function listValuations(pool: Pool, tenantId: string, grantId: string): Promise<StockValuationRow[]> {
  const r = await pool.query('SELECT * FROM stock_grant_valuations WHERE tenant_id = $1 AND grant_id = $2 ORDER BY valuation_date DESC', [tenantId, grantId]);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    grantId: row.grant_id,
    valuationDate: row.valuation_date,
    method: row.method,
    fairValuePerShare: Number(row.fair_value_per_share),
    parameters: row.parameters ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function recordExpense(
  pool: Pool,
  tenantId: string,
  expense: { grantId: string; periodLabel: string; expenseAmount: number; cumulativeExpense: number; sharesVested: number }
): Promise<StockExpenseRow> {
  const id = nextId('se');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO stock_expense_schedule (id, tenant_id, grant_id, period_label, expense_amount, cumulative_expense, shares_vested, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [id, tenantId, expense.grantId, expense.periodLabel, expense.expenseAmount, expense.cumulativeExpense, expense.sharesVested, now]
  );
  return { id, tenantId, grantId: expense.grantId, periodLabel: expense.periodLabel, expenseAmount: expense.expenseAmount, cumulativeExpense: expense.cumulativeExpense, sharesVested: expense.sharesVested, createdAt: now };
}

export async function listExpenses(pool: Pool, tenantId: string, periodLabel?: string): Promise<StockExpenseRow[]> {
  let sql = 'SELECT * FROM stock_expense_schedule WHERE tenant_id = $1';
  const params: unknown[] = [tenantId];
  if (periodLabel) {
    sql += ' AND period_label = $2';
    params.push(periodLabel);
  }
  sql += ' ORDER BY period_label, created_at';
  const r = await pool.query(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    grantId: row.grant_id,
    periodLabel: row.period_label,
    expenseAmount: Number(row.expense_amount),
    cumulativeExpense: Number(row.cumulative_expense),
    sharesVested: Number(row.shares_vested),
    createdAt: row.created_at,
  }));
}

export async function getTotalExpenseForPeriod(pool: Pool, tenantId: string, periodLabel: string): Promise<number> {
  const r = await pool.query(
    'SELECT COALESCE(SUM(expense_amount), 0) as total FROM stock_expense_schedule WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  return Number(r.rows[0]?.total ?? 0);
}
