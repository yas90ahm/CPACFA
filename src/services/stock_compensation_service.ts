/**
 * Stock compensation service — thin wrapper over repo CRUD + period expense computation (ASC 718 / IFRS 2).
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/stock_compensation_repository.js';
import type { StockGrantRow, StockValuationRow, StockExpenseRow } from '../db/repositories/stock_compensation_repository.js';
import { round2, plus } from '../utils/decimal.js';
import { createDraftJE } from './journal_entry_service.js';

export type { StockGrantRow, StockValuationRow, StockExpenseRow };

// Re-export repo CRUD
export const createGrant = repo.createGrant;
export const getGrant = repo.getGrant;
export const listGrants = repo.listGrants;
export const updateGrant = repo.updateGrant;
export const recordValuation = repo.recordValuation;
export const listValuations = repo.listValuations;
export const listExpenses = repo.listExpenses;

export interface CompensationSummary {
  periodLabel: string;
  totalExpense: number;
  byGrantType: Record<string, number>;
  grantCount: number;
}

/**
 * Compute stock compensation expense for a period.
 * For each active grant, calculate period expense from fair value * vesting fraction and record it.
 */
export async function computeExpenseForPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  closeSessionId?: string,
  createdBy?: string
): Promise<StockExpenseRow[]> {
  const grants = await repo.listGrants(pool, tenantId, { status: 'active' });
  const results: StockExpenseRow[] = [];
  let totalPeriodExpense = 0;

  for (const grant of grants) {
    const fairValue = Number(grant.fairValuePerShare ?? 0);
    const schedule = grant.vestingSchedule ?? [];
    const totalShares = Number(grant.sharesGranted);

    if (totalShares <= 0 || fairValue <= 0) continue;

    // Determine vesting fraction for this period (ASC 718: expense = FV × vesting fraction)
    const vestedEntries = schedule.filter((e) => e.vested);
    const sharesVestedSoFar = vestedEntries.reduce((sum, e) => sum + e.shares, 0);
    const vestingFraction = Number(totalShares) > 0 ? sharesVestedSoFar / Number(totalShares) : 0;

    // Period expense = total grant FV × (cumulative vesting fraction − prior cumulative fraction)
    const totalGrantExpense = round2(fairValue * totalShares);
    const targetCumulative = round2(totalGrantExpense * vestingFraction);

    // Cumulative expense already recorded for this grant
    const priorExpenses = await repo.listExpenses(pool, tenantId, periodLabel);
    const priorForGrant = priorExpenses.filter((e) => e.grantId === grant.id);
    const priorCumulative = priorForGrant.reduce((sum, e) => plus(sum, round2(e.cumulativeExpense)), 0);
    const periodExpense = round2(Math.max(0, targetCumulative - priorCumulative));

    if (periodExpense <= 0) continue;

    const cumulativeExpense = plus(priorCumulative, periodExpense);
    totalPeriodExpense = plus(totalPeriodExpense, periodExpense);

    const expense = await repo.recordExpense(pool, tenantId, {
      grantId: grant.id,
      periodLabel,
      expenseAmount: periodExpense,
      cumulativeExpense,
      sharesVested: sharesVestedSoFar,
    });
    results.push(expense);
  }

  // Create draft JE: DR Stock Compensation Expense, CR APIC
  if (closeSessionId && totalPeriodExpense > 0) {
    const compExpAccount = '6300'; // Stock compensation expense
    const apicAccount = '3200'; // Additional paid-in capital
    await createDraftJE(pool, {
      closeSessionId,
      tenantId,
      memo: `Stock compensation expense — ${periodLabel} — ${grants.length} grant(s) — $${totalPeriodExpense.toFixed(2)}`,
      source: 'accrual',
      createdBy: createdBy ?? 'module:stock_comp',
      lines: [
        {
          accountRef: compExpAccount,
          debit: totalPeriodExpense,
          credit: 0,
          description: `Stock compensation expense (${grants.length} grants)`,
          amountProvenance: { kind: 'engine_calculation' as const, ruleId: `stock_comp_${periodLabel}`, ruleVersion: '1', inputs: { periodLabel, grantCount: grants.length } },
        },
        {
          accountRef: apicAccount,
          debit: 0,
          credit: totalPeriodExpense,
          description: `APIC — stock compensation`,
          amountProvenance: { kind: 'engine_calculation' as const, ruleId: `stock_comp_${periodLabel}`, ruleVersion: '1', inputs: { periodLabel, grantCount: grants.length } },
        },
      ],
    });
  }

  return results;
}

/**
 * Get compensation summary for a period — aggregate expenses by grant type.
 */
export async function getCompensationSummary(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<CompensationSummary> {
  const expenses = await repo.listExpenses(pool, tenantId, periodLabel);
  const grants = await repo.listGrants(pool, tenantId);
  const grantMap = new Map(grants.map((g) => [g.id, g]));

  let totalExpense = 0;
  const byGrantType: Record<string, number> = {};

  for (const expense of expenses) {
    totalExpense = plus(totalExpense, round2(expense.expenseAmount));
    const grant = grantMap.get(expense.grantId);
    const grantType = grant?.grantType ?? 'unknown';
    byGrantType[grantType] = plus(byGrantType[grantType] ?? 0, round2(expense.expenseAmount));
  }

  return {
    periodLabel,
    totalExpense: round2(totalExpense),
    byGrantType,
    grantCount: grants.length,
  };
}
