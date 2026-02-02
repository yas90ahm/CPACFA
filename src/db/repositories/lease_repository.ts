/**
 * Lease repository — leases and lease_schedules (ASC 842 / IFRS 16).
 */

import type { Pool } from 'pg';

export type LeaseClassification = 'operating' | 'finance';
export type PaymentFrequency = 'monthly' | 'quarterly' | 'annual';
export type LeaseStandard = 'asc842' | 'ifrs16';

export interface LeaseClassificationBasisJson {
  termMonths: number;
  economicLifeMonthsUsed: number;
  pvOfPayments: number;
  fairValueOfAsset?: number;
  fairValueUsed: boolean;
  majorPartOfLife: boolean;
  pvVsFvTest: boolean;
}

export interface LeaseRow {
  id: string;
  tenantId: string;
  leaseName: string;
  classification: LeaseClassification;
  commencementDate: string;
  termMonths: number;
  paymentFrequency: PaymentFrequency;
  paymentAmount: number;
  escalationPct: number;
  discountRate: number;
  currency: string;
  standard: LeaseStandard;
  classificationBasis?: LeaseClassificationBasisJson;
  createdAt: string;
  updatedAt: string;
}

export interface LeaseScheduleRow {
  id: string;
  leaseId: string;
  periodStart: string;
  periodEnd: string;
  leasePayment: number;
  interestExpense: number;
  liabilityReduction: number;
  leaseLiability: number;
  rouAsset: number;
  rouAmortization: number;
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToLease(row: Record<string, unknown>): LeaseRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    leaseName: row.lease_name as string,
    classification: row.classification as LeaseClassification,
    commencementDate: (row.commencement_date as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.commencement_date),
    termMonths: Number(row.term_months),
    paymentFrequency: row.payment_frequency as PaymentFrequency,
    paymentAmount: Number(row.payment_amount),
    escalationPct: Number(row.escalation_pct ?? 0),
    discountRate: Number(row.discount_rate),
    currency: (row.currency as string) ?? 'USD',
    standard: row.standard as LeaseStandard,
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
    updatedAt: (row.updated_at as Date)?.toISOString?.() ?? String(row.updated_at),
  };
}

function rowToSchedule(row: Record<string, unknown>): LeaseScheduleRow {
  return {
    id: row.id as string,
    leaseId: row.lease_id as string,
    periodStart: (row.period_start as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.period_start),
    periodEnd: (row.period_end as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.period_end),
    leasePayment: Number(row.lease_payment),
    interestExpense: Number(row.interest_expense),
    liabilityReduction: Number(row.liability_reduction),
    leaseLiability: Number(row.lease_liability),
    rouAsset: Number(row.rou_asset),
    rouAmortization: Number(row.rou_amortization),
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
  };
}

