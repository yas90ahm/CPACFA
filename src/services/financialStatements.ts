/**
 * Build Balance Sheet and P&L from classified Trial Balance
 * FASB ASC 210 (Balance Sheet), ASC 220 (Comprehensive Income), IAS 1
 *
 * Accounting Kill Switch: buildValidatedStatements() enforces (A) Sum(Debits)==Sum(Credits)
 * and (B) Total Assets==Total Liabilities+Total Equity. If either fails, throws MathematicalIntegrityError.
 * MathematicalIntegrityError is the primary gatekeeper: if totalDebits !== totalCredits, the system MUST throw (422).
 *
 * OWNERSHIP: This file is the CANONICAL engine for reporting and statement assembly (TypeScript-only).
 * Uses shared config (shared/config/financial_rules.json) for rounding tolerance.
 */

import type {
  TrialBalanceEntry,
  TrialBalanceResult,
  BalanceSheet,
  ProfitAndLoss,
  FinancialStatementLine,
  AccountType,
} from '../types/financial.js';
import { BALANCE_SHEET, COMPREHENSIVE_INCOME } from '../constants/codification.js';
import { round2, sumRound2, absLt, absGt } from '../utils/decimal.js';
import { classifyTrialBalanceDeterministic } from './accountClassifier.js';
import { getRoundingTolerance } from './rules_registry.js';
import { MathematicalIntegrityError } from '../errors.js';
import { detectSuspiciousPlugs, type SuspiciousPlugResult } from './integrity_gate_service.js';

/** Re-export for backward compatibility. Primary gatekeeper: totalDebits !== totalCredits → MUST throw this (422). */
export { MathematicalIntegrityError };

/** Credit-positive fs line ids (positive = credit); others are debit-positive. */
const CREDIT_POSITIVE_FS_LINES = new Set(['fs_liability', 'fs_equity', 'fs_revenue']);

/** Net amount for an account (debit − credit). Assets/Expenses: positive = debit. Liabilities/Equity/Revenue: positive = credit. Uses decimal round for display. */
function netAmount(entry: TrialBalanceEntry): number {
  const net = entry.debit - entry.credit;
  const creditPositive =
    entry.fsLineId != null
      ? CREDIT_POSITIVE_FS_LINES.has(entry.fsLineId)
      : entry.accountType === 'LIABILITY' || entry.accountType === 'EQUITY' || entry.accountType === 'REVENUE';
  const signed = creditPositive ? -net : net;
  return round2(signed);
}

function toLine(entry: TrialBalanceEntry): FinancialStatementLine {
  const amount = netAmount(entry);
  return {
    accountCode: entry.accountCode,
    label: entry.accountName,
    amount,
    fsLineId: entry.fsLineId,
    fsLineCode: entry.fsLineCode,
    codificationRef: entry.codificationRef,
    classificationSource: entry.classificationSource,
    classificationRationale: entry.classificationRationale,
    sourceDocumentId: entry.sourceDocumentId,
    sourceSheet: entry.sourceSheet,
    sourceRowIndex: entry.sourceRowIndex,
    sourceChunkId: entry.sourceChunkId,
  };
}

/** Sum line amounts using decimal arithmetic (salami-slicing defense). */
function sumLines(lines: FinancialStatementLine[]): number {
  return sumRound2(lines.map((l) => l.amount));
}

const DEFAULT_MATERIALITY = 0.01;

/** When fsLineId is set, bucket by taxonomy line id (BS defaults: fs_asset, fs_liability, fs_equity). */
function bucketBsByFsLine(entries: TrialBalanceEntry[]): { assets: TrialBalanceEntry[]; liabilities: TrialBalanceEntry[]; equity: TrialBalanceEntry[] } {
  const assets: TrialBalanceEntry[] = [];
  const liabilities: TrialBalanceEntry[] = [];
  const equity: TrialBalanceEntry[] = [];
  for (const e of entries) {
    if (e.fsLineId === 'fs_asset') assets.push(e);
    else if (e.fsLineId === 'fs_liability') liabilities.push(e);
    else if (e.fsLineId === 'fs_equity') equity.push(e);
    else if (e.accountType === 'ASSET') assets.push(e);
    else if (e.accountType === 'LIABILITY') liabilities.push(e);
    else if (e.accountType === 'EQUITY') equity.push(e);
  }
  return { assets, liabilities, equity };
}

/**
 * Build Balance Sheet (Assets = Liabilities + Equity)
 * ASC 210-10-45, IAS 1.54. Uses decimal sums and configurable materiality for balance check.
 * When entries have fsLineId, groups by taxonomy line (fs_asset/fs_liability/fs_equity); otherwise by accountType.
 */
