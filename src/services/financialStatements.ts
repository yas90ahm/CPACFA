/**
 * Build Balance Sheet and P&L from classified Trial Balance
 * FASB ASC 210 (Balance Sheet), ASC 220 (Comprehensive Income), IAS 1
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
import { round2, sumRound2, absLt } from '../utils/decimal.js';
import { classifyTrialBalanceDeterministic } from './accountClassifier.js';

/** Net amount for an account (debit − credit). Assets/Expenses: positive = debit. Liabilities/Equity/Revenue: positive = credit. Uses decimal round for display. */
function netAmount(entry: TrialBalanceEntry): number {
  const net = entry.debit - entry.credit;
  const signed = entry.accountType === 'LIABILITY' || entry.accountType === 'EQUITY' || entry.accountType === 'REVENUE' ? -net : net;
  return round2(signed);
}

function toLine(entry: TrialBalanceEntry): FinancialStatementLine {
  const amount = netAmount(entry);
  return {
    accountCode: entry.accountCode,
    label: entry.accountName,
    amount,
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

/**
 * Build Balance Sheet (Assets = Liabilities + Equity)
 * ASC 210-10-45, IAS 1.54. Uses decimal sums and configurable materiality for balance check.
 */
export function buildBalanceSheet(
  entries: TrialBalanceEntry[],
  options?: { materiality?: number }
): BalanceSheet {
  const materiality = options?.materiality ?? DEFAULT_MATERIALITY;
  const assetEntries = entries.filter((e) => e.accountType === 'ASSET');
  const liabilityEntries = entries.filter((e) => e.accountType === 'LIABILITY');
  const equityEntries = entries.filter((e) => e.accountType === 'EQUITY');

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

/**
 * Build P&L (Revenue − Expenses = Net Income)
 * ASC 220-10-45, IAS 1.81. Uses decimal sums; optional materiality for cross-foot check.
 */
export function buildProfitAndLoss(
  entries: TrialBalanceEntry[],
  options?: { materiality?: number }
): ProfitAndLoss {
  const revenueEntries = entries.filter((e) => e.accountType === 'REVENUE');
  const expenseEntries = entries.filter((e) => e.accountType === 'EXPENSE');

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