export async function createLease(
  pool: Pool,
  tenantId: string,
  row: Omit<LeaseRow, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>
): Promise<LeaseRow> {
  const id = nextId('lease');
  const now = new Date().toISOString();
  const basisJson = row.classificationBasis != null ? JSON.stringify(row.classificationBasis) : null;
  await pool.query(
    `INSERT INTO leases (id, tenant_id, lease_name, classification, commencement_date, term_months, payment_frequency, payment_amount, escalation_pct, discount_rate, currency, standard, classification_basis, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id, tenantId, row.leaseName, row.classification, row.commencementDate, row.termMonths, row.paymentFrequency,
      row.paymentAmount, row.escalationPct ?? 0, row.discountRate, row.currency ?? 'USD', row.standard, basisJson, now, now,
    ]
  );
  return { id, tenantId, ...row, createdAt: now, updatedAt: now };
}

export async function getLease(pool: Pool, tenantId: string, id: string): Promise<LeaseRow | null> {
  const r = await pool.query('SELECT * FROM leases WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return r.rows[0] ? rowToLease(r.rows[0]) : null;
}

export async function listLeases(
  pool: Pool,
  tenantId: string,
  options?: { periodLabel?: string }
): Promise<LeaseRow[]> {
  let sql = 'SELECT * FROM leases WHERE tenant_id = $1 ORDER BY commencement_date DESC';
  const params: unknown[] = [tenantId];
  const r = await pool.query(sql, params);
  return r.rows.map(rowToLease);
}

export async function updateLease(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<Omit<LeaseRow, 'id' | 'tenantId' | 'createdAt'>> &
    { updatedAt?: string }
): Promise<LeaseRow | null> {
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = $2'];
  const params: unknown[] = [id, now];
  let idx = 3;
  const set = (key: string, val: unknown) => {
    updates.push(`${key} = $${idx++}`);
    params.push(val);
  };
  if (patch.leaseName !== undefined) set('lease_name', patch.leaseName);
  if (patch.classification !== undefined) set('classification', patch.classification);
  if (patch.commencementDate !== undefined) set('commencement_date', patch.commencementDate);
  if (patch.termMonths !== undefined) set('term_months', patch.termMonths);
  if (patch.paymentFrequency !== undefined) set('payment_frequency', patch.paymentFrequency);
  if (patch.paymentAmount !== undefined) set('payment_amount', patch.paymentAmount);
  if (patch.escalationPct !== undefined) set('escalation_pct', patch.escalationPct);
  if (patch.discountRate !== undefined) set('discount_rate', patch.discountRate);
  if (patch.currency !== undefined) set('currency', patch.currency);
  if (patch.standard !== undefined) set('standard', patch.standard);
  if (patch.classificationBasis !== undefined) set('classification_basis', patch.classificationBasis != null ? JSON.stringify(patch.classificationBasis) : null);
  params.push(tenantId);
  const r = await pool.query(
    `UPDATE leases SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx} RETURNING *`,
    params
  );
  return r.rows[0] ? rowToLease(r.rows[0]) : null;
}

export async function deleteLease(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM leases WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);
  return r.rowCount !== null && r.rowCount > 0;
}

export async function deleteScheduleByLeaseId(pool: Pool, leaseId: string): Promise<void> {
  await pool.query('DELETE FROM lease_schedules WHERE lease_id = $1', [leaseId]);
}

export async function createLeaseScheduleRows(
  pool: Pool,
  rows: Omit<LeaseScheduleRow, 'id' | 'createdAt'>[]
): Promise<LeaseScheduleRow[]> {
  const result: LeaseScheduleRow[] = [];
  for (const row of rows) {
    const id = nextId('ls');
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO lease_schedules (id, lease_id, period_start, period_end, lease_payment, interest_expense, liability_reduction, lease_liability, rou_asset, rou_amortization, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id, row.leaseId, row.periodStart, row.periodEnd, row.leasePayment, row.interestExpense, row.liabilityReduction,
        row.leaseLiability, row.rouAsset, row.rouAmortization, now,
      ]
    );
    result.push({ ...row, id, createdAt: now });
  }
  return result;
}

export async function listLeaseSchedules(pool: Pool, leaseId: string): Promise<LeaseScheduleRow[]> {
  const r = await pool.query('SELECT * FROM lease_schedules WHERE lease_id = $1 ORDER BY period_start', [leaseId]);
  return r.rows.map(rowToSchedule);
}

export async function getLeasePositionForPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<{ totalRouAsset: number; totalLeaseLiability: number }> {
  const periodEnd = periodLabelToEnd(periodLabel);
  const r = await pool.query(
    `SELECT COALESCE(SUM(ls.rou_asset), 0) AS rou_asset, COALESCE(SUM(ls.lease_liability), 0) AS lease_liability
     FROM lease_schedules ls
     JOIN leases l ON l.id = ls.lease_id AND l.tenant_id = $1
     WHERE ls.period_end = $2::date`,
    [tenantId, periodEnd]
  );
  const row = r.rows[0];
  return {
    totalRouAsset: row ? Number(row.rou_asset) : 0,
    totalLeaseLiability: row ? Number(row.lease_liability) : 0,
  };
}

function periodLabelToEnd(periodLabel: string): string {
  const m = periodLabel.match(/^(\d{4})-Q(\d)$/);
  if (m) {
    const y = parseInt(m[1]!, 10);
    const q = parseInt(m[2]!, 10);
    const lastMonth = q * 3;
    const lastDay = new Date(y, lastMonth, 0).getDate();
    return `${y}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  const m2 = periodLabel.match(/^(\d{4})-(\d{2})$/);
  if (m2) {
    const y = parseInt(m2[1]!, 10);
    const month = parseInt(m2[2]!, 10);
    const lastDay = new Date(y, month, 0).getDate();
    return `${y}-${m2[2]}-${String(lastDay).padStart(2, '0')}`;
  }
  return periodLabel;
}
