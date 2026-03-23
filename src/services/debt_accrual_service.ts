/**
 * Debt Interest Accrual Schedule service.
 * Computes periodic interest accruals using actual/365 day-count convention.
 * All monetary arithmetic via Decimal.js — no native JS arithmetic on money.
 */

import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import type { Pool } from 'pg';
import { createDraftJE } from './journal_entry_service.js';
import { assertNoAiMutationContext } from '../lib/ai_boundary.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DebtSchedule {
  id: string;
  tenantId: string;
  entityId: string;
  lenderName: string;
  instrumentType: string;
  principalBalance: string;
  annualRate: string;
  interestExpenseAccount: string;
  accruedInterestAccount: string;
  maturityDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DebtAccrualEntry {
  id: string;
  debtScheduleId: string;
  closeSessionId: string;
  periodStart: string;
  periodEnd: string;
  daysInPeriod: number;
  dailyRate: string;
  accrualAmount: string;
  jeId: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rowToSchedule(r: Record<string, unknown>): DebtSchedule {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    entityId: r.entity_id as string,
    lenderName: r.lender_name as string,
    instrumentType: r.instrument_type as string,
    principalBalance: String(r.principal_balance),
    annualRate: String(r.annual_rate),
    interestExpenseAccount: r.interest_expense_account as string,
    accruedInterestAccount: r.accrued_interest_account as string,
    maturityDate: r.maturity_date ? String(r.maturity_date) : null,
    status: r.status as string,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowToEntry(r: Record<string, unknown>): DebtAccrualEntry {
  return {
    id: r.id as string,
    debtScheduleId: r.debt_schedule_id as string,
    closeSessionId: r.close_session_id as string,
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    daysInPeriod: Number(r.days_in_period),
    dailyRate: String(r.daily_rate),
    accrualAmount: String(r.accrual_amount),
    jeId: r.je_id ? String(r.je_id) : null,
    createdAt: String(r.created_at),
  };
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

/* ------------------------------------------------------------------ */
/*  Core computation                                                   */
/* ------------------------------------------------------------------ */

/** Compute monthly interest accrual using actual/365 day-count. */
export function computeMonthlyAccrual(
  schedule: { annualRate: string; principalBalance: string },
  periodStart: string,
  periodEnd: string
): { accrualAmount: string; dailyRate: string; days: number } {
  const dailyRate = new Decimal(schedule.annualRate).div(365);
  const days = daysBetween(periodStart, periodEnd);
  if (days <= 0) return { accrualAmount: '0.00', dailyRate: dailyRate.toFixed(10), days: 0 };
  const accrual = new Decimal(schedule.principalBalance).mul(dailyRate).mul(days).toDecimalPlaces(2);
  return { accrualAmount: accrual.toFixed(2), dailyRate: dailyRate.toFixed(10), days };
}

/* ------------------------------------------------------------------ */
/*  CRUD                                                               */
/* ------------------------------------------------------------------ */

export async function createDebtSchedule(
  pool: Pool, tenantId: string, entityId: string,
  input: { lenderName: string; instrumentType?: string; principalBalance: string; annualRate: string; interestExpenseAccount: string; accruedInterestAccount: string; maturityDate?: string }
): Promise<DebtSchedule> {
  assertNoAiMutationContext();
  if (!input.lenderName) throw new Error('lenderName is required');
  if (!input.principalBalance || new Decimal(input.principalBalance).lte(0)) throw new Error('principalBalance must be positive');
  if (!input.annualRate || new Decimal(input.annualRate).lte(0)) throw new Error('annualRate must be positive');
  if (!input.interestExpenseAccount || !input.accruedInterestAccount) throw new Error('Account references are required');

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO tenant_debt_schedules (id, tenant_id, entity_id, lender_name, instrument_type, principal_balance, annual_rate, interest_expense_account, accrued_interest_account, maturity_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, tenantId, entityId, input.lenderName, input.instrumentType ?? 'term_loan', input.principalBalance, input.annualRate, input.interestExpenseAccount, input.accruedInterestAccount, input.maturityDate ?? null]
  );
  return rowToSchedule(rows[0]);
}

export async function updateDebtSchedule(
  pool: Pool, tenantId: string, scheduleId: string,
  patch: Partial<{ lenderName: string; instrumentType: string; principalBalance: string; annualRate: string; interestExpenseAccount: string; accruedInterestAccount: string; maturityDate: string; status: string }>
): Promise<DebtSchedule | null> {
  assertNoAiMutationContext();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  const map: Record<string, string> = {
    lenderName: 'lender_name', instrumentType: 'instrument_type', principalBalance: 'principal_balance',
    annualRate: 'annual_rate', interestExpenseAccount: 'interest_expense_account',
    accruedInterestAccount: 'accrued_interest_account', maturityDate: 'maturity_date', status: 'status',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((patch as Record<string, unknown>)[k] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push((patch as Record<string, unknown>)[k]);
    }
  }
  if (sets.length === 0) return null;
  sets.push(`updated_at = now()`);
  vals.push(tenantId, scheduleId);
  const { rows } = await pool.query(
    `UPDATE tenant_debt_schedules SET ${sets.join(', ')} WHERE tenant_id = $${idx++} AND id = $${idx} RETURNING *`,
    vals
  );
  return rows.length > 0 ? rowToSchedule(rows[0]) : null;
}

export async function getDebtSchedules(pool: Pool, tenantId: string, entityId?: string): Promise<DebtSchedule[]> {
  const q = entityId
    ? { text: 'SELECT * FROM tenant_debt_schedules WHERE tenant_id = $1 AND entity_id = $2 ORDER BY created_at', values: [tenantId, entityId] }
    : { text: 'SELECT * FROM tenant_debt_schedules WHERE tenant_id = $1 ORDER BY created_at', values: [tenantId] };
  const { rows } = await pool.query(q.text, q.values);
  return rows.map(rowToSchedule);
}

/* ------------------------------------------------------------------ */
/*  Propose interest accruals                                          */
/* ------------------------------------------------------------------ */

export async function proposeInterestAccruals(
  pool: Pool, tenantId: string, entityId: string, closeSessionId: string,
  periodStart: string, periodEnd: string
): Promise<DebtAccrualEntry[]> {
  assertNoAiMutationContext();
  const schedules = await getDebtSchedules(pool, tenantId, entityId);
  const active = schedules.filter((s) => s.status === 'active');
  const results: DebtAccrualEntry[] = [];

  for (const sch of active) {
    const { accrualAmount, dailyRate, days } = computeMonthlyAccrual(sch, periodStart, periodEnd);
    if (new Decimal(accrualAmount).lte(0)) continue;

    const ratePercent = new Decimal(sch.annualRate).mul(100).toFixed(4);
    const memo = `${sch.lenderName} interest accrual ${periodStart} to ${periodEnd} — ${days} days at ${ratePercent}% on ${sch.principalBalance}`;

    const je = await createDraftJE(pool, {
      closeSessionId,
      tenantId,
      memo,
      source: 'accrual',
      createdBy: 'debt_accrual_engine',
      lines: [
        { accountRef: sch.interestExpenseAccount, debit: Number(accrualAmount), credit: 0, description: `Interest expense — ${sch.lenderName}`,
          amountProvenance: { kind: 'engine_calculation' as const, ruleId: sch.id, ruleVersion: '1', inputs: { principal: sch.principalBalance, rate: sch.annualRate, days } } },
        { accountRef: sch.accruedInterestAccount, debit: 0, credit: Number(accrualAmount), description: `Accrued interest — ${sch.lenderName}`,
          amountProvenance: { kind: 'engine_calculation' as const, ruleId: sch.id, ruleVersion: '1', inputs: { principal: sch.principalBalance, rate: sch.annualRate, days } } },
      ],
    });

    const entryId = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO tenant_debt_accrual_entries (id, tenant_id, debt_schedule_id, close_session_id, period_start, period_end, days_in_period, daily_rate, accrual_amount, je_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [entryId, tenantId, sch.id, closeSessionId, periodStart, periodEnd, days, dailyRate, accrualAmount, je.id]
    );
    results.push(rowToEntry(rows[0]));
  }
  return results;
}

export async function getDebtAccrualEntries(pool: Pool, tenantId: string, closeSessionId: string): Promise<DebtAccrualEntry[]> {
  const { rows } = await pool.query(
    'SELECT * FROM tenant_debt_accrual_entries WHERE tenant_id = $1 AND close_session_id = $2 ORDER BY created_at',
    [tenantId, closeSessionId]
  );
  return rows.map(rowToEntry);
}
