/**
 * Prepaid Amortization service: schedule creation, monthly amortization entry proposal.
 * ASC 340-10: Prepaid expenses recognized ratably over the benefit period.
 * All monetary math uses Decimal.js — no native JS arithmetic on money.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import Decimal from 'decimal.js';
import { round2 } from '../utils/decimal.js';
import { assertNoAiMutationContext } from '../lib/ai_boundary.js';
import { createDraftJE } from './journal_entry_service.js';

Decimal.set({ precision: 28 });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PrepaidSchedule {
  id: string;
  tenantId: string;
  entityId: string | null;
  closeSessionId: string;
  description: string;
  vendor: string | null;
  prepaidAccount: string;
  expenseAccount: string;
  totalAmount: string;
  startDate: string;
  endDate: string;
  monthsCount: number;
  monthlyAmount: string;
  amortizedToDate: string;
  remainingBalance: string;
  fullyAmortized: boolean;
  createdAt: string;
}

export interface AmortizationEntry {
  id: string;
  scheduleId: string;
  closeSessionId: string;
  periodLabel: string;
  amount: string;
  jeId: string | null;
  status: string;
  createdAt: string;
}

export interface CreateScheduleInput {
  tenantId: string;
  entityId?: string;
  closeSessionId: string;
  description: string;
  vendor?: string;
  prepaidAccount: string;
  expenseAccount: string;
  totalAmount: number;
  startDate: string;
  endDate: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function monthsDiff(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

function rowToSchedule(r: Record<string, unknown>): PrepaidSchedule {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    entityId: (r.entity_id as string) ?? null,
    closeSessionId: r.close_session_id as string,
    description: r.description as string,
    vendor: (r.vendor as string) ?? null,
    prepaidAccount: r.prepaid_account as string,
    expenseAccount: r.expense_account as string,
    totalAmount: String(r.total_amount),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    monthsCount: Number(r.months_count),
    monthlyAmount: String(r.monthly_amount),
    amortizedToDate: String(r.amortized_to_date),
    remainingBalance: String(r.remaining_balance),
    fullyAmortized: Boolean(r.fully_amortized),
    createdAt: String(r.created_at),
  };
}

/* ------------------------------------------------------------------ */
/*  Service functions                                                  */
/* ------------------------------------------------------------------ */

/** Create a new prepaid amortization schedule. */
export async function createSchedule(
  pool: Pool,
  input: CreateScheduleInput
): Promise<PrepaidSchedule> {
  assertNoAiMutationContext();

  const months = monthsDiff(input.startDate, input.endDate);
  if (months <= 0) throw new Error('End date must be after start date (at least 1 month)');
  if (input.totalAmount <= 0) throw new Error('Total amount must be positive');

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO tenant_prepaid_schedules
       (id, tenant_id, entity_id, close_session_id, description, vendor,
        prepaid_account, expense_account, total_amount, start_date, end_date, months_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      id, input.tenantId, input.entityId ?? null, input.closeSessionId,
      input.description, input.vendor ?? null,
      input.prepaidAccount, input.expenseAccount,
      round2(input.totalAmount), input.startDate, input.endDate, months,
    ]
  );
  return rowToSchedule(rows[0]);
}

/** List schedules for an entity / session, optionally filtering out fully amortized. */
export async function getSchedulesForEntity(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  includeFullyAmortized = false
): Promise<PrepaidSchedule[]> {
  const sql = includeFullyAmortized
    ? `SELECT * FROM tenant_prepaid_schedules WHERE tenant_id = $1 AND close_session_id = $2 ORDER BY start_date`
    : `SELECT * FROM tenant_prepaid_schedules WHERE tenant_id = $1 AND close_session_id = $2 AND NOT fully_amortized ORDER BY start_date`;
  const { rows } = await pool.query(sql, [tenantId, closeSessionId]);
  return rows.map(rowToSchedule);
}

