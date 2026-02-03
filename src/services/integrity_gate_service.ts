/**
 * Integrity Gate — Hard Gate middleware that runs after any Agentic adjustment.
 *
 * Performs deterministic checks:
 * 1. Sum(Debits) == Sum(Credits) (trial balance)
 * 2. Assets == Liabilities + Equity (balance sheet equation)
 *
 * If the math fails, the service intercepts the response before it reaches the user
 * and returns an error to the Agent so the user never sees a Balance Sheet that doesn't balance.
 */

import { absGt } from '../utils/decimal.js';

/** Error returned to the Agent when the gate fails; response must not reach the user. */
export const INTEGRITY_GATE_CRITICAL_MESSAGE =
  'CRITICAL: Your proposed adjustment unbalances the ledger. Re-calculating.';

const DEFAULT_TOLERANCE = 0.01;

export interface IntegrityGateTrialBalanceInput {
  totalDebits: number;
  totalCredits: number;
}

export interface IntegrityGateTrialBalanceFromEntries {
  entries: Array<{ debit?: number; credit?: number }>;
}

export interface IntegrityGateBalanceSheetInput {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export interface IntegrityGateInput {
  trialBalance: IntegrityGateTrialBalanceInput | IntegrityGateTrialBalanceFromEntries;
  balanceSheet: IntegrityGateBalanceSheetInput;
  /** Tolerance for floating-point comparison (default 0.01). */
  tolerance?: number;
}

export interface IntegrityGateResult {
  passed: boolean;
  error?: string;
  /** Check results for audit (V1: TB, V2: BS). */
  checks?: { trialBalanceBalances: boolean; balanceSheetBalances: boolean };
}

/**
 * Compute total debits and credits from entries when trial balance is given as entries.
 */
function getTrialBalanceTotals(
  trialBalance: IntegrityGateInput['trialBalance']
): { totalDebits: number; totalCredits: number } {
  if ('totalDebits' in trialBalance && 'totalCredits' in trialBalance) {
    return {
      totalDebits: trialBalance.totalDebits,
      totalCredits: trialBalance.totalCredits,
    };
  }
  const entries = 'entries' in trialBalance ? trialBalance.entries : [];
  let totalDebits = 0;
  let totalCredits = 0;
  for (const e of entries) {
    totalDebits += e.debit ?? 0;
    totalCredits += e.credit ?? 0;
  }
  return { totalDebits, totalCredits };
}

/**
 * Run the Hard Gate: deterministic check that Sum(Debits) == Sum(Credits) and
 * Assets == Liabilities + Equity. If either fails, return passed: false and the
 * CRITICAL message so the response can be intercepted before reaching the user.
 */
export function runIntegrityGate(input: IntegrityGateInput): IntegrityGateResult {
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;
  const { totalDebits, totalCredits } = getTrialBalanceTotals(input.trialBalance);
  const { totalAssets, totalLiabilities, totalEquity } = input.balanceSheet;

  const trialBalanceGapExceeds = absGt(totalDebits, totalCredits, tolerance);
  const trialBalanceBalances = !trialBalanceGapExceeds;

  const rhs = totalLiabilities + totalEquity;
  const balanceSheetGapExceeds = absGt(totalAssets, rhs, tolerance);
  const balanceSheetBalances = !balanceSheetGapExceeds;

  const passed = trialBalanceBalances && balanceSheetBalances;

  return {
    passed,
    error: passed ? undefined : INTEGRITY_GATE_CRITICAL_MESSAGE,
    checks: {
      trialBalanceBalances,
      balanceSheetBalances,
    },
  };
}
