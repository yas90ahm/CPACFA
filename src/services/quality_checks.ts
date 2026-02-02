/**
 * Statement quality checks: reconciliation and anomaly signals.
 */

import type { BalanceSheet, ProfitAndLoss, CashFlowStatement, EquityChangesStatement } from '../types/financial.js';

export type QualitySeverity = 'info' | 'warning' | 'critical';

export interface QualityCheck {
  id: string;
  severity: QualitySeverity;
  title: string;
  message: string;
  metric?: number;
}

export function evaluateQualityChecks(
  balanceSheet: BalanceSheet,
  profitAndLoss: ProfitAndLoss,
  cashFlow?: CashFlowStatement,
  equityChanges?: EquityChangesStatement
): QualityCheck[] {
  const checks: QualityCheck[] = [];

  if (!balanceSheet.balances) {
    checks.push({
      id: 'imbalance',
      severity: 'critical',
      title: 'Balance Sheet Imbalance',
      message: 'Assets do not equal Liabilities + Equity. Re-check trial balance classification and totals.',
    });
  }

  const hasCash = balanceSheet.assets.some((a) => /cash|bank/i.test(a.label ?? ''));
  if (!hasCash) {
    checks.push({
      id: 'missing-cash',
      severity: 'warning',
      title: 'Missing Cash Line',
      message: 'No cash or bank line detected in assets. Verify bank statements or cash accounts.',
    });
  }

  const netMargin = profitAndLoss.totalRevenue
    ? profitAndLoss.netIncome / (profitAndLoss.totalRevenue || 1)
    : 0;
  if (netMargin > 0.6 || netMargin < -0.2) {
    checks.push({
      id: 'abnormal-margin',
      severity: 'warning',
      title: 'Abnormal Net Margin',
      message: 'Net margin is unusually high or low; verify revenue and expense classification.',
      metric: netMargin,
    });
  }

  if (balanceSheet.totalEquity < 0) {
    checks.push({
      id: 'negative-equity',
      severity: 'warning',
      title: 'Negative Equity',
      message: 'Equity is negative; review liabilities, accumulated losses, or shareholder balances.',
      metric: balanceSheet.totalEquity,
    });
  }

  if (cashFlow?.beginningCash != null && cashFlow?.endingCash != null) {
    const implied = cashFlow.endingCash - cashFlow.beginningCash;
    const delta = Math.abs(implied - cashFlow.netChangeInCash);
    if (delta > 1) {
      checks.push({
        id: 'cashflow-recon',
        severity: 'warning',
        title: 'Cash Flow Reconciliation',
        message: 'Cash flow net change does not reconcile to beginning/ending cash.',
        metric: delta,
      });
    }
    const bsCash = balanceSheet.assets.find((a) => /cash|bank/i.test(a.label ?? ''))?.amount;
    if (bsCash != null && Math.abs(bsCash - cashFlow.endingCash) > 1) {
      checks.push({
        id: 'cashflow-bs-cash',
        severity: 'warning',
        title: 'Cash vs Balance Sheet',
        message: 'Cash Flow ending cash does not match Balance Sheet cash line.',
        metric: bsCash - cashFlow.endingCash,
      });
    }
  }

  if (equityChanges?.closingEquity != null) {
    const delta = Math.abs(equityChanges.closingEquity - balanceSheet.totalEquity);
    if (delta > 1) {
      checks.push({
        id: 'equity-rollforward',
        severity: 'warning',
        title: 'Equity Rollforward Mismatch',
        message: 'Equity changes closing balance does not match Balance Sheet equity.',
        metric: delta,
      });
    }
  }

  return checks;
}