/** Get entries for a schedule. */
export async function getEntriesForSchedule(
  pool: Pool,
  tenantId: string,
  scheduleId: string
): Promise<AmortizationEntry[]> {
  const { rows } = await pool.query(
    `SELECT * FROM tenant_prepaid_amortization_entries
     WHERE tenant_id = $1 AND schedule_id = $2 ORDER BY created_at`,
    [tenantId, scheduleId]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    scheduleId: r.schedule_id as string,
    closeSessionId: r.close_session_id as string,
    periodLabel: r.period_label as string,
    amount: String(r.amount),
    jeId: (r.je_id as string) ?? null,
    status: r.status as string,
    createdAt: String(r.created_at),
  }));
}

/** Propose amortization entries for all active schedules and create draft JEs. */
export async function proposeAmortizationEntries(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  periodLabel: string,
  createdBy: string
): Promise<AmortizationEntry[]> {
  assertNoAiMutationContext();

  const schedules = await getSchedulesForEntity(pool, tenantId, closeSessionId, false);
  const entries: AmortizationEntry[] = [];

  for (const sched of schedules) {
    // Compute monthly amount using Decimal.js
    const total = new Decimal(sched.totalAmount);
    const alreadyAmortized = new Decimal(sched.amortizedToDate);
    const remaining = total.minus(alreadyAmortized);
    if (remaining.lte(0)) continue;

    const monthly = total.dividedBy(sched.monthsCount).toDecimalPlaces(2);
    // Determine if this is the final amortization period
    const amortizedAfterThis = alreadyAmortized.plus(monthly);
    const isFinalPeriod = amortizedAfterThis.gte(total) || remaining.lte(monthly);
    // Final month: sweep remainder (absorb rounding residual so total is exact)
    const amount = isFinalPeriod
      ? remaining.toDecimalPlaces(2).toNumber()
      : Decimal.min(monthly, remaining).toDecimalPlaces(2).toNumber();
    if (amount <= 0) continue;

    // Create draft JE: debit expense, credit prepaid
    const je = await createDraftJE(pool, {
      closeSessionId,
      tenantId,
      memo: `Prepaid amortization: ${sched.description} — ${periodLabel}`,
      source: 'accrual',
      createdBy,
      lines: [
        {
          accountRef: sched.expenseAccount,
          debit: amount,
          credit: 0,
          description: `Amortize prepaid: ${sched.description}`,
          amountProvenance: { kind: 'engine_calculation' as const, ruleId: sched.id, ruleVersion: '1', inputs: { scheduleId: sched.id, period: periodLabel } },
        },
        {
          accountRef: sched.prepaidAccount,
          debit: 0,
          credit: amount,
          description: `Amortize prepaid: ${sched.description}`,
          amountProvenance: { kind: 'engine_calculation' as const, ruleId: sched.id, ruleVersion: '1', inputs: { scheduleId: sched.id, period: periodLabel } },
        },
      ],
    });

    const entryId = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO tenant_prepaid_amortization_entries
         (id, tenant_id, schedule_id, close_session_id, period_label, amount, je_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'proposed')
       RETURNING *`,
      [entryId, tenantId, sched.id, closeSessionId, periodLabel, amount, je.id]
    );
    entries.push({
      id: rows[0].id,
      scheduleId: rows[0].schedule_id,
      closeSessionId: rows[0].close_session_id,
      periodLabel: rows[0].period_label,
      amount: String(rows[0].amount),
      jeId: rows[0].je_id ?? null,
      status: rows[0].status,
      createdAt: String(rows[0].created_at),
    });
  }

  return entries;
}

/** Update schedule after a JE is posted — increment amortized_to_date. */
export async function updateScheduleAfterPosting(
  pool: Pool,
  tenantId: string,
  scheduleId: string,
  postedAmount: number
): Promise<PrepaidSchedule> {
  assertNoAiMutationContext();

  const amt = new Decimal(postedAmount).toDecimalPlaces(2).toNumber();
  const { rows } = await pool.query(
    `UPDATE tenant_prepaid_schedules
     SET amortized_to_date = amortized_to_date + $1,
         fully_amortized = (amortized_to_date + $1 >= total_amount),
         updated_at = now()
     WHERE id = $2 AND tenant_id = $3
     RETURNING *`,
    [amt, scheduleId, tenantId]
  );
  if (rows.length === 0) throw new Error('Schedule not found');
  return rowToSchedule(rows[0]);
}
