/**
 * Integrity Gate — Hard Gate middleware that runs after any Agentic adjustment.
 * MathematicalIntegrityError is the primary gatekeeper: if totalDebits !== totalCredits or
 * Assets !== Liabilities + Equity, the system MUST throw MathematicalIntegrityError (422).
 *
 * Accounting Laws are defined in shared/config/financial_rules.json (equations + materiality).
 */

import { absGt } from '../utils/decimal.js';
import { getFinancialRules } from './rules_registry.js';
import { MathematicalIntegrityError } from '../errors.js';

/** Account name patterns that indicate a potential 'plug' used to force balance. */
const PLUG_ACCOUNT_PATTERN = /^(Miscellaneous|Suspense|Other)(\s|$|\s*[-–—])/i;

export interface PlugDetectionEntry {
  accountName: string;
  debit: number;
  credit: number;
}

export interface SuspiciousPlugResult {
  isSuspicious: boolean;
  /** Sum of |debit − credit| for entries matching plug account names. */
  plugAmount: number;
  /** Sum of |debit − credit| across all entries (total net activity). */
  totalNetActivity: number;
  /** Share of total net activity in plug accounts (0–1). */
  plugShare: number;
  /** Account names that were classified as plug accounts. */
  plugAccountNames: string[];
  /** Threshold used (e.g. 0.9 = 90%). */
  threshold: number;
}

/**
 * Detect if proposed adjustment uses accounts labeled 'Miscellaneous', 'Suspense', or 'Other'
 * to absorb more than a given share of ledger net activity. Used to prevent the AI from
 * "fudging" the numbers to pass the mathematical balance check.
 *
 * @param entries Trial balance entries (with accountName, debit, credit)
 * @param totalDebits Total debits (can be derived from entries if not provided)
 * @param totalCredits Total credits (can be derived from entries if not provided)
 * @param options.threshold Share of net activity in plug accounts above which to flag (default 0.9)
 * @returns Result with isSuspicious true when plug accounts represent >= threshold of net activity
 */
export function detectSuspiciousPlugs(
  entries: PlugDetectionEntry[],
  totalDebits: number,
  totalCredits: number,
  options?: { threshold?: number }
): SuspiciousPlugResult {
  const threshold = options?.threshold ?? 0.9;
  let totalNetActivity = 0;
  let plugAmount = 0;
  const plugAccountNames: string[] = [];

  for (const e of entries) {
    const net = Math.abs((e.debit ?? 0) - (e.credit ?? 0));
    totalNetActivity += net;
    const name = (e.accountName ?? '').trim();
    if (PLUG_ACCOUNT_PATTERN.test(name)) {
      plugAmount += net;
      if (!plugAccountNames.includes(name)) plugAccountNames.push(name);
    }
  }

  const plugShare = totalNetActivity > 0 ? plugAmount / totalNetActivity : 0;
  const isSuspicious = plugAccountNames.length > 0 && plugShare >= threshold;

  return {
    isSuspicious,
    plugAmount,
    totalNetActivity,
    plugShare,
    plugAccountNames,
    threshold,
  };
}

/** Error returned to the Agent when the gate fails; response must not reach the user. */
export const INTEGRITY_GATE_CRITICAL_MESSAGE =
  'CRITICAL: Your proposed adjustment unbalances the ledger. Re-calculating.';

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
  /** Tolerance for floating-point comparison; when omitted, uses shared/config/financial_rules.json roundingTolerance. */
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
 * Resolve tolerance from financial_rules.json using equations.*.toleranceKey (ASC/IFRS).
 */
function getToleranceForGate(): number {
  const rules = getFinancialRules();
  const equations = rules.equations ?? {};
  const tbEq = equations.debits_equal_credits ?? {};
  const key = (tbEq as { toleranceKey?: string }).toleranceKey ?? 'roundingTolerance';
  if (key === 'roundingTolerance') return rules.roundingTolerance;
  if (key === 'materiality.defaultThreshold') return rules.materiality.defaultThreshold;
  return rules.roundingTolerance;
}

/**
 * Run the Hard Gate using Accounting Laws from shared/config/financial_rules.json.
 * Equations (debits_equal_credits, assets_equal_liabilities_plus_equity) define which checks run.
 */
export function runIntegrityGate(input: IntegrityGateInput): IntegrityGateResult {
  const tolerance = input.tolerance ?? getToleranceForGate();
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

/**
 * Validate trial balance and balance sheet (throw if gate fails). Used by audit_export_service.
 * Throws MathematicalIntegrityError for consistent 422 handling at route layer.
 */
export function validateTrialBalanceAndBalanceSheet(
  trialBalance: IntegrityGateInput['trialBalance'],
  balanceSheet: IntegrityGateInput['balanceSheet'],
  tolerance?: number
): void {
  assertIntegrityGateOrThrow({ trialBalance, balanceSheet, tolerance });
}

/**
 * Run the integrity gate and throw MathematicalIntegrityError if it fails (primary gatekeeper).
 * Use this so any ingestion or adjustment path enforces the same 422 on imbalance.
 */
export function assertIntegrityGateOrThrow(input: IntegrityGateInput): void {
  const result = runIntegrityGate(input);
  if (!result.passed) {
    const tolerance = input.tolerance ?? getToleranceForGate();
    const { totalDebits, totalCredits } = getTrialBalanceTotals(input.trialBalance);
    const { totalAssets, totalLiabilities, totalEquity } = input.balanceSheet;
    if (!result.checks?.trialBalanceBalances) {
      const imbalanceAmount = Math.abs(totalDebits - totalCredits);
      throw new MathematicalIntegrityError('A', imbalanceAmount, { totalDebits, totalCredits });
    }
    if (!result.checks?.balanceSheetBalances) {
      const rhs = totalLiabilities + totalEquity;
      const imbalanceAmount = Math.abs(totalAssets - rhs);
      throw new MathematicalIntegrityError('B', imbalanceAmount, {
        totalAssets,
        totalLiabilities,
        totalEquity,
      });
    }
    throw new MathematicalIntegrityError('A', 0, { totalDebits, totalCredits });
  }
}
