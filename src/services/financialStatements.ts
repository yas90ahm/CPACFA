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
import { from, round2, minus, plus, sumRound2 } from '../utils/decimal.js';
import { classifyTrialBalanceDeterministic } from './accountClassifier.js';
import { MathematicalIntegrityError } from '../errors.js';
import {
  assertIntegrityGateOrThrow,
  detectSuspiciousPlugs,
  runIntegrityGate,
  type SuspiciousPlugResult,
} from './integrity_gate_service.js';

/** Re-export for backward compatibility. Primary gatekeeper: totalDebits !== totalCredits → MUST throw this (422). */
export { MathematicalIntegrityError };

/** Credit-positive fs line ids (positive = credit); others are debit-positive.
 *
 * SIGN CONVENTION:
 * - Debit-normal accounts (assets, expenses): net = debit - credit → positive when debit > credit
 * - Credit-normal accounts (liabilities, equity, revenue): net = debit - credit → negative when credit > debit
 *   → We negate (multiply by -1) so they display as POSITIVE on statements
 *
 * CONTRA ACCOUNTS:
 * - Contra-assets (allowance, accum dep, amort): credit-normal but display on the ASSET section.
 *   They are NOT in this set, so their net stays negative, correctly REDUCING total assets.
 * - Contra-equity (treasury stock, dividends): debit-normal but display in EQUITY section.
 *   They ARE in this set, so their positive net gets negated to negative, correctly REDUCING equity.
 * - Contra-revenue (sales returns): debit-normal but display in REVENUE section.
 *   They ARE in this set, so their positive net gets negated to negative, correctly REDUCING revenue.
 */
const CREDIT_POSITIVE_FS_LINES = new Set([
  // --- Liabilities (credit-normal → display positive) ---
  'fs_liability', 'fs_liability_current', 'fs_liability_ap', 'fs_liability_accrued',
  'fs_liability_current_debt', 'fs_liability_other_current',
  'fs_liability_noncurrent', 'fs_liability_lt_debt', 'fs_liability_deferred_tax',
  'fs_liability_other_noncurrent',
  'fs_liability_deferred_rev_current', 'fs_liability_deferred_rev_noncurrent',
  // --- Equity (credit-normal → display positive) ---
  'fs_equity', 'fs_equity_common', 'fs_equity_retained', 'fs_equity_other', 'fs_equity_apic',
  'fs_equity_aoci',
  // --- Contra-equity (debit-normal → negate to display negative, reducing equity) ---
  'fs_equity_treasury', 'fs_equity_dividends',
  // --- Revenue (credit-normal → display positive) ---
  'fs_revenue', 'fs_revenue_product', 'fs_revenue_service', 'fs_revenue_other',
  // --- Contra-revenue (debit-normal → negate to display negative, reducing revenue) ---
  'fs_revenue_contra',
  // --- Other income (credit-normal → display positive) ---
  'fs_other_income', 'fs_interest_income', 'fs_other_other', 'fs_other_gain_loss',
  // --- OCI (credit-normal → display positive) ---
  'fs_oci', 'fs_oci_unrealized_gains', 'fs_oci_fx_translation', 'fs_oci_hedge',
  // --- Discontinued operations (credit-normal → display positive) ---
  'fs_discontinued_ops', 'fs_discontinued_disposal',
]);

/** FS line IDs that route to OCI (Accumulated Other Comprehensive Income). */
const OCI_FS_LINES = new Set([
  'fs_oci', 'fs_oci_unrealized_gains', 'fs_oci_fx_translation', 'fs_oci_pension', 'fs_oci_hedge',
]);

/** FS line IDs that route to Discontinued Operations on the P&L. */
const DISCONTINUED_FS_LINES = new Set(['fs_discontinued_ops', 'fs_discontinued_disposal']);

