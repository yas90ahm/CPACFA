/**
 * Mapping Cross-Validation Service (Layer 4)
 *
 * After mapping completes, run a lightweight statement preview to catch
 * structural errors BEFORE full statement generation.
 *
 * This catches mapping errors that individual account checks miss:
 * - Balance sheet doesn't balance → something mapped to wrong statement
 * - Revenue is negative → revenue account probably an expense
 * - Total assets unreasonably small → asset accounts mapped to expenses
 * - Net income sign contradicts equity movement
 *
 * If critical issues found, blocks advancement to reconciliation.
 */

import type { Pool } from 'pg';
import { from as dec, sumRound2, minus, plus, round2 } from '../utils/decimal.js';

export type CrossValidationSeverity = 'critical' | 'warning' | 'info';

export interface CrossValidationIssue {
  check: string;
  severity: CrossValidationSeverity;
  message: string;
  details: Record<string, unknown>;
}

export interface CrossValidationResult {
  passes: boolean;
  issues: CrossValidationIssue[];
  summary: {
    totalChecks: number;
    passed: number;
    critical: number;
    warning: number;
  };
}

interface MappedEntry {
  accountCode: string;
  accountName: string;
  fsLineId: string;
  fsLineStatement: string; // BS or PL
  debit: number;
  credit: number;
}

/**
 * Run cross-validation checks on mapped trial balance.
 * Operates on the mapped TB — no DB queries needed.
 */
export function runMappingCrossValidation(
  mappedEntries: MappedEntry[]
): CrossValidationResult {
  const issues: CrossValidationIssue[] = [];

  // Aggregate by statement — all accumulation via Decimal.js to prevent float drift
  let bsDebit = 0, bsCredit = 0;
  let plDebit = 0, plCredit = 0;
  let totalRevenue = 0;
  let totalExpense = 0;
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let unmappedCount = 0;

  for (const e of mappedEntries) {
    const net = minus(e.debit, e.credit);
    const stmt = (e.fsLineStatement ?? '').toUpperCase();

    if (stmt === 'BS') {
      bsDebit = plus(bsDebit, e.debit);
      bsCredit = plus(bsCredit, e.credit);
      if (e.fsLineId.startsWith('fs_asset')) totalAssets = plus(totalAssets, net);
      else if (e.fsLineId.startsWith('fs_liability')) totalLiabilities = plus(totalLiabilities, net);
      else if (e.fsLineId.startsWith('fs_equity')) totalEquity = plus(totalEquity, net);
    } else if (stmt === 'PL') {
      plDebit = plus(plDebit, e.debit);
      plCredit = plus(plCredit, e.credit);
      if (e.fsLineId.startsWith('fs_revenue') || e.fsLineId.startsWith('fs_interest_income') || e.fsLineId.startsWith('fs_other_income') || e.fsLineId.startsWith('fs_other_gain')) {
        totalRevenue = plus(totalRevenue, minus(e.credit, e.debit));
      } else {
        totalExpense = plus(totalExpense, minus(e.debit, e.credit));
      }
    } else {
      unmappedCount++;
    }
  }

  const netIncome = minus(totalRevenue, totalExpense);
  const bsImbalance = round2(dec(bsDebit).minus(bsCredit).abs().toNumber());
  const totalLedger = sumRound2(mappedEntries.map((e) => e.debit));

  // Check 1: Balance sheet equation (A = L + E + Net Income)
  // BS should balance after including net income in retained earnings
  if (bsImbalance > 1 && totalLedger > 0) {
    const bsImbalancePct = dec(bsImbalance).div(totalLedger || 1).times(100).toDecimalPlaces(4).toNumber();
    if (bsImbalancePct > 0.01) {
      issues.push({
        check: 'bs_equation',
        severity: bsImbalancePct > 1 ? 'critical' : 'warning',
        message: `Balance sheet is out of balance — likely one or more accounts mapped to the wrong statement`,
        details: { bsDebit, bsCredit, imbalance: bsImbalance },
      });
    }
  }

  // Check 2: Revenue should be positive (credit-normal)
  if (totalRevenue < 0 && Math.abs(totalRevenue) > 1000) {
    issues.push({
      check: 'revenue_sign',
      severity: 'critical',
      message: `Total revenue is negative — revenue accounts may be mapped to expense lines or vice versa`,
      details: { totalRevenue },
    });
  }

  // Check 3: Total assets should be positive (debit-normal)
  if (totalAssets < 0 && Math.abs(totalAssets) > 1000) {
    issues.push({
      check: 'asset_sign',
      severity: 'critical',
      message: `Total assets is negative — asset accounts may be mapped to liability or contra lines`,
      details: { totalAssets },
    });
  }

  // Check 4: Expense shouldn't be negative overall
  if (totalExpense < 0 && Math.abs(totalExpense) > 1000) {
    issues.push({
      check: 'expense_sign',
      severity: 'warning',
      message: `Total expenses is negative — some expense accounts may be mapped to revenue lines`,
      details: { totalExpense },
    });
  }

  // Check 5: Unmapped accounts
  if (unmappedCount > 0) {
    issues.push({
      check: 'unmapped_accounts',
      severity: 'critical',
      message: `${unmappedCount} accounts have no statement mapping — they will be excluded from financial statements`,
      details: { unmappedCount },
    });
  }

  // Check 6: Liabilities should be negative (credit-normal, but stored as debit-credit)
  if (totalLiabilities > 0 && totalLiabilities > 1000) {
    issues.push({
      check: 'liability_sign',
      severity: 'warning',
      message: `Total liabilities has a net debit balance — some liability accounts may be mapped incorrectly`,
      details: { totalLiabilities },
    });
  }

  // Check 7: Revenue-to-expense ratio sanity
  if (totalRevenue > 0 && totalExpense > 0) {
    const ratio = totalExpense / totalRevenue;
    if (ratio > 5) {
      issues.push({
        check: 'revenue_expense_ratio',
        severity: 'warning',
        message: `Expenses are ${ratio.toFixed(1)}x revenue — possible mapping errors between revenue and expense accounts`,
        details: { totalRevenue, totalExpense, ratio },
      });
    }
  }

  // Check 8: PL net income should roughly explain equity change
  // (This is a weak check — equity has many components, but a massive mismatch is suspicious)
  if (Math.abs(netIncome) > 0 && Math.abs(totalEquity) > 0) {
    const equityRatio = Math.abs(netIncome / totalEquity);
    if (equityRatio > 10) {
      issues.push({
        check: 'income_equity_coherence',
        severity: 'info',
        message: `Net income is disproportionately large relative to equity — verify revenue/expense mappings`,
        details: { netIncome, totalEquity },
      });
    }
  }

  const critical = issues.filter((i) => i.severity === 'critical').length;
  const warning = issues.filter((i) => i.severity === 'warning').length;
  const totalChecks = 8;

  return {
    passes: critical === 0,
    issues,
    summary: {
      totalChecks,
      passed: totalChecks - issues.length,
      critical,
      warning,
    },
  };
}
