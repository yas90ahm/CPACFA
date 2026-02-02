/**
 * Revenue recognition repository — contracts, performance obligations, schedule (IFRS 15 / ASC 606).
 */

import type { Pool } from 'pg';
import type { RevRecStatus } from '../../types/revenue_recognition.js';
import type { RecognitionScheduleEntry } from '../../types/revenue_recognition.js';

export interface RevenueContractRow {
  id: string;
  tenantId: string;
  contractNumber: string;
  customerId?: string;
  customerName?: string;
  startDate: string;
  endDate: string;
  totalContractValue: number;
  currency: string;
  status: RevRecStatus;
  allocation?: Record<string, number>;
  allocationRationale?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceObligationRow {
  id: string;
  tenantId: string;
  contractId: string;
  name: string;
  description?: string;
  satisfiedOverTime: boolean;
  allocationPercent?: number;
  allocationAmount?: number;
  schedule?: RecognitionScheduleEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface RevenueScheduleRow {
  id: string;
  tenantId: string;
  contractId: string;
  pobId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  cumulativeAmount?: number;
  recognized: boolean;
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToContract(row: Record<string, unknown>): RevenueContractRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    contractNumber: row.contract_number as string,
    customerId: row.customer_id as string | undefined,
    customerName: row.customer_name as string | undefined,
    startDate: (row.start_date as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.start_date),
    endDate: (row.end_date as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.end_date),
    totalContractValue: Number(row.total_contract_value),
    currency: row.currency as string,
    status: (row.status as RevRecStatus) ?? 'draft',
    allocation: row.allocation != null ? (row.allocation as Record<string, number>) : undefined,
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
    updatedAt: (row.updated_at as Date)?.toISOString?.() ?? String(row.updated_at),
  };
}

function rowToPob(row: Record<string, unknown>): PerformanceObligationRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    contractId: row.contract_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    satisfiedOverTime: Boolean(row.satisfied_over_time),
    allocationPercent: row.allocation_percent != null ? Number(row.allocation_percent) : undefined,
    allocationAmount: row.allocation_amount != null ? Number(row.allocation_amount) : undefined,
    schedule: row.schedule != null ? (row.schedule as RecognitionScheduleEntry[]) : undefined,
    scheduleType: (row.schedule_type as ScheduleType) ?? undefined,
    costToCostTotalEstimated: row.cost_to_cost_total_estimated != null ? Number(row.cost_to_cost_total_estimated) : undefined,
    costToCostCostsToDate: row.cost_to_cost_costs_to_date != null ? Number(row.cost_to_cost_costs_to_date) : undefined,
    milestoneAmounts: row.milestone_amounts != null ? (row.milestone_amounts as { date: string; amount: number }[]) : undefined,
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
    updatedAt: (row.updated_at as Date)?.toISOString?.() ?? String(row.updated_at),
  };
}

function rowToSchedule(row: Record<string, unknown>): RevenueScheduleRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    contractId: row.contract_id as string,
    pobId: row.pob_id as string,
    periodStart: (row.period_start as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.period_start),
    periodEnd: (row.period_end as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.period_end),
    amount: Number(row.amount),
    cumulativeAmount: row.cumulative_amount != null ? Number(row.cumulative_amount) : undefined,
    recognized: Boolean(row.recognized),
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
  };
}

export async function createContract(
  pool: Pool,
  tenantId: string,
  row: Omit<RevenueContractRow, 'id' | 'createdAt' | 'updatedAt'>
): Promise<RevenueContractRow> {
  const id = nextId('rev');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO revenue_contracts (id, tenant_id, contract_number, customer_id, customer_name, start_date, end_date, total_contract_value, currency, status, allocation, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id, tenantId, row.contractNumber, row.customerId ?? null, row.customerName ?? null,
      row.startDate, row.endDate, row.totalContractValue, row.currency, row.status ?? 'draft',
      row.allocation != null ? JSON.stringify(row.allocation) : null, now, now,
    ]
  );
  return { id, tenantId, ...row, createdAt: now, updatedAt: now };
}