/** Net amount for an account (debit − credit). Assets/Expenses: positive = debit. Liabilities/Equity/Revenue: positive = credit. Uses decimal round for display. */
function netAmount(entry: TrialBalanceEntry): number {
  const net = minus(entry.debit, entry.credit);
  const u = entry.accountType != null ? String(entry.accountType).toUpperCase() : '';
  const creditPositive =
    entry.fsLineId != null
      ? CREDIT_POSITIVE_FS_LINES.has(entry.fsLineId)
      : u === 'LIABILITY' || u === 'EQUITY' || u === 'REVENUE';
  const signed = creditPositive ? -net : net;
  return round2(signed);
}

function toLine(entry: TrialBalanceEntry): FinancialStatementLine {
  const amount = netAmount(entry);
  return {
    accountCode: entry.accountCode,
    label: entry.accountName,
    amount,
    lineId: entry.lineId,
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

/** FS line IDs that route to BS current assets. */
const BS_CURRENT_ASSET_FS_LINES = new Set([
  'fs_asset_current', 'fs_asset_cash', 'fs_asset_ar', 'fs_asset_ar_allowance',
  'fs_asset_inventory', 'fs_asset_prepaid', 'fs_asset_other_current',
]);
/** FS line IDs that route to BS non-current assets. */
const BS_NONCURRENT_ASSET_FS_LINES = new Set([
  'fs_asset_noncurrent', 'fs_asset_ppe', 'fs_asset_ppe_accum_dep',
  'fs_asset_intangible', 'fs_asset_intangible_amort', 'fs_asset_goodwill', 'fs_asset_other_noncurrent',
  'fs_asset_dta',
]);
/** FS line IDs that route to BS current liabilities. */
const BS_CURRENT_LIAB_FS_LINES = new Set([
  'fs_liability_current', 'fs_liability_ap', 'fs_liability_accrued', 'fs_liability_current_debt', 'fs_liability_other_current',
  'fs_liability_deferred_rev_current',
]);
/** FS line IDs that route to BS non-current liabilities. */
const BS_NONCURRENT_LIAB_FS_LINES = new Set([
  'fs_liability_noncurrent', 'fs_liability_lt_debt', 'fs_liability_deferred_tax', 'fs_liability_other_noncurrent',
  'fs_liability_deferred_rev_noncurrent',
]);
/** FS line IDs for equity sub-lines */
const BS_EQUITY_FS_LINES = new Set([
  'fs_equity', 'fs_equity_common', 'fs_equity_retained', 'fs_equity_treasury', 'fs_equity_other',
  'fs_equity_apic', 'fs_equity_dividends', 'fs_equity_aoci',
]);

/** Bucket entries by fsLineId (data-driven) with accountType fallback. Supports OCI and Discontinued Ops. */
function bucketBsByFsLine(entries: TrialBalanceEntry[]): {
  currentAssets: TrialBalanceEntry[];
  noncurrentAssets: TrialBalanceEntry[];
  assets: TrialBalanceEntry[];
  currentLiabilities: TrialBalanceEntry[];
  noncurrentLiabilities: TrialBalanceEntry[];
  liabilities: TrialBalanceEntry[];
  equity: TrialBalanceEntry[];
  revenue: TrialBalanceEntry[];
  expenses: TrialBalanceEntry[];
  oci: TrialBalanceEntry[];
  discontinued: TrialBalanceEntry[];
} {
  const currentAssets: TrialBalanceEntry[] = [];
  const noncurrentAssets: TrialBalanceEntry[] = [];
  const assets: TrialBalanceEntry[] = [];
  const currentLiabilities: TrialBalanceEntry[] = [];
  const noncurrentLiabilities: TrialBalanceEntry[] = [];
  const liabilities: TrialBalanceEntry[] = [];
  const equity: TrialBalanceEntry[] = [];
  const revenue: TrialBalanceEntry[] = [];
  const expenses: TrialBalanceEntry[] = [];
  const oci: TrialBalanceEntry[] = [];
  const discontinued: TrialBalanceEntry[] = [];
  const isType = (t?: string, expected?: string) => t != null && expected != null && String(t).toUpperCase() === expected;
  for (const e of entries) {
    // Data-driven routing by fsLineId
    if (e.fsLineId && OCI_FS_LINES.has(e.fsLineId)) oci.push(e);
    else if (e.fsLineId && DISCONTINUED_FS_LINES.has(e.fsLineId)) discontinued.push(e);
    else if (e.fsLineId && BS_CURRENT_ASSET_FS_LINES.has(e.fsLineId)) currentAssets.push(e);
    else if (e.fsLineId && BS_NONCURRENT_ASSET_FS_LINES.has(e.fsLineId)) noncurrentAssets.push(e);
    else if (e.fsLineId === 'fs_asset') assets.push(e);
    else if (e.fsLineId && BS_CURRENT_LIAB_FS_LINES.has(e.fsLineId)) currentLiabilities.push(e);
    else if (e.fsLineId && BS_NONCURRENT_LIAB_FS_LINES.has(e.fsLineId)) noncurrentLiabilities.push(e);
    else if (e.fsLineId === 'fs_liability') liabilities.push(e);
    else if (e.fsLineId && BS_EQUITY_FS_LINES.has(e.fsLineId)) equity.push(e);
    else if (e.fsLineId === 'fs_revenue') revenue.push(e);
    else if (e.fsLineId === 'fs_expense') expenses.push(e);
    // Fallback by accountType
    else if (isType(e.accountType, 'ASSET')) assets.push(e);
    else if (isType(e.accountType, 'LIABILITY')) liabilities.push(e);
    else if (isType(e.accountType, 'EQUITY')) equity.push(e);
    else if (isType(e.accountType, 'REVENUE')) revenue.push(e);
    else if (isType(e.accountType, 'EXPENSE')) expenses.push(e);
  }
  return { currentAssets, noncurrentAssets, assets, currentLiabilities, noncurrentLiabilities, liabilities, equity, revenue, expenses, oci, discontinued };
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
  const {
    currentAssets: currentAssetEntries, noncurrentAssets: noncurrentAssetEntries, assets: assetEntries,
    currentLiabilities: currentLiabEntries, noncurrentLiabilities: noncurrentLiabEntries, liabilities: liabilityEntries,
    equity: equityEntries, revenue: revenueEntries, expenses: expenseEntries, oci: ociEntries,
  } = bucketBsByFsLine(entries);

  // Combine classified + unclassified assets/liabilities into the main arrays
  const currentAssetLines = currentAssetEntries.map(toLine);
  const noncurrentAssetLines = noncurrentAssetEntries.map(toLine);
  const unclassifiedAssetLines = assetEntries.map(toLine);
  // All assets combined for total computation
  const assets = [...currentAssetLines, ...noncurrentAssetLines, ...unclassifiedAssetLines];

  const currentLiabLines = currentLiabEntries.map(toLine);
  const noncurrentLiabLines = noncurrentLiabEntries.map(toLine);
  const unclassifiedLiabLines = liabilityEntries.map(toLine);
  const liabilities = [...currentLiabLines, ...noncurrentLiabLines, ...unclassifiedLiabLines];

  const equity = equityEntries.map(toLine);
  const revenueLines = revenueEntries.map(toLine);
  const expenseLines = expenseEntries.map(toLine);
  const ociLines = ociEntries.map(toLine);

  const totalAssets = sumLines(assets);
  const totalLiabilities = sumLines(liabilities);
  // Equity for BS equation: Equity accounts + Net Income (Revenue - Expense) + OCI per ASC 210/220
  const equityOnly = sumLines(equity);
  const totalRevenue = sumLines(revenueLines);
  const totalExpenses = sumLines(expenseLines);
  const totalOci = sumLines(ociLines);
  let totalEquity = round2(plus(plus(equityOnly, minus(totalRevenue, totalExpenses)), totalOci));

  // Statement-level rounding adjustment: if sum-of-rounded-lines creates a micro-imbalance
  // (≤ $0.01), add a rounding adjustment line to equity so statements tie exactly.
  const bsDiff = round2(minus(totalAssets, plus(totalLiabilities, totalEquity)));
  if (bsDiff !== 0 && Math.abs(bsDiff) <= 0.01) {
    equity.push({
      label: 'Rounding adjustment',
      amount: bsDiff,
    });
    totalEquity = round2(plus(totalEquity, bsDiff));
  }

  const totalDebits = sumRound2(entries.map((e) => e.debit ?? 0));
  const totalCredits = sumRound2(entries.map((e) => e.credit ?? 0));

  const gateResult = runIntegrityGate({
    trialBalance: { totalDebits, totalCredits },
    balanceSheet: { totalAssets, totalLiabilities, totalEquity },
    tolerance: materiality,
  });
  const balances = gateResult.checks?.balanceSheetBalances ?? false;

  const totalCurrentAssets = sumLines(currentAssetLines);
  const totalNoncurrentAssets = sumLines(noncurrentAssetLines);
  const totalCurrentLiabilities = sumLines(currentLiabLines);
  const totalNoncurrentLiabilities = sumLines(noncurrentLiabLines);

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    currentAssets: currentAssetLines,
    noncurrentAssets: noncurrentAssetLines,
    unclassifiedAssets: unclassifiedAssetLines,
    currentLiabilities: currentLiabLines,
    noncurrentLiabilities: noncurrentLiabLines,
    unclassifiedLiabilities: unclassifiedLiabLines,
    totalCurrentAssets,
    totalNoncurrentAssets,
    totalCurrentLiabilities,
    totalNoncurrentLiabilities,
    ...(ociLines.length > 0 ? { oci: { items: ociLines, total: totalOci } } : {}),
    balances,
    codificationRef: BALANCE_SHEET,
  };
}

/** FS line IDs for COGS */
const COGS_FS_LINES = new Set(['fs_cogs', 'fs_cogs_materials', 'fs_cogs_labor', 'fs_cogs_overhead']);
/** FS line IDs for Operating Expenses */
const OPEX_FS_LINES = new Set(['fs_opex', 'fs_opex_sga', 'fs_opex_rd', 'fs_opex_da', 'fs_opex_other']);
/** FS line IDs for Other Income / (Expense) */
const OTHER_INCOME_FS_LINES = new Set(['fs_other_income', 'fs_interest_income', 'fs_interest_expense', 'fs_other_other', 'fs_other_gain_loss']);
/** FS line IDs for Tax */
const TAX_FS_LINES = new Set(['fs_tax_expense', 'fs_tax_current', 'fs_tax_deferred']);

/** Bucket PL by taxonomy with PE-standard categories. Supports discontinued operations (ASC 205-20). */
function bucketPlByFsLine(entries: TrialBalanceEntry[]): {
  revenue: TrialBalanceEntry[];
  cogs: TrialBalanceEntry[];
  operatingExpenses: TrialBalanceEntry[];
  otherIncomeExpense: TrialBalanceEntry[];
  taxExpense: TrialBalanceEntry[];
  expenses: TrialBalanceEntry[];
  discontinued: TrialBalanceEntry[];
} {
  const revenue: TrialBalanceEntry[] = [];
  const cogs: TrialBalanceEntry[] = [];
  const operatingExpenses: TrialBalanceEntry[] = [];
  const otherIncomeExpense: TrialBalanceEntry[] = [];
  const taxExpense: TrialBalanceEntry[] = [];
  const expenses: TrialBalanceEntry[] = [];
  const discontinued: TrialBalanceEntry[] = [];
  const rev = (t?: string) => t != null && String(t).toUpperCase() === 'REVENUE';
  const exp = (t?: string) => t != null && String(t).toUpperCase() === 'EXPENSE';
  for (const e of entries) {
    if (e.fsLineId && DISCONTINUED_FS_LINES.has(e.fsLineId)) discontinued.push(e);
    else if (e.fsLineId === 'fs_revenue' || e.fsLineId === 'fs_revenue_contra' || e.fsLineId === 'fs_revenue_product' || e.fsLineId === 'fs_revenue_service' || e.fsLineId === 'fs_revenue_other') revenue.push(e);
    else if (e.fsLineId && COGS_FS_LINES.has(e.fsLineId)) cogs.push(e);
    else if (e.fsLineId && OPEX_FS_LINES.has(e.fsLineId)) operatingExpenses.push(e);
    else if (e.fsLineId && OTHER_INCOME_FS_LINES.has(e.fsLineId)) otherIncomeExpense.push(e);
    else if (e.fsLineId && TAX_FS_LINES.has(e.fsLineId)) taxExpense.push(e);
    else if (e.fsLineId === 'fs_expense') expenses.push(e);
    else if (rev(e.accountType)) revenue.push(e);
    else if (exp(e.accountType)) expenses.push(e);
  }
  return { revenue, cogs, operatingExpenses, otherIncomeExpense, taxExpense, expenses, discontinued };
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
  const {
    revenue: revenueEntries,
    cogs: cogsEntries,
    operatingExpenses: opexEntries,
    otherIncomeExpense: otherEntries,
    taxExpense: taxEntries,
    expenses: expenseEntries,
    discontinued: discontinuedEntries,
  } = bucketPlByFsLine(entries);

  const revenue = revenueEntries.map(toLine);
  const cogsLines = cogsEntries.map(toLine);
  const opexLines = opexEntries.map(toLine);
  const otherLines = otherEntries.map(toLine);
  const taxLines = taxEntries.map(toLine);
  const unclassifiedExpenses = expenseEntries.map(toLine);
  const discontinuedLines = discontinuedEntries.map(toLine);

  const totalRevenue = sumLines(revenue);
  const totalCogs = sumLines(cogsLines);
  const totalOpex = sumLines(opexLines);
  const totalOther = sumLines(otherLines);
  const totalTax = sumLines(taxLines);
  const totalUnclassifiedExpenses = sumLines(unclassifiedExpenses);
  const totalDiscontinued = sumLines(discontinuedLines);

  // All classified detail-expense lines combined (for the flat "expenses" array)
  const allExpenseLines = [...cogsLines, ...opexLines, ...otherLines, ...taxLines, ...unclassifiedExpenses];
  const totalExpenses = sumRound2(allExpenseLines.map((l) => l.amount));

  // PE-standard intermediate subtotals (using Decimal.js arithmetic)
  const hasDetailedPL = cogsLines.length > 0 || opexLines.length > 0 || otherLines.length > 0 || taxLines.length > 0;
  const grossProfit = round2(minus(totalRevenue, totalCogs));
  const operatingIncome = round2(minus(grossProfit, plus(totalOpex, totalUnclassifiedExpenses)));
  const incomeBeforeTax = round2(plus(operatingIncome, totalOther));
  const netIncome = round2(minus(incomeBeforeTax, totalTax));

  // EBITDA = Net Income + Tax + Interest Expense + D&A
  const interestExpenseAmount = sumRound2(
    otherEntries
      .filter((e) => e.fsLineId === 'fs_interest_expense')
      .map((e) => netAmount(e))
  );
  const daAmount = sumRound2(
    opexEntries
      .filter((e) => e.fsLineId === 'fs_opex_da')
      .map((e) => netAmount(e))
  );
  const ebitda = round2(plus(plus(plus(netIncome, totalTax), interestExpenseAmount), daAmount));

  return {
    revenue,
    expenses: allExpenseLines,
    totalRevenue,
    totalExpenses,
    netIncome,
    ...(hasDetailedPL ? {
      cogs: cogsLines,
      totalCogs,
      grossProfit,
      operatingExpenses: opexLines.length > 0 ? opexLines : unclassifiedExpenses.length > 0 ? unclassifiedExpenses : undefined,
      totalOperatingExpenses: round2(plus(totalOpex, totalUnclassifiedExpenses)),
      operatingIncome,
      otherIncomeExpense: otherLines,
      totalOtherIncomeExpense: totalOther,
      incomeBeforeTax,
      taxExpense: taxLines,
      totalTaxExpense: totalTax,
      ebitda,
    } : {}),
    ...(discontinuedLines.length > 0 ? { discontinuedOperations: { items: discontinuedLines, total: totalDiscontinued } } : {}),
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

/**
 * Validate already-built trial balance and balance sheet (Kill Switch).
 * Delegates to runIntegrityGate via assertIntegrityGateOrThrow.
 * Throws MathematicalIntegrityError if (A) Sum(Debits) != Sum(Credits) or (B) Assets != L+E.
 * Use when returning stored statements (e.g. audit binder) to ensure we never serve illegal data.
 */
export function validateTrialBalanceAndBalanceSheet(
  trialBalance: TrialBalanceResult | { entries: TrialBalanceEntry[]; totalDebits?: number; totalCredits?: number },
  balanceSheet: BalanceSheet,
  tolerance?: number
): void {
  const entries = trialBalance.entries ?? [];
  const totalDebits =
    'totalDebits' in trialBalance && typeof trialBalance.totalDebits === 'number'
      ? trialBalance.totalDebits
      : sumRound2(entries.map((e) => e.debit ?? 0));
  const totalCredits =
    'totalCredits' in trialBalance && typeof trialBalance.totalCredits === 'number'
      ? trialBalance.totalCredits
      : sumRound2(entries.map((e) => e.credit ?? 0));

  assertIntegrityGateOrThrow({
    trialBalance: { totalDebits, totalCredits },
    balanceSheet: {
      totalAssets: balanceSheet.totalAssets,
      totalLiabilities: balanceSheet.totalLiabilities,
      totalEquity: balanceSheet.totalEquity,
    },
    tolerance,
  });
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
 * Delegates to runIntegrityGate (assertIntegrityGateOrThrow) — single source of truth for integrity checks.
 * If either check fails, throws MathematicalIntegrityError and returns no data. Use for all API paths that return financials.
 * When plug accounts (Miscellaneous, Suspense, Other) absorb >= 90% of net activity, flags report as 'Balanced but High Risk'
 * and returns plugAlert for mandatory audit alert in tenant_hitl_staging.
 */
export function buildValidatedStatements(
  trialBalanceResult: TrialBalanceResult,
  options?: { preClassifiedEntries?: TrialBalanceEntry[]; materiality?: number; tolerance?: number }
): BuildValidatedStatementsResult {
  const entries = trialBalanceResult.entries ?? [];
  const totalDebits =
    trialBalanceResult.totalDebits != null
      ? trialBalanceResult.totalDebits
      : sumRound2(entries.map((e) => e.debit ?? 0));
  const totalCredits =
    trialBalanceResult.totalCredits != null
      ? trialBalanceResult.totalCredits
      : sumRound2(entries.map((e) => e.credit ?? 0));

  const result = buildFinancialStatements(trialBalanceResult, options);

  // totalEquity from buildBalanceSheet already includes Net Income (Revenue - Expense)
  assertIntegrityGateOrThrow({
    trialBalance: { totalDebits, totalCredits },
    balanceSheet: {
      totalAssets: result.balanceSheet.totalAssets,
      totalLiabilities: result.balanceSheet.totalLiabilities,
      totalEquity: result.balanceSheet.totalEquity,
    },
    tolerance: options?.tolerance,
  });

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
