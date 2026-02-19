/**
 * Cross-statement validation for certification.
 * Re-validates at certification time (not cached).
 * All comparisons use Decimal.js.
 */

import type { BalanceSheet, ProfitAndLoss, CashFlowStatement, EquityChangesStatement } from '../types/financial.js';
import { from as decimalFrom } from '../utils/decimal.js';

export interface ValidationCheck {
  check_name: string;
  check_type: 'hard' | 'soft';
  passes: boolean;
  message: string | null;
  details?: unknown;
}

/** Sum BS assets whose label matches cash/bank. */
function getCashFromBalanceSheet(bs: BalanceSheet): number {
  return bs.assets
    .filter((a) => /cash|bank/i.test(a.label ?? ''))
    .reduce((s, a) => s + a.amount, 0);
}

/**
 * Run cross-statement tie checks at certification.
 * Returns ValidationCheck[]; caller blocks certification if any hard check fails.
 */
export function runCrossStatementValidationForCertification(
  bs: BalanceSheet,
  pl: ProfitAndLoss,
  cf: CashFlowStatement | null,
  equity: EquityChangesStatement | null
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const d = (n: number) => decimalFrom(n).toDecimalPlaces(2);

  // Require all four statements
  if (!cf) {
    checks.push({
      check_name: 'cash_flow_exists',
      check_type: 'hard',
      passes: false,
      message: 'Cash Flow Statement has not been generated',
    });
  }
  if (!equity) {
    checks.push({
      check_name: 'equity_statement_exists',
      check_type: 'hard',
      passes: false,
      message: 'Statement of Stockholders Equity has not been generated',
    });
  }

  // 1. A = L + E
  const a = d(bs.totalAssets);
  const lPlusE = d(bs.totalLiabilities).plus(d(bs.totalEquity));
  const balanceSheetEq = a.equals(lPlusE);
  checks.push({
    check_name: 'balance_sheet_equation',
    check_type: 'hard',
    passes: balanceSheetEq,
    message: balanceSheetEq ? null : `A=${bs.totalAssets} ≠ L+E=${bs.totalLiabilities + bs.totalEquity}`,
  });

  // 2. Net income tie: IS net income = Equity net income
  if (equity) {
    const isNetIncome = pl.netIncome;
    const equityNetIncome = equity.changes.find((c) => /net income/i.test(c.label))?.amount ?? isNetIncome;
    const tie = d(isNetIncome).equals(d(equityNetIncome));
    checks.push({
      check_name: 'net_income_tie',
      check_type: 'hard',
      passes: tie,
      message: tie ? null : `IS net income ${isNetIncome} ≠ Equity net income ${equityNetIncome}`,
    });
  }

  // 3. Cash tie: CF ending cash = BS cash
  if (cf && cf.endingCash != null) {
    const bsCash = getCashFromBalanceSheet(bs);
    const tie = d(cf.endingCash).equals(d(bsCash));
    checks.push({
      check_name: 'cash_tie',
      check_type: 'hard',
      passes: tie,
      message: tie ? null : `CF ending cash ${cf.endingCash} ≠ BS cash ${bsCash}`,
    });
  }

  // 4. Equity tie: equity statement closingEquity = BS total equity
  if (equity && equity.closingEquity != null) {
    const totalEquity = bs.totalEquity;
    const reTie = d(equity.closingEquity).equals(d(totalEquity));
    checks.push({
      check_name: 'equity_tie',
      check_type: 'hard',
      passes: reTie,
      message: reTie ? null : `Equity statement closing ${equity.closingEquity} ≠ BS total equity ${totalEquity}`,
    });
  }

  return checks;
}
