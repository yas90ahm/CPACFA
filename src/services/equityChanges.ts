/**
 * Statement of Changes in Equity (minimal estimate).
 */

import type { BalanceSheet, EquityChangesStatement, ProfitAndLoss } from '../types/financial.js';
import { from, minus } from '../utils/decimal.js';

export function buildEquityChangesStatement(
  currentBalanceSheet: BalanceSheet,
  priorBalanceSheet?: BalanceSheet,
  profitAndLoss?: ProfitAndLoss
): EquityChangesStatement {
  const openingEquity = priorBalanceSheet?.totalEquity;
  const closingEquity = currentBalanceSheet.totalEquity;
  const netIncome = profitAndLoss?.netIncome ?? 0;

  const changes: Array<{ label: string; amount: number }> = [];
  if (profitAndLoss) {
    changes.push({ label: 'Net income', amount: netIncome });
  }
  if (openingEquity != null) {
    const residual = minus(minus(closingEquity, openingEquity), netIncome);
    if (from(residual).abs().greaterThan(0.01)) {
      changes.push({ label: 'Owner contributions / distributions (net)', amount: residual });
    }
  }

  return {
    openingEquity,
    changes,
    closingEquity,
    estimated: !priorBalanceSheet,
    note: priorBalanceSheet
      ? 'Equity changes estimated from net income and equity movement; reconcile with equity ledger for full roll-forward.'
      : 'Estimated from current balance sheet; provide prior period equity and transactions for full equity roll-forward.',
  };
}

