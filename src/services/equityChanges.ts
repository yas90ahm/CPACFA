/**
 * Statement of Changes in Equity (minimal estimate).
 */

import type { BalanceSheet, EquityChangesStatement, ProfitAndLoss } from '../types/financial.js';
import { from, minus, plus } from '../utils/decimal.js';

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

  // OCI component of equity changes (ASC 220)
  const ociChanges: Array<{ label: string; amount: number }> = [];
  const totalOci = currentBalanceSheet.oci?.total ?? 0;
  if (currentBalanceSheet.oci && currentBalanceSheet.oci.items.length > 0) {
    for (const item of currentBalanceSheet.oci.items) {
      ociChanges.push({ label: item.label, amount: item.amount });
    }
  }

  // Residual: everything else (owner contributions/distributions)
  const knownChanges = totalOci !== 0 ? plus(netIncome, totalOci) : netIncome;
  if (openingEquity != null) {
    const residual = minus(closingEquity, plus(openingEquity, knownChanges));
    if (from(residual).abs().greaterThan(0.01)) {
      changes.push({ label: 'Owner contributions / distributions (net)', amount: residual });
    }
  }

  return {
    openingEquity,
    changes,
    ...(ociChanges.length > 0 ? { ociChanges } : {}),
    closingEquity,
    estimated: !priorBalanceSheet,
    note: priorBalanceSheet
      ? 'Equity changes estimated from net income and equity movement; reconcile with equity ledger for full roll-forward.'
      : 'Estimated from current balance sheet; provide prior period equity and transactions for full equity roll-forward.',
  };
}

