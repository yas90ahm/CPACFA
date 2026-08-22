/**
 * Canonical path for certified statement generation: one function that takes a ledger snapshot
 * payload, produces validated statements, and runs final integrity checks.
 * Use this for certified binder/export so certified outputs are identical regardless of entry point.
 */

import type {
  TrialBalanceEntry,
  TrialBalanceResult,
  FinancialStatementsOutput,
  BalanceSheet,
  ProfitAndLoss,
} from '../types/financial.js';
import type { LedgerSnapshotPayload, LedgerSnapshotEntry } from '../types/ledger_snapshot.js';
import { buildValidatedStatements } from './financialStatements.js';
import { buildCashFlowStatement } from './cashFlow.js';
import { buildEquityChangesStatement } from './equityChanges.js';
import { finalIntegrityCheck } from './integrity_check.js';
import { getRoundingTolerance } from './rules_registry.js';
import { sumRound2, plus, from, absLt } from '../utils/decimal.js';
import {
  applyEntryPresentationReferences,
  applyPresentationReferences,
  normalizeAccountingStandard,
} from '../constants/accounting/presentation_references.js';

/** Thrown when snapshot payload fails final integrity check (Truth Gate). */
export class CertifiedIntegrityError extends Error {
  constructor(
    message: string,
    public readonly code: 'TRIAL_BALANCE_IMBALANCED' | 'BALANCE_SHEET_EQUATION_FAILED' | 'PLUG_ACCOUNTS_DETECTED'
  ) {
    super(message);
    this.name = 'CertifiedIntegrityError';
  }
}

function snapshotEntryToTrialBalanceEntry(e: LedgerSnapshotEntry): TrialBalanceEntry {
  return {
    lineId: e.lineId,
    accountName: e.accountName,
    debit: e.debit ?? 0,
    credit: e.credit ?? 0,
    accountCode: e.accountCode,
    ...(e.accountType != null && { accountType: e.accountType as import('../types/financial.js').AccountType }),
  };
}

/**
 * Convert ledger snapshot payload to TrialBalanceResult (combined TB + optional entries).
 */
export function snapshotPayloadToTrialBalanceResult(payload: LedgerSnapshotPayload): TrialBalanceResult {
  const tbEntries = (payload.trialBalance.entries ?? []).map(snapshotEntryToTrialBalanceEntry);
  const extraEntries = (payload.entries ?? []).map(snapshotEntryToTrialBalanceEntry);
  const entries: TrialBalanceEntry[] = [...tbEntries, ...extraEntries];
  let totalDebits = payload.trialBalance.totalDebits ?? 0;
  let totalCredits = payload.trialBalance.totalCredits ?? 0;
  if (extraEntries.length > 0) {
    totalDebits = plus(totalDebits, sumRound2(extraEntries.map((e) => e.debit ?? 0)));
    totalCredits = plus(totalCredits, sumRound2(extraEntries.map((e) => e.credit ?? 0)));
  }
  const tolerance = getRoundingTolerance();
  const balances = absLt(totalDebits, totalCredits, tolerance);
  return {
    entries,
    totalDebits,
    totalCredits,
    balances,
    errors: [],
  };
}

/**
 * Single canonical function for certified outputs: snapshot payload → validated statements + Truth Gate.
 * Use for certified binder and export. Throws CertifiedIntegrityError if final check fails.
 */
