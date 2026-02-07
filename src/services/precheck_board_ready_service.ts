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
import {
  PrecheckCode,
  PrecheckMessage,
  PrecheckRemediation,
  PRECHECK_CONTRACT_VERSION,
} from '../constants/precheck_codes.js';

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

/** Contract: code (stable), message (protective), details (always object), remediation (optional). */
export interface PrecheckBlockerOrWarning {
  code: string;
  message: string;
  details: Record<string, unknown>;
  remediation?: string;
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

const EMPTY_COMPUTED_TOTALS = {
  totalDebits: 0,
  totalCredits: 0,
  totalAssets: 0,
  totalLiabilities: 0,
  totalEquity: 0,
};

function defaultProofSummary(tolerance: number): PrecheckProofSummary {
  return {
    trialBalanceBalanced: false,
    balanceSheetEquationBalanced: false,
    plugDetected: false,
    roundingToleranceUsed: tolerance,
    computedTotalsSummary: { ...EMPTY_COMPUTED_TOTALS },
  };
}

function blocker(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  remediation?: string
): PrecheckBlockerOrWarning {
  return { code, message, details: details ?? {}, remediation };
}

export interface PrecheckBoardReadyVerdict {
  contractVersion: string;
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
    const proof = defaultProofSummary(tolerance);
    return {
      contractVersion: PRECHECK_CONTRACT_VERSION,
      status: 'not_ready',
      blockers: [
        blocker(
          PrecheckCode.MISSING_TRIAL_BALANCE,
          PrecheckMessage[PrecheckCode.MISSING_TRIAL_BALANCE],
          {},
          PrecheckRemediation[PrecheckCode.MISSING_TRIAL_BALANCE]
        ),
      ],
      warnings: [],
      proofSummary: proof,
    };
  }

  const rawRows = input.trialBalance.map(toRawRow).filter((r) => r.accountName);
  if (rawRows.length === 0) {
    const proof = defaultProofSummary(tolerance);
    return {
      contractVersion: PRECHECK_CONTRACT_VERSION,
      status: 'not_ready',
      blockers: [
        blocker(
          PrecheckCode.EMPTY_TRIAL_BALANCE,
          PrecheckMessage[PrecheckCode.EMPTY_TRIAL_BALANCE],
          {},
          PrecheckRemediation[PrecheckCode.EMPTY_TRIAL_BALANCE]
        ),
      ],
      warnings: [],
      proofSummary: proof,
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
    blockers.push(
      blocker(
        PrecheckCode.TRIAL_BALANCE_IMBALANCED,
        PrecheckMessage[PrecheckCode.TRIAL_BALANCE_IMBALANCED],
        { totalDebits, totalCredits, tolerance },
        PrecheckRemediation[PrecheckCode.TRIAL_BALANCE_IMBALANCED]
      )
    );
  }
  if (!balanceSheetEquationBalanced) {
    blockers.push(
      blocker(
        PrecheckCode.BALANCE_SHEET_EQUATION_FAILED,
        PrecheckMessage[PrecheckCode.BALANCE_SHEET_EQUATION_FAILED],
        { ...balanceSheet, tolerance },
        PrecheckRemediation[PrecheckCode.BALANCE_SHEET_EQUATION_FAILED]
      )
    );
  }
  if (plugDetected) {
    blockers.push(
      blocker(
        PrecheckCode.PLUG_ACCOUNTS_DETECTED,
        PrecheckMessage[PrecheckCode.PLUG_ACCOUNTS_DETECTED],
        { suspenseAccounts: finalCheck.suspenseAccounts ?? [] },
        PrecheckRemediation[PrecheckCode.PLUG_ACCOUNTS_DETECTED]
      )
    );
  }

  const status = blockers.length === 0 ? 'ready' : 'not_ready';
  const proofSummary: PrecheckProofSummary = {
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
  };

  return {
    contractVersion: PRECHECK_CONTRACT_VERSION,
    status,
    blockers,
    warnings,
    proofSummary,
  };
}
