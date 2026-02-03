/**
 * CPA Historical Snapshot — baseline metrics for CFA tasks (Valuation, DCF, Multiples).
 * When a user triggers a CFA task, the Orchestrator must first call the CPA engine to fetch
 * this snapshot and inject it as a read-only accounting_context into the Strategic Analyst's prompt.
 * Strict Rule: The CFA Agent must cite these Accounting-Locked numbers; it is forbidden from
 * inventing its own starting points for projections.
 */

import type { Pool } from 'pg';
import { getAdjustedTrialBalance } from './adjusted_trial_balance_service.js';
import { buildFinancialStatements } from './financialStatements.js';
import type { TrialBalanceResult } from '../types/financial.js';

export interface AccountingContextSnapshot {
  /** Total revenue (P&L) — Accounting-Locked. */
  totalRevenue: number;
  /** Net income (P&L) — Accounting-Locked. */
  netIncome: number;
  /** Total assets (BS) — Accounting-Locked. */
  totalAssets: number;
  /** Total equity (BS) — Accounting-Locked. */
  totalEquity: number;
  /** Total liabilities (BS) — Accounting-Locked. */
  totalLiabilities: number;
  /** Revenue CAGR (e.g. YoY) when prior period available; otherwise undefined. */
  revenueCagr?: number;
  /** EBITDA margin proxy: netIncome / totalRevenue when revenue > 0. */
  ebitdaMargin: number;
  /** Net debt proxy: interest-bearing debt minus cash when identifiable; otherwise undefined. */
  netDebt?: number;
  /** Period label this snapshot is for. */
  periodLabel: string;
}

/**
 * Fetch Historical Snapshot from the CPA engine (adjusted TB → statements → metrics).
 * Use before running any CFA task (DCF, Valuation, Multiples). Inject the result as
 * accounting_context into the Strategic Analyst's prompt so the CFA Agent cites these
 * numbers and does not invent starting points.
 */
export async function getHistoricalSnapshotFromCPA(
  tenantId: string,
  periodLabel: string,
  pool: Pool | undefined
): Promise<AccountingContextSnapshot | null> {
  if (!pool) return null;
  try {
    const entries = await getAdjustedTrialBalance(tenantId, periodLabel, pool);
    if (!entries.length) return null;

    const totalDebits = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
    const totalCredits = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
    const trialBalance: TrialBalanceResult = {
      entries,
      totalDebits,
      totalCredits,
      balances: Math.abs(totalDebits - totalCredits) < 0.02,
      errors: [],
    };

    const { balanceSheet, profitAndLoss } = buildFinancialStatements(trialBalance);
    const totalRevenue = profitAndLoss.totalRevenue ?? 0;
    const netIncome = profitAndLoss.netIncome ?? 0;
    const totalAssets = balanceSheet.totalAssets ?? 0;
    const totalEquity = balanceSheet.totalEquity ?? 0;
    const totalLiabilities = balanceSheet.totalLiabilities ?? 0;

    const ebitdaMargin = totalRevenue !== 0 ? netIncome / totalRevenue : 0;

    let netDebt: number | undefined;
    const cashLine = balanceSheet.assets?.find((a) => /cash/i.test(a.label ?? ''));
    const cash = cashLine?.amount ?? 0;
    const debtLines = balanceSheet.liabilities?.filter(
      (l) => /debt|loan|borrowing|note\s*payable/i.test(l.label ?? '')
    );
    const debt = debtLines?.reduce((s, l) => s + (l.amount ?? 0), 0) ?? 0;
    if (debtLines?.length || cashLine) {
      netDebt = debt - Math.abs(cash);
    }

    return {
      totalRevenue,
      netIncome,
      totalAssets,
      totalEquity,
      totalLiabilities,
      ebitdaMargin,
      netDebt,
      periodLabel,
    };
  } catch {
    return null;
  }
}

/** Format snapshot as a read-only block for injection into CFA prompts. */
export function formatAccountingContextBlock(snapshot: AccountingContextSnapshot): string {
  const lines: string[] = [
    '--- Accounting-Locked Baseline (CPA Historical Snapshot) ---',
    `Total Revenue: ${snapshot.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
    `Net Income: ${snapshot.netIncome.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
    `Total Assets: ${snapshot.totalAssets.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
    `Total Equity: ${snapshot.totalEquity.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
    `Total Liabilities: ${snapshot.totalLiabilities.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
    `EBITDA Margin (net income/revenue): ${(snapshot.ebitdaMargin * 100).toFixed(1)}%`,
  ];
  if (snapshot.revenueCagr != null) {
    lines.push(`Revenue CAGR: ${(snapshot.revenueCagr * 100).toFixed(1)}%`);
  }
  if (snapshot.netDebt != null) {
    lines.push(`Net Debt: ${snapshot.netDebt.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  }
  lines.push(`Period: ${snapshot.periodLabel}`);
  lines.push('--- End Accounting-Locked Baseline ---');
  return lines.join('\n');
}
