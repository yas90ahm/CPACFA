/**
 * Stock compensation service — thin wrapper over repo CRUD + period expense computation (ASC 718 / IFRS 2).
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/stock_compensation_repository.js';
import type { StockGrantRow, StockValuationRow, StockExpenseRow } from '../db/repositories/stock_compensation_repository.js';
import { round2 } from '../utils/decimal.js';

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
  periodLabel: string
): Promise<StockExpenseRow[]> {
  const grants = await repo.listGrants(pool, tenantId, { status: 'active' });
  const results: StockExpenseRow[] = [];

  for (const grant of grants) {
    const fairValue = grant.fairValuePerShare ?? 0;
    const schedule = grant.vestingSchedule ?? [];
    const totalShares = grant.sharesGranted;

    if (totalShares <= 0 || fairValue <= 0) continue;

    // Determine vesting fraction for this period
    const vestedEntries = schedule.filter((e) => e.vested);
    const sharesVestedSoFar = vestedEntries.reduce((sum, e) => sum + e.shares, 0);
    const vestingFraction = totalShares > 0 ? sharesVestedSoFar / totalShares : 0;

    // Total expense = fairValue * sharesGranted; period expense = total * vestingFraction / periods
    const totalGrantExpense = fairValue * totalShares;
    const periodCount = Math.max(1, schedule.length);
    const periodExpense = round2(totalGrantExpense / periodCount);

    // Cumulative = all expense recorded + this period
    const priorExpenses = await repo.listExpenses(pool, tenantId, periodLabel);
    const priorForGrant = priorExpenses.filter((e) => e.grantId === grant.id);
    const priorCumulative = priorForGrant.reduce((sum, e) => sum + e.cumulativeExpense, 0);
    const cumulativeExpense = round2(priorCumulative + periodExpense);

    const expense = await repo.recordExpense(pool, tenantId, {
      grantId: grant.id,
      periodLabel,
      expenseAmount: periodExpense,
      cumulativeExpense,
      sharesVested: sharesVestedSoFar,
    });
    results.push(expense);
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
    totalExpense += expense.expenseAmount;
    const grant = grantMap.get(expense.grantId);
    const grantType = grant?.grantType ?? 'unknown';
    byGrantType[grantType] = (byGrantType[grantType] ?? 0) + expense.expenseAmount;
  }

  return {
    periodLabel,
    totalExpense: round2(totalExpense),
    byGrantType,
    grantCount: grants.length,
  };
}