export function buildBalanceSheet(
  entries: TrialBalanceEntry[],
  options?: { materiality?: number }
): BalanceSheet {
  const materiality = options?.materiality ?? DEFAULT_MATERIALITY;
  const { assets: assetEntries, liabilities: liabilityEntries, equity: equityEntries } = bucketBsByFsLine(entries);

  const assets = assetEntries.map(toLine);
  const liabilities = liabilityEntries.map(toLine);
  const equity = equityEntries.map(toLine);

  const totalAssets = sumLines(assets);
  const totalLiabilities = sumLines(liabilities);
  const totalEquity = sumLines(equity);
  const liabilitiesPlusEquity = sumRound2([totalLiabilities, totalEquity]);
  const balances = absLt(totalAssets, liabilitiesPlusEquity, materiality);
  /* decimal sums already applied via sumLines (sumRound2) */

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balances,
    codificationRef: BALANCE_SHEET,
  };
}

/** When fsLineId is set, bucket PL by taxonomy (fs_revenue, fs_expense); otherwise by accountType. */
function bucketPlByFsLine(entries: TrialBalanceEntry[]): { revenue: TrialBalanceEntry[]; expenses: TrialBalanceEntry[] } {
  const revenue: TrialBalanceEntry[] = [];
  const expenses: TrialBalanceEntry[] = [];
  for (const e of entries) {
    if (e.fsLineId === 'fs_revenue') revenue.push(e);
    else if (e.fsLineId === 'fs_expense') expenses.push(e);
    else if (e.accountType === 'REVENUE') revenue.push(e);
    else if (e.accountType === 'EXPENSE') expenses.push(e);
  }
  return { revenue: revenue, expenses: expenses };
}

/**
 * Build P&L (Revenue − Expenses = Net Income)
 * ASC 220-10-45, IAS 1.81. Uses decimal sums; optional materiality for cross-foot check.
 * When entries have fsLineId, groups by taxonomy (fs_revenue/fs_expense); otherwise by accountType.
 */
export function buildProfitAndLoss(
  entries: TrialBalanceEntry[],
  options?: { materiality?: number }
): ProfitAndLoss {
  const { revenue: revenueEntries, expenses: expenseEntries } = bucketPlByFsLine(entries);

  const revenue = revenueEntries.map(toLine);
  const expenses = expenseEntries.map(toLine);

  const totalRevenue = sumLines(revenue);
  const totalExpenses = sumLines(expenses);
  const netIncome = round2(totalRevenue - totalExpenses);

  return {
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netIncome,
    codificationRef: COMPREHENSIVE_INCOME,
  };
}

/**
 * Full pipeline: validate TB → classify (deterministic or pre-classified) → build BS + P&L.
 * Statement totals are always derived from deterministic rules and/or user-confirmed overrides.
 */
export function buildFinancialStatements(
  trialBalanceResult: TrialBalanceResult,
  options?: { preClassifiedEntries?: TrialBalanceEntry[]; materiality?: number }
): { balanceSheet: BalanceSheet; profitAndLoss: ProfitAndLoss; classifiedEntries: TrialBalanceEntry[] } {
  const classified = options?.preClassifiedEntries?.length === trialBalanceResult.entries.length
    ? options.preClassifiedEntries
    : classifyTrialBalanceDeterministic(trialBalanceResult.entries);
  const buildOpts = options?.materiality != null ? { materiality: options.materiality } : undefined;
  const balanceSheet = buildBalanceSheet(classified, buildOpts);
  const profitAndLoss = buildProfitAndLoss(classified, buildOpts);
  return { balanceSheet, profitAndLoss, classifiedEntries: classified };
}

/** Sum debits and credits from entries (for Kill Switch check A). */
function getTrialBalanceTotals(entries: TrialBalanceEntry[]): { totalDebits: number; totalCredits: number } {
  let totalDebits = 0;
  let totalCredits = 0;
  for (const e of entries) {
    totalDebits += e.debit ?? 0;
    totalCredits += e.credit ?? 0;
  }
  return { totalDebits, totalCredits };
}

/**
 * Validate already-built trial balance and balance sheet (Kill Switch).
 * Throws MathematicalIntegrityError if (A) Sum(Debits) != Sum(Credits) or (B) Assets != L+E.
 * Use when returning stored statements (e.g. audit binder) to ensure we never serve illegal data.
 */