export async function getContract(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<RevenueContractRow | null> {
  const r = await pool.query(
    'SELECT * FROM revenue_contracts WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return r.rows[0] ? rowToContract(r.rows[0]) : null;
}

export async function listContracts(
  pool: Pool,
  tenantId: string,
  filters?: { status?: RevRecStatus }
): Promise<RevenueContractRow[]> {
  let sql = 'SELECT * FROM revenue_contracts WHERE tenant_id = $1 ORDER BY created_at DESC';
  const params: unknown[] = [tenantId];
  if (filters?.status) {
    sql += ' AND status = $2';
    params.push(filters.status);
  }
  const r = await pool.query(sql, params);
  return r.rows.map((row) => rowToContract(row));
}

export async function updateContract(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<Omit<RevenueContractRow, 'id' | 'tenantId' | 'createdAt'>>
): Promise<RevenueContractRow | null> {
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = $2'];
  const params: unknown[] = [id, now];
  let idx = 3;
  const set = (key: string, val: unknown) => {
    updates.push(`${key} = $${idx++}`);
    params.push(val);
  };
  if (patch.contractNumber !== undefined) set('contract_number', patch.contractNumber);
  if (patch.customerId !== undefined) set('customer_id', patch.customerId);
  if (patch.customerName !== undefined) set('customer_name', patch.customerName);
  if (patch.startDate !== undefined) set('start_date', patch.startDate);
  if (patch.endDate !== undefined) set('end_date', patch.endDate);
  if (patch.totalContractValue !== undefined) set('total_contract_value', patch.totalContractValue);
  if (patch.currency !== undefined) set('currency', patch.currency);
  if (patch.status !== undefined) set('status', patch.status);
  if (patch.allocation !== undefined) set('allocation', JSON.stringify(patch.allocation));
  if (patch.allocationRationale !== undefined) set('allocation_rationale', patch.allocationRationale);
  params.push(tenantId);
  const r = await pool.query(
    `UPDATE revenue_contracts SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx} RETURNING *`,
    params
  );
  return r.rows[0] ? rowToContract(r.rows[0]) : null;
}

export async function createPerformanceObligations(
  pool: Pool,
  tenantId: string,
  contractId: string,
  pobs: Omit<PerformanceObligationRow, 'id' | 'tenantId' | 'contractId' | 'createdAt' | 'updatedAt'>[]
): Promise<PerformanceObligationRow[]> {
  const result: PerformanceObligationRow[] = [];
  const now = new Date().toISOString();
  for (const p of pobs) {
    const id = nextId('pob');
    await pool.query(
      `INSERT INTO revenue_performance_obligations (id, tenant_id, contract_id, name, description, satisfied_over_time, allocation_percent, allocation_amount, schedule, schedule_type, cost_to_cost_total_estimated, cost_to_cost_costs_to_date, milestone_amounts, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id, tenantId, contractId, p.name, p.description ?? null, p.satisfiedOverTime,
        p.allocationPercent ?? null, p.allocationAmount ?? null,
        p.schedule != null ? JSON.stringify(p.schedule) : null,
        p.scheduleType ?? 'linear',
        p.costToCostTotalEstimated ?? null, p.costToCostCostsToDate ?? null,
        p.milestoneAmounts != null ? JSON.stringify(p.milestoneAmounts) : null, now, now,
      ]
    );
    result.push({
      id, tenantId, contractId, name: p.name, description: p.description,
      satisfiedOverTime: p.satisfiedOverTime, allocationPercent: p.allocationPercent,
      allocationAmount: p.allocationAmount, schedule: p.schedule,
      scheduleType: p.scheduleType, costToCostTotalEstimated: p.costToCostTotalEstimated,
      costToCostCostsToDate: p.costToCostCostsToDate, milestoneAmounts: p.milestoneAmounts,
      createdAt: now, updatedAt: now,
    });
  }
  return result;
}

export async function listPerformanceObligations(
  pool: Pool,
  tenantId: string,
  contractId: string
): Promise<PerformanceObligationRow[]> {
  const r = await pool.query(
    'SELECT * FROM revenue_performance_obligations WHERE tenant_id = $1 AND contract_id = $2 ORDER BY id',
    [tenantId, contractId]
  );
  return r.rows.map((row) => rowToPob(row));
}

export async function updatePerformanceObligation(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<Omit<PerformanceObligationRow, 'id' | 'tenantId' | 'contractId' | 'createdAt'>>
): Promise<PerformanceObligationRow | null> {
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = $2'];
  const params: unknown[] = [id, now];
  let idx = 3;
  const set = (key: string, val: unknown) => {
    updates.push(`${key} = $${idx++}`);
    params.push(val);
  };
  if (patch.name !== undefined) set('name', patch.name);
  if (patch.description !== undefined) set('description', patch.description);
  if (patch.satisfiedOverTime !== undefined) set('satisfied_over_time', patch.satisfiedOverTime);
  if (patch.allocationPercent !== undefined) set('allocation_percent', patch.allocationPercent);
  if (patch.allocationAmount !== undefined) set('allocation_amount', patch.allocationAmount);
  if (patch.schedule !== undefined) set('schedule', JSON.stringify(patch.schedule));
  if (patch.scheduleType !== undefined) set('schedule_type', patch.scheduleType);
  if (patch.costToCostTotalEstimated !== undefined) set('cost_to_cost_total_estimated', patch.costToCostTotalEstimated);
  if (patch.costToCostCostsToDate !== undefined) set('cost_to_cost_costs_to_date', patch.costToCostCostsToDate);
  if (patch.milestoneAmounts !== undefined) set('milestone_amounts', patch.milestoneAmounts != null ? JSON.stringify(patch.milestoneAmounts) : null);
  params.push(tenantId);
  const r = await pool.query(
    `UPDATE revenue_performance_obligations SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx} RETURNING *`,
    params
  );
  return r.rows[0] ? rowToPob(r.rows[0]) : null;
}

export async function upsertRecognitionSchedule(
  pool: Pool,
  tenantId: string,
  contractId: string,
  pobId: string,
  entries: RecognitionScheduleEntry[]
): Promise<void> {
  await pool.query(
    'DELETE FROM revenue_recognition_schedule WHERE tenant_id = $1 AND contract_id = $2 AND pob_id = $3',
    [tenantId, contractId, pobId]
  );
  const now = new Date().toISOString();
  for (const e of entries) {
    const id = nextId('revs');
    await pool.query(
      `INSERT INTO revenue_recognition_schedule (id, tenant_id, contract_id, pob_id, period_start, period_end, amount, cumulative_amount, recognized, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id, tenantId, contractId, pobId, e.periodStart, e.periodEnd, e.amount,
        e.cumulativeAmount ?? null, e.recognized ?? false, now,
      ]
    );
  }
}

export async function listScheduleByContract(
  pool: Pool,
  tenantId: string,
  contractId: string
): Promise<RevenueScheduleRow[]> {
  const r = await pool.query(
    'SELECT * FROM revenue_recognition_schedule WHERE tenant_id = $1 AND contract_id = $2 ORDER BY pob_id, period_start',
    [tenantId, contractId]
  );
  return r.rows.map((row) => rowToSchedule(row));
}