export function buildCertifiedStatementsFromSnapshot(payload: LedgerSnapshotPayload): FinancialStatementsOutput {
  const trialBalanceResult = snapshotPayloadToTrialBalanceResult(payload);
  const rawResult = buildValidatedStatements(trialBalanceResult);
  const standard = payload.accountingContext?.standard
    ? normalizeAccountingStandard(payload.accountingContext.standard)
    : undefined;
  const presented = standard
    ? applyPresentationReferences(standard, rawResult.balanceSheet, rawResult.profitAndLoss)
    : { balanceSheet: rawResult.balanceSheet, profitAndLoss: rawResult.profitAndLoss };
  const result = {
    ...rawResult,
    ...presented,
    classifiedEntries: standard
      ? applyEntryPresentationReferences(standard, rawResult.classifiedEntries)
      : rawResult.classifiedEntries,
  };

  const tolerance = getRoundingTolerance();
  // totalEquity from buildBalanceSheet already includes Net Income (Revenue - Expense)
  const finalCheck = finalIntegrityCheck({
    trialBalance: {
      totalDebits: trialBalanceResult.totalDebits,
      totalCredits: trialBalanceResult.totalCredits,
    },
    balanceSheet: {
      totalAssets: result.balanceSheet.totalAssets,
      totalLiabilities: result.balanceSheet.totalLiabilities,
      totalEquity: result.balanceSheet.totalEquity,
    },
    entriesForPlugDetection: result.classifiedEntries.map((e) => ({
      accountName: e.accountName,
      debit: e.debit ?? 0,
      credit: e.credit ?? 0,
    })),
    tolerance,
  });

  if (!finalCheck.passed) {
    if (finalCheck.plugSuspicious) {
      throw new CertifiedIntegrityError(
        finalCheck.error ?? 'Plug accounts (Suspense/Miscellaneous/Other) exceed threshold.',
        'PLUG_ACCOUNTS_DETECTED'
      );
    }
    if (finalCheck.checks?.trialBalanceBalances === false) {
      throw new CertifiedIntegrityError(
        finalCheck.error ?? 'Trial balance does not balance.',
        'TRIAL_BALANCE_IMBALANCED'
      );
    }
    if (finalCheck.checks?.balanceSheetBalances === false) {
      throw new CertifiedIntegrityError(
        finalCheck.error ?? 'Balance sheet equation does not hold.',
        'BALANCE_SHEET_EQUATION_FAILED'
      );
    }
    throw new CertifiedIntegrityError(finalCheck.error ?? 'Integrity check failed.', 'TRIAL_BALANCE_IMBALANCED');
  }

  // Build comparative roll-forwards only from the entity-scoped certified TB embedded in the snapshot.
  const comparative = payload.comparativeTrialBalance;
  const priorTrialBalance: TrialBalanceResult | undefined = comparative
    ? {
        entries: comparative.entries.map(snapshotEntryToTrialBalanceEntry),
        totalDebits: comparative.totalDebits,
        totalCredits: comparative.totalCredits,
        balances: absLt(comparative.totalDebits, comparative.totalCredits, tolerance),
        errors: [],
      }
    : undefined;
  if (priorTrialBalance && !priorTrialBalance.balances) {
    throw new CertifiedIntegrityError(
      'Comparative certified trial balance does not balance.',
      'TRIAL_BALANCE_IMBALANCED'
    );
  }
  const priorBalanceSheet = priorTrialBalance
    ? buildValidatedStatements(priorTrialBalance).balanceSheet
    : undefined;
  const cashFlow = buildCashFlowStatement(
    trialBalanceResult,
    result.profitAndLoss,
    priorTrialBalance
  );
  const equityChanges = buildEquityChangesStatement(
    result.balanceSheet,
    priorBalanceSheet,
    result.profitAndLoss
  );

  const now = new Date().toISOString();
  return {
    trialBalance: {
      entries: result.classifiedEntries,
      totalDebits: trialBalanceResult.totalDebits,
      totalCredits: trialBalanceResult.totalCredits,
      balances: true,
      errors: [],
    },
    balanceSheet: result.balanceSheet,
    profitAndLoss: result.profitAndLoss,
    cashFlow,
    equityChanges,
    ...(standard && { standard }),
    reasoningChain: {
      plan: 'certified_snapshot',
      executedAt: now,
      verification: { passed: true, checks: ['trial_balance', 'balance_sheet', 'final_integrity'] },
    },
  };
}

/** Convert FinancialStatementsOutput to export payload shape (financial_statements + clean_ledger). */
export function statementsToExportPayload(statements: FinancialStatementsOutput): {
  financial_statements: Record<string, unknown>;
  clean_ledger: Array<{ account_code?: string; account_name: string; debit: number; credit: number; account_type?: string }>;
} {
  const bs = statements.balanceSheet as BalanceSheet;
  const pl = statements.profitAndLoss as ProfitAndLoss;
  const entries = statements.trialBalance?.entries ?? [];
  const financial_statements: Record<string, unknown> = {
    balance_sheet: {
      total_assets: bs.totalAssets,
      total_liabilities: bs.totalLiabilities,
      total_equity: bs.totalEquity,
      assets: bs.assets,
      liabilities: bs.liabilities,
      equity: bs.equity,
    },
    profit_and_loss: {
      total_revenue: pl.totalRevenue,
      total_expenses: pl.totalExpenses,
      net_income: pl.netIncome,
      revenue: pl.revenue,
      expenses: pl.expenses,
    },
  };
  const clean_ledger = entries.map((e) => ({
    account_code: e.accountCode ?? '',
    account_name: e.accountName ?? '',
    debit: e.debit ?? 0,
    credit: e.credit ?? 0,
    account_type: (e as TrialBalanceEntry & { accountType?: string }).accountType ?? '',
  }));
  return { financial_statements, clean_ledger };
}