export function validateTrialBalanceAndBalanceSheet(
  trialBalance: TrialBalanceResult | { entries: TrialBalanceEntry[]; totalDebits?: number; totalCredits?: number },
  balanceSheet: BalanceSheet,
  tolerance?: number
): void {
  const tol = tolerance ?? getRoundingTolerance();
  const entries = trialBalance.entries ?? [];
  const totalDebits =
    'totalDebits' in trialBalance && typeof trialBalance.totalDebits === 'number'
      ? trialBalance.totalDebits
      : entries.reduce((s, e) => s + (e.debit ?? 0), 0);
  const totalCredits =
    'totalCredits' in trialBalance && typeof trialBalance.totalCredits === 'number'
      ? trialBalance.totalCredits
      : entries.reduce((s, e) => s + (e.credit ?? 0), 0);

  if (absGt(totalDebits, totalCredits, tol)) {
    const imbalanceAmount = round2(Math.abs(totalDebits - totalCredits));
    throw new MathematicalIntegrityError('A', imbalanceAmount, { totalDebits, totalCredits });
  }

  const rhs = sumRound2([balanceSheet.totalLiabilities, balanceSheet.totalEquity]);
  if (absGt(balanceSheet.totalAssets, rhs, tol)) {
    const imbalanceAmount = round2(Math.abs(balanceSheet.totalAssets - rhs));
    throw new MathematicalIntegrityError('B', imbalanceAmount, {
      totalAssets: balanceSheet.totalAssets,
      totalLiabilities: balanceSheet.totalLiabilities,
      totalEquity: balanceSheet.totalEquity,
    });
  }
}

/** Risk level for validated statements; 'balanced_but_high_risk' when suspicious plug accounts detected. */
export type ValidatedStatementsRiskLevel = 'normal' | 'balanced_but_high_risk';

export interface BuildValidatedStatementsResult {
  balanceSheet: BalanceSheet;
  profitAndLoss: ProfitAndLoss;
  classifiedEntries: TrialBalanceEntry[];
  /** Set when plug accounts (Miscellaneous, Suspense, Other) absorb >= 90% of net activity. */
  riskLevel?: ValidatedStatementsRiskLevel;
  /** Present when riskLevel is 'balanced_but_high_risk'; use to create mandatory audit alert in tenant_hitl_staging. */
  plugAlert?: SuspiciousPlugResult;
}

/**
 * Unified validated builder: (A) Sum(Debits)==Sum(Credits), (B) Total Assets==Total Liabilities+Total Equity.
 * If either check fails, throws MathematicalIntegrityError and returns no data. Use for all API paths that return financials.
 * When plug accounts (Miscellaneous, Suspense, Other) absorb >= 90% of net activity, flags report as 'Balanced but High Risk'
 * and returns plugAlert for mandatory audit alert in tenant_hitl_staging.
 */
export function buildValidatedStatements(
  trialBalanceResult: TrialBalanceResult,
  options?: { preClassifiedEntries?: TrialBalanceEntry[]; materiality?: number; tolerance?: number }
): BuildValidatedStatementsResult {
  const tol = options?.tolerance ?? getRoundingTolerance();
  const entries = trialBalanceResult.entries ?? [];
  const totalDebits =
    trialBalanceResult.totalDebits != null
      ? trialBalanceResult.totalDebits
      : entries.reduce((s, e) => s + (e.debit ?? 0), 0);
  const totalCredits =
    trialBalanceResult.totalCredits != null
      ? trialBalanceResult.totalCredits
      : entries.reduce((s, e) => s + (e.credit ?? 0), 0);

  if (absGt(totalDebits, totalCredits, tol)) {
    const imbalanceAmount = round2(Math.abs(totalDebits - totalCredits));
    throw new MathematicalIntegrityError('A', imbalanceAmount, { totalDebits, totalCredits });
  }

  const result = buildFinancialStatements(trialBalanceResult, options);
  const rhs = sumRound2([result.balanceSheet.totalLiabilities, result.balanceSheet.totalEquity]);
  if (absGt(result.balanceSheet.totalAssets, rhs, tol)) {
    const imbalanceAmount = round2(Math.abs(result.balanceSheet.totalAssets - rhs));
    throw new MathematicalIntegrityError('B', imbalanceAmount, {
      totalAssets: result.balanceSheet.totalAssets,
      totalLiabilities: result.balanceSheet.totalLiabilities,
      totalEquity: result.balanceSheet.totalEquity,
    });
  }

  const classifiedEntries = result.classifiedEntries ?? entries;
  const plugResult = detectSuspiciousPlugs(
    classifiedEntries.map((e) => ({ accountName: e.accountName, debit: e.debit, credit: e.credit })),
    totalDebits,
    totalCredits,
    { threshold: 0.9 }
  );

  const out: BuildValidatedStatementsResult = {
    ...result,
    riskLevel: plugResult.isSuspicious ? 'balanced_but_high_risk' : 'normal',
    ...(plugResult.isSuspicious ? { plugAlert: plugResult } : {}),
  };
  return out;
}
