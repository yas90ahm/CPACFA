/**
 * QUARANTINED — CFA baseline snapshot (Valuation, DCF, Multiples). Not part of CPA close engine.
 * CPA Historical Snapshot — baseline metrics for CFA tasks (Valuation, DCF, Multiples).
 */

import type { Pool } from 'pg';
import { getAdjustedTrialBalance } from '../../services/adjusted_trial_balance_service.js';
import { buildValidatedStatements } from '../../services/financialStatements.js';
import type { TrialBalanceResult } from '../../types/financial.js';

export interface AccountingContextSnapshot {
  totalRevenue: number;
  netIncome: number;
  totalAssets: number;
  totalEquity: number;
  totalLiabilities: number;
  revenueCagr?: number;
  ebitdaMargin: number;
  netDebt?: number;
  periodLabel: string;
}

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

    const { balanceSheet, profitAndLoss } = buildValidatedStatements(trialBalance);
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
