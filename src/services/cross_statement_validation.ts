/**
 * Cross-statement validation for certification.
 * Re-validates at certification time (not cached).
 * All comparisons use Decimal.js.
 */

import type { BalanceSheet, ProfitAndLoss, CashFlowStatement, EquityChangesStatement } from '../types/financial.js';
import { from as decimalFrom, sumRound2 } from '../utils/decimal.js';

export interface ValidationCheck {
  check_name: string;
  check_type: 'hard' | 'soft';
  passes: boolean;
  message: string | null;
  details?: unknown;
}

/** Sum BS assets whose label matches cash/bank. */
function getCashFromBalanceSheet(bs: BalanceSheet): number {
  return sumRound2(bs.assets.filter((a) => /cash|bank/i.test(a.label ?? '')).map((a) => a.amount));
}

export interface CrossStatementTieOptions {
  /** Prior period certified retained earnings (null = first close, RE assumed $0). */
  priorRetainedEarnings?: number | null;
}

/**
 * Run cross-statement tie checks at certification.
 * Returns ValidationCheck[]; caller blocks certification if any hard check fails.
 */
export function runCrossStatementValidationForCertification(
  bs: BalanceSheet,
  pl: ProfitAndLoss,
  cf: CashFlowStatement | null,
  equity: EquityChangesStatement | null,
  opts?: CrossStatementTieOptions
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const d = (n: number) => decimalFrom(n).toDecimalPlaces(2);
  const TOLERANCE = decimalFrom('0.01');

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
      message: 'Statement of changes in equity has not been generated',
    });
  }

  if (cf) {
    const sectionTotal = d(sumRound2([
      ...cf.operating.map((line) => line.amount),
      ...cf.investing.map((line) => line.amount),
      ...cf.financing.map((line) => line.amount),
    ]));
    const reportedNetChangeValue = Number(cf.netChangeInCash);
    const reportedNetChangeIsValid = Number.isFinite(reportedNetChangeValue);
    const reportedNetChange = d(reportedNetChangeIsValid ? reportedNetChangeValue : 0);
    const sectionVariance = sectionTotal.minus(reportedNetChange).abs();
    const sectionsTie = reportedNetChangeIsValid && sectionVariance.lte(TOLERANCE);
    checks.push({
      check_name: 'cash_flow_sections_tie',
      check_type: 'hard',
      passes: sectionsTie,
      message: sectionsTie
        ? null
        : !reportedNetChangeIsValid
          ? 'Cash-flow statement is missing a valid net change in cash.'
          : `Cash-flow sections total $${sectionTotal.toFixed(2)} but reported net change is $${reportedNetChange.toFixed(2)}; variance $${sectionVariance.toFixed(2)}`,
    });

    if (reportedNetChangeIsValid && cf.beginningCash != null && cf.endingCash != null) {
      const expectedEnding = d(cf.beginningCash).plus(reportedNetChange).toDecimalPlaces(2);
      const endingCash = d(cf.endingCash);
      const rollforwardVariance = expectedEnding.minus(endingCash).abs();
      const rollforwardTies = rollforwardVariance.lte(TOLERANCE);
      checks.push({
        check_name: 'cash_rollforward_tie',
        check_type: 'hard',
        passes: rollforwardTies,
        message: rollforwardTies
          ? null
          : `Beginning cash $${d(cf.beginningCash).toFixed(2)} plus net change $${reportedNetChange.toFixed(2)} does not equal ending cash $${endingCash.toFixed(2)}; variance $${rollforwardVariance.toFixed(2)}`,
      });
    }

    if (cf.estimated) {
      checks.push({
        check_name: 'cash_flow_estimation_warning',
        check_type: 'soft',
        passes: false,
        message: 'Cash-flow statement is estimated from trial-balance data and requires reviewer reconciliation to source cash activity.',
      });
    }
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

  // 5. Retained earnings tie: closing equity = opening equity + sum(changes) + sum(ociChanges)
  if (equity && equity.openingEquity != null && equity.closingEquity != null) {
    const opening = d(equity.openingEquity);
    const changesSum = equity.changes.reduce(
      (acc, c) => acc.plus(d(c.amount)),
      decimalFrom(0)
    );
    const ociSum = (equity.ociChanges ?? []).reduce(
      (acc, c) => acc.plus(d(c.amount)),
      decimalFrom(0)
    );
    const expectedClosing = opening.plus(changesSum).plus(ociSum).toDecimalPlaces(2);
    const actualClosing = d(equity.closingEquity);
    const reTie = expectedClosing.equals(actualClosing);
    checks.push({
      check_name: 'retained_earnings_tie',
      check_type: 'hard',
      passes: reTie,
      message: reTie
        ? null
        : `RE tie failed: opening equity ${equity.openingEquity} + changes ${changesSum.toFixed(2)} + OCI ${ociSum.toFixed(2)} = ${expectedClosing.toFixed(2)} ≠ closing equity ${equity.closingEquity}`,
    });
  }

  // 6. Net income tie: income-statement net income → indirect cash-flow operating section start.
  if (cf && cf.operating.length > 0) {
    const isNI = d(pl.netIncome);
    const scfNILine = cf.operating.find((line) => /net income/i.test(line.label));
    if (scfNILine) {
      const scfNI = d(scfNILine.amount);
      const variance = isNI.minus(scfNI).abs();
      const passes = variance.lte(TOLERANCE);
      checks.push({
        check_name: 'net_income_is_to_scf_tie',
        check_type: 'hard',
        passes,
        message: passes
          ? null
          : `Net income tie failed: IS shows $${isNI.toFixed(2)}, SCF operating start shows $${scfNI.toFixed(2)}, variance $${variance.toFixed(2)}`,
      });
    }
  }

  // 7. Retained earnings continuity: BS RE = prior period closing RE + NI − dividends
  if (opts && opts.priorRetainedEarnings !== undefined) {
    const priorRE = d(opts.priorRetainedEarnings ?? 0);
    const currentNI = d(pl.netIncome);
    // Find dividends declared in equity changes (if available)
    const dividends = equity
      ? d(sumRound2(
          equity.changes
            .filter((c) => /dividend/i.test(c.label))
            .map((c) => c.amount)
        ))
      : decimalFrom(0);
    // Find current BS retained earnings from equity section
    const bsRELine = bs.equity.find((e) => /retained earnings/i.test(e.label ?? ''));
    if (bsRELine) {
      const bsRE = d(bsRELine.amount);
      const expected = priorRE.plus(currentNI).minus(dividends).toDecimalPlaces(2);
      const variance = bsRE.minus(expected).abs();
      const passes = variance.lte(TOLERANCE);
      checks.push({
        check_name: 'retained_earnings_continuity',
        check_type: 'hard',
        passes,
        message: passes
          ? null
          : `Retained earnings continuity failed: prior RE $${priorRE.toFixed(2)} + NI $${currentNI.toFixed(2)} − dividends $${dividends.toFixed(2)} = expected $${expected.toFixed(2)}, BS shows $${bsRE.toFixed(2)}, variance $${variance.toFixed(2)}`,
      });
    }
  }

  return checks;
}
