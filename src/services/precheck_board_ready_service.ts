/**
 * Pre-certification structural check (board-ready).
 * Stateless: no DB, no staging, no close session, no AI.
 * Reuses integrity_gate_service.runIntegrityGate and integrity_check.finalIntegrityCheck + plug detection.
 */

import type { TrialBalanceEntry } from '../types/financial.js';
import type { TrialBalanceResult } from '../types/financial.js';
import { parseTrialBalance } from './trialBalanceParser.js';
import type { RawTrialBalanceRow } from './trialBalanceParser.js';
import { buildFinancialStatements } from './financialStatements.js';
import { finalIntegrityCheck } from './integrity_check.js';
import { getRoundingTolerance } from './rules_registry.js';

/** Same shape as TB ingest/parser input (JSON payload). */
export interface PrecheckTrialBalanceRow {
  accountName: string;
  accountCode?: string;
  debit?: number;
  credit?: number;
}

/** Same shape as journal_entry line (hypothetical; not posted). */
export interface PrecheckJournalEntryLine {
  accountRef: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export interface PrecheckBoardReadyInput {
  periodLabel: string;
  trialBalance: PrecheckTrialBalanceRow[];
  journalEntries?: PrecheckJournalEntryLine[];
}

export interface PrecheckBlockerOrWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PrecheckProofSummary {
  trialBalanceBalanced: boolean;
  balanceSheetEquationBalanced: boolean;
  plugDetected: boolean;
  roundingToleranceUsed: number;
  computedTotalsSummary: {
    totalDebits: number;
    totalCredits: number;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
  };
}

export interface PrecheckBoardReadyVerdict {
  status: 'ready' | 'not_ready';
  blockers: PrecheckBlockerOrWarning[];
  warnings: PrecheckBlockerOrWarning[];
  proofSummary: PrecheckProofSummary;
}

function toRawRow(r: PrecheckTrialBalanceRow): RawTrialBalanceRow {
  return {
    accountName: String(r?.accountName ?? '').trim(),
    accountCode: r?.accountCode,
    debit: typeof r?.debit === 'number' ? r.debit : Number(r?.debit) || 0,
    credit: typeof r?.credit === 'number' ? r.credit : Number(r?.credit) || 0,
  };
}

function toTrialBalanceEntry(r: PrecheckJournalEntryLine): TrialBalanceEntry {
  const debit = typeof r?.debit === 'number' ? r.debit : Number(r?.debit) || 0;
  const credit = typeof r?.credit === 'number' ? r.credit : Number(r?.credit) || 0;
  return {
    accountName: String(r?.accountRef ?? '').trim(),
    debit,
    credit,
  };
}

/**
 * Run pre-certification structural check. Deterministic only; no DB, no AI.
 */
export function runPrecheckBoardReady(input: PrecheckBoardReadyInput): PrecheckBoardReadyVerdict {
  const blockers: PrecheckBlockerOrWarning[] = [];
  const warnings: PrecheckBlockerOrWarning[] = [];
  const tolerance = getRoundingTolerance();

  if (!input.trialBalance?.length) {
    return {
      status: 'not_ready',
      blockers: [{ code: 'MISSING_TRIAL_BALANCE', message: 'Provide a non-empty trial balance array to run the check.' }],
      warnings: [],
      proofSummary: {
        trialBalanceBalanced: false,
        balanceSheetEquationBalanced: false,
        plugDetected: false,
        roundingToleranceUsed: tolerance,
        computedTotalsSummary: { totalDebits: 0, totalCredits: 0, totalAssets: 0, totalLiabilities: 0, totalEquity: 0 },
      },
    };
  }

  const rawRows = input.trialBalance.map(toRawRow).filter((r) => r.accountName);
  if (rawRows.length === 0) {
    return {
      status: 'not_ready',
      blockers: [{ code: 'EMPTY_TRIAL_BALANCE', message: 'Add at least one row with an account name to run the check.' }],
      warnings: [],
      proofSummary: {
        trialBalanceBalanced: false,
        balanceSheetEquationBalanced: false,
        plugDetected: false,
        roundingToleranceUsed: tolerance,
        computedTotalsSummary: { totalDebits: 0, totalCredits: 0, totalAssets: 0, totalLiabilities: 0, totalEquity: 0 },
      },
    };
  }

  const parsed = parseTrialBalance(rawRows);
  let entries: TrialBalanceEntry[] = [...parsed.entries];
  let totalDebits = parsed.totalDebits;
  let totalCredits = parsed.totalCredits;

  if (input.journalEntries?.length) {
    for (const line of input.journalEntries) {
      const e = toTrialBalanceEntry(line);
      if (!e.accountName) continue;
      entries.push(e);
      totalDebits += e.debit ?? 0;
      totalCredits += e.credit ?? 0;
    }
  }

  const trialBalanceResult: TrialBalanceResult = {
    entries,
    totalDebits,
    totalCredits,
    balances: false,
    errors: [],
  };

  let balanceSheet = { totalAssets: 0, totalLiabilities: 0, totalEquity: 0 };
  try {
    const built = buildFinancialStatements(trialBalanceResult);
    balanceSheet = {
      totalAssets: built.balanceSheet.totalAssets,
      totalLiabilities: built.balanceSheet.totalLiabilities,
      totalEquity: built.balanceSheet.totalEquity,
    };
  } catch {
    balanceSheet = { totalAssets: 0, totalLiabilities: 0, totalEquity: 0 };
  }

  const finalCheck = finalIntegrityCheck({
    trialBalance: { totalDebits, totalCredits },
    balanceSheet,
    entriesForPlugDetection: entries.map((e) => ({ accountName: e.accountName, debit: e.debit ?? 0, credit: e.credit ?? 0 })),
    tolerance,
  });

  const trialBalanceBalanced = finalCheck.checks?.trialBalanceBalances ?? false;
  const balanceSheetEquationBalanced = finalCheck.checks?.balanceSheetBalances ?? false;
  const plugDetected = finalCheck.plugSuspicious === true;

  if (!trialBalanceBalanced) {
    blockers.push({
      code: 'TRIAL_BALANCE_IMBALANCED',
      message: 'Blocked until resolved: debits and credits do not match within tolerance.',
      details: { totalDebits, totalCredits, tolerance },
    });
  }
  if (!balanceSheetEquationBalanced) {
    blockers.push({
      code: 'BALANCE_SHEET_EQUATION_FAILED',
      message: 'Blocked until resolved: Assets do not equal Liabilities + Equity within tolerance.',
      details: { ...balanceSheet, tolerance },
    });
  }
  if (plugDetected) {
    blockers.push({
      code: 'PLUG_ACCOUNTS_DETECTED',
      message:
        'Blocked until resolved: reclassify or reduce Suspense/Miscellaneous/Other accounts (≥90% of activity).',
      details: { suspenseAccounts: finalCheck.suspenseAccounts ?? [] },
    });
  }

  const status = blockers.length === 0 ? 'ready' : 'not_ready';

  return {
    status,
    blockers,
    warnings,
    proofSummary: {
      trialBalanceBalanced,
      balanceSheetEquationBalanced,
      plugDetected,
      roundingToleranceUsed: tolerance,
      computedTotalsSummary: {
        totalDebits,
        totalCredits,
        totalAssets: balanceSheet.totalAssets,
        totalLiabilities: balanceSheet.totalLiabilities,
        totalEquity: balanceSheet.totalEquity,
      },
    },
  };
}
