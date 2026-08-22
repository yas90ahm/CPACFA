/**
 * Versioned statement packages: generateStatements(close_session_id) creates new package version deterministically;
 * computeDiff(prev, next) produces diff_json. Store classifier/mapping rule versions for traceability.
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import type { Pool } from 'pg';
import { withTransaction } from '../db/transaction.js';
import type { TrialBalanceResult, BalanceSheet, CashFlowStatement, EquityChangesStatement } from '../types/financial.js';
import type { StatementPackage, StatementLine, StatementDiffJson, ValidationResult } from '../types/statement_package.js';
import { buildValidatedStatements, buildBalanceSheet, MathematicalIntegrityError } from './financialStatements.js';
import { buildCashFlowStatement } from './cashFlow.js';
import { buildEquityChangesStatement } from './equityChanges.js';
import { getAdjustedTrialBalance } from './adjusted_trial_balance_service.js';
import { getSession, listSessions } from './close_session_service.js';
import { recordMaterialEvent } from './audit_service.js';
import { clearStatementsStaleSince } from '../db/repositories/close_session_repository.js';
import * as repo from '../db/repositories/statement_package_repository.js';
import { computeVariances } from './variance_analysis_service.js';
import { getEntitySettings } from './entity_settings_service.js';
import { from as decimalFrom, sumRound2, normalizeMoney } from '../utils/decimal.js';
import { financialEvents, buildEventPacket } from '../events/financial_event_emitter.js';
import {
  applyPresentationReferences,
  normalizeAccountingStandard,
} from '../constants/accounting/presentation_references.js';

const ENGINE_VERSION = 'financialStatements.framework.v2';
const TOLERANCE = 0.01;

/** Get prior period adjusted TB for the same entity (period_end < current). Returns null if first close or no prior TB data. */
async function getPriorPeriodAdjustedTB(
  pool: Pool,
  tenantId: string,
  entityId: string,
  currentPeriodEnd: string
): Promise<TrialBalanceResult | null> {
  const sessions = await listSessions(pool, { tenantId, entityId });
  const prior = sessions
    .filter((s) =>
      s.periodEnd < currentPeriodEnd &&
      ['certified', 'subsequent_events_review', 'locked'].includes(s.status)
    )
    .sort((a, b) => (b.periodEnd as string).localeCompare(a.periodEnd as string))[0];
  if (!prior) return null;
  const priorPeriodLabel = (prior.periodEnd as string).slice(0, 7);
  let entries;
  try {
    entries = await getAdjustedTrialBalance(tenantId, priorPeriodLabel, pool, prior.id);
  } catch {
    // Prior period has no TB data — treat as first close
    return null;
  }
  const totalDebits = sumRound2(entries.map((e) => e.debit ?? 0));
  const totalCredits = sumRound2(entries.map((e) => e.credit ?? 0));
  return {
    entries,
    totalDebits,
    totalCredits,
    balances: decimalFrom(totalDebits).minus(totalCredits).abs().lessThan(TOLERANCE),
    errors: [],
  };
}

/** Sum BS assets whose label matches cash/bank (for cash tie check). */
function getCashFromBalanceSheet(bs: BalanceSheet): number {
  return sumRound2(bs.assets.filter((a) => /cash|bank/i.test(a.label ?? '')).map((a) => a.amount));
}

/** Run cross-statement validation; returns results for storage (package still stored on failure). */
function runCrossStatementValidation(
  balanceSheet: BalanceSheet,
  profitAndLoss: { netIncome: number },
  cashFlowStatement: CashFlowStatement,
  equityStatement: EquityChangesStatement
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const d = (n: number) => decimalFrom(n).toDecimalPlaces(2);

  const balanceSheetEquation = d(balanceSheet.totalAssets).equals(
    d(balanceSheet.totalLiabilities).plus(d(balanceSheet.totalEquity))
  );
  results.push({
    check: 'balance_sheet_equation',
    passed: balanceSheetEquation,
    message: balanceSheetEquation
      ? undefined
      : `Assets ${balanceSheet.totalAssets} != liabilities plus equity ${balanceSheet.totalLiabilities + balanceSheet.totalEquity}`,
  });

  const isNetIncome = profitAndLoss.netIncome;
  const equityNetIncome = equityStatement.changes.find((c) => /net income/i.test(c.label))?.amount ?? isNetIncome;
  const netIncomeTie = d(isNetIncome).equals(d(equityNetIncome));
  results.push({
    check: 'net_income_tie',
    passed: netIncomeTie,
    message: netIncomeTie ? undefined : `IS net income ${isNetIncome} != equity net income ${equityNetIncome}`,
  });

  const cfEndingCash = cashFlowStatement.endingCash ?? 0;
  const bsCash = getCashFromBalanceSheet(balanceSheet);
  const cashTie = d(cfEndingCash).equals(d(bsCash));
  results.push({
    check: 'cash_tie',
    passed: cashTie,
    message: cashTie ? undefined : `CF ending cash ${cfEndingCash} != BS cash ${bsCash}`,
  });

  const cashFlowSections = sumRound2([
    ...cashFlowStatement.operating.map((line) => line.amount),
    ...cashFlowStatement.investing.map((line) => line.amount),
    ...cashFlowStatement.financing.map((line) => line.amount),
  ]);
  const cashFlowSectionsTie = d(cashFlowSections).equals(d(cashFlowStatement.netChangeInCash));
  results.push({
    check: 'cash_flow_sections_tie',
    passed: cashFlowSectionsTie,
    message: cashFlowSectionsTie
      ? undefined
      : `Cash-flow sections ${cashFlowSections} != net change in cash ${cashFlowStatement.netChangeInCash}`,
  });

  const cashRollforwardTie = cashFlowStatement.beginningCash != null && cashFlowStatement.endingCash != null
    ? d(cashFlowStatement.beginningCash)
        .plus(d(cashFlowStatement.netChangeInCash))
        .equals(d(cashFlowStatement.endingCash))
    : false;
  results.push({
    check: 'cash_rollforward_tie',
    passed: cashRollforwardTie,
    message: cashRollforwardTie
      ? undefined
      : 'Beginning cash plus net change does not equal ending cash.',
  });

  results.push({
    check: 'cash_flow_comparative_source',
    passed: cashFlowStatement.estimated !== true,
    message: cashFlowStatement.estimated
      ? 'No prior certified trial balance is available; cash flow remains an estimate and cannot complete the statement control.'
      : undefined,
  });

  const closingEquity = equityStatement.closingEquity ?? balanceSheet.totalEquity;
  const reTie = d(closingEquity).equals(d(balanceSheet.totalEquity));
  results.push({
    check: 'equity_tie',
    passed: reTie,
    message: reTie ? undefined : `Equity statement closing ${closingEquity} != BS total equity ${balanceSheet.totalEquity}`,
  });

  results.push({
    check: 'equity_comparative_source',
    passed: equityStatement.estimated !== true,
    message: equityStatement.estimated
      ? 'No prior certified balance sheet is available; the changes-in-equity roll-forward remains an estimate.'
      : undefined,
  });

  return results;
}

function periodLabelFromSession(session: { periodEnd: string }): string {
  return session.periodEnd.slice(0, 7);
}

/** Canonical hash of inputs that determine statement output (deterministic). */
function hashStatementInput(
  closeSessionId: string,
  standard: string,
  entries: Array<{ accountName: string; debit?: number; credit?: number }>
): string {
  const canonical = JSON.stringify(
    {
      closeSessionId,
      standard,
      engineVersion: ENGINE_VERSION,
      entries: entries.map((e) => ({ n: e.accountName, d: e.debit ?? 0, c: e.credit ?? 0 })).sort((a, b) => a.n.localeCompare(b.n)),
    },
    null,
    0
  );
  return createHash('sha256').update(canonical).digest('hex');
}

interface LineItem {
  label: string;
  amount: number;
  accountCode?: string;
}

/** Flatten BS, P&L, Cash Flow, and Equity to statement lines with hierarchy. */
function flattenToLines(
  packageId: string,
  balanceSheet: BalanceSheet,
  profitAndLoss: {
    revenue: LineItem[]; expenses: LineItem[]; totalRevenue: number; totalExpenses: number; netIncome: number;
    cogs?: LineItem[]; totalCogs?: number; grossProfit?: number;
    operatingExpenses?: LineItem[]; totalOperatingExpenses?: number; operatingIncome?: number;
    otherIncomeExpense?: LineItem[]; totalOtherIncomeExpense?: number; incomeBeforeTax?: number;
    taxExpense?: LineItem[]; totalTaxExpense?: number; ebitda?: number;
  },
  cashFlowStatement?: CashFlowStatement,
  equityStatement?: EquityChangesStatement
): StatementLine[] {
  const lines: StatementLine[] = [];
  let order = 0;

  const pushLine = (
    fsLineId: string,
    amount: number,
    statement: StatementLine['statement'],
    opts: { label: string; section: string; indentLevel?: number; isSubtotal?: boolean; isGrandTotal?: boolean; accountCode?: string; accountCodes?: string[] }
  ) => {
    lines.push({
      packageId,
      fsLineId,
      amount: String(amount),
      statement,
      metadata: {
        label: opts.label,
        section: opts.section,
        ...(opts.accountCode && { accountCode: opts.accountCode }),
        ...(opts.accountCodes && opts.accountCodes.length > 0 && { accountCodes: opts.accountCodes }),
      },
      displayOrder: order++,
      indentLevel: opts.indentLevel ?? 1,
      isSubtotal: opts.isSubtotal ?? false,
      isGrandTotal: opts.isGrandTotal ?? false,
      sectionName: opts.section,
    });
  };

  // Helper to emit a section of line items
  const pushItems = (items: LineItem[], prefix: string, section: string, stmt: StatementLine['statement'], indent = 1) => {
    items.forEach((item, i) => {
      pushLine(`${prefix}_${i}`, item.amount, stmt, {
        label: item.label,
        section,
        accountCode: item.accountCode,
        indentLevel: indent,
      });
    });
  };

  // -----------------------------------------------------------------------
  // Balance Sheet — Current / Non-Current classification
  // -----------------------------------------------------------------------
  const hasClassifiedBS = (balanceSheet.currentAssets && balanceSheet.currentAssets.length > 0) ||
    (balanceSheet.noncurrentAssets && balanceSheet.noncurrentAssets.length > 0);

  pushLine('bs_header_assets', 0, 'balance_sheet', { label: 'ASSETS', section: 'Assets', indentLevel: 0 });

  if (hasClassifiedBS) {
    // Current Assets
    if (balanceSheet.currentAssets && balanceSheet.currentAssets.length > 0) {
      pushLine('bs_header_current_assets', 0, 'balance_sheet', { label: 'Current Assets', section: 'Current Assets', indentLevel: 0 });
      pushItems(balanceSheet.currentAssets, 'bs_current_assets', 'Current Assets', 'balance_sheet', 2);
      pushLine('bs_total_current_assets', balanceSheet.totalCurrentAssets ?? 0, 'balance_sheet', {
        label: 'Total Current Assets', section: 'Current Assets', indentLevel: 1, isSubtotal: true,
      });
    }
    // Non-Current Assets
    if (balanceSheet.noncurrentAssets && balanceSheet.noncurrentAssets.length > 0) {
      pushLine('bs_header_noncurrent_assets', 0, 'balance_sheet', { label: 'Non-Current Assets', section: 'Non-Current Assets', indentLevel: 0 });
      pushItems(balanceSheet.noncurrentAssets, 'bs_noncurrent_assets', 'Non-Current Assets', 'balance_sheet', 2);
      pushLine('bs_total_noncurrent_assets', balanceSheet.totalNoncurrentAssets ?? 0, 'balance_sheet', {
        label: 'Total Non-Current Assets', section: 'Non-Current Assets', indentLevel: 1, isSubtotal: true,
      });
    }
    // Unclassified assets (mapped to fs_asset without current/non-current detail)
    if (balanceSheet.unclassifiedAssets && balanceSheet.unclassifiedAssets.length > 0) {
      pushItems(balanceSheet.unclassifiedAssets, 'bs_assets', 'Assets', 'balance_sheet');
    }
  } else {
    // Flat asset list (legacy/fallback)
    pushItems(balanceSheet.assets, 'bs_assets', 'Assets', 'balance_sheet');
  }
  pushLine('bs_total_assets', balanceSheet.totalAssets, 'balance_sheet', {
    label: 'TOTAL ASSETS', section: 'Assets', indentLevel: 0, isGrandTotal: true,
  });

  // Liabilities & Equity
  pushLine('bs_header_libe', 0, 'balance_sheet', { label: 'LIABILITIES & EQUITY', section: 'Liabilities & Equity', indentLevel: 0 });

  const hasClassifiedLiab = (balanceSheet.currentLiabilities && balanceSheet.currentLiabilities.length > 0) ||
    (balanceSheet.noncurrentLiabilities && balanceSheet.noncurrentLiabilities.length > 0);

  if (hasClassifiedLiab) {
    if (balanceSheet.currentLiabilities && balanceSheet.currentLiabilities.length > 0) {
      pushLine('bs_header_current_liabilities', 0, 'balance_sheet', { label: 'Current Liabilities', section: 'Current Liabilities', indentLevel: 0 });
      pushItems(balanceSheet.currentLiabilities, 'bs_current_liabilities', 'Current Liabilities', 'balance_sheet', 2);
      pushLine('bs_total_current_liabilities', balanceSheet.totalCurrentLiabilities ?? 0, 'balance_sheet', {
        label: 'Total Current Liabilities', section: 'Current Liabilities', indentLevel: 1, isSubtotal: true,
      });
    }
    if (balanceSheet.noncurrentLiabilities && balanceSheet.noncurrentLiabilities.length > 0) {
      pushLine('bs_header_noncurrent_liabilities', 0, 'balance_sheet', { label: 'Non-Current Liabilities', section: 'Non-Current Liabilities', indentLevel: 0 });
      pushItems(balanceSheet.noncurrentLiabilities, 'bs_noncurrent_liabilities', 'Non-Current Liabilities', 'balance_sheet', 2);
      pushLine('bs_total_noncurrent_liabilities', balanceSheet.totalNoncurrentLiabilities ?? 0, 'balance_sheet', {
        label: 'Total Non-Current Liabilities', section: 'Non-Current Liabilities', indentLevel: 1, isSubtotal: true,
      });
    }
    if (balanceSheet.unclassifiedLiabilities && balanceSheet.unclassifiedLiabilities.length > 0) {
      pushItems(balanceSheet.unclassifiedLiabilities, 'bs_liabilities', 'Liabilities', 'balance_sheet');
    }
  } else {
    pushItems(balanceSheet.liabilities, 'bs_liabilities', 'Liabilities', 'balance_sheet');
  }
  pushLine('bs_total_liabilities', balanceSheet.totalLiabilities, 'balance_sheet', {
    label: 'Total Liabilities', section: 'Liabilities', indentLevel: 0, isSubtotal: true,
  });

  // Equity
  pushLine('bs_header_equity', 0, 'balance_sheet', { label: "Stockholders' Equity", section: 'Equity', indentLevel: 0 });
  pushItems(balanceSheet.equity, 'bs_equity', 'Equity', 'balance_sheet');
  // OCI (sub-section of equity, ASC 220)
  if (balanceSheet.oci && balanceSheet.oci.items.length > 0) {
    pushItems(balanceSheet.oci.items, 'bs_oci', 'Accumulated Other Comprehensive Income', 'balance_sheet');
    pushLine('bs_total_oci', balanceSheet.oci.total, 'balance_sheet', {
      label: 'Total Accumulated OCI', section: 'Accumulated Other Comprehensive Income', indentLevel: 1, isSubtotal: true,
    });
  }
  pushLine('bs_total_equity', balanceSheet.totalEquity, 'balance_sheet', {
    label: "TOTAL STOCKHOLDERS' EQUITY", section: 'Equity', indentLevel: 0, isSubtotal: true,
  });
  pushLine('bs_total_libe', sumRound2([balanceSheet.totalLiabilities, balanceSheet.totalEquity]), 'balance_sheet', {
    label: 'TOTAL LIABILITIES & EQUITY', section: 'Liabilities & Equity', indentLevel: 0, isGrandTotal: true,
  });

  // -----------------------------------------------------------------------
  // P&L — PE-standard subtotal hierarchy
  // -----------------------------------------------------------------------
  const hasDetailedPL = profitAndLoss.cogs != null || profitAndLoss.operatingExpenses != null;

  // Revenue
  pushItems(profitAndLoss.revenue, 'pl_revenue', 'Revenue', 'profit_and_loss');
  pushLine('pl_total_revenue', profitAndLoss.totalRevenue, 'profit_and_loss', {
    label: 'Total Revenue', section: 'Revenue', indentLevel: 0, isSubtotal: true,
  });

  if (hasDetailedPL) {
    // COGS
    if (profitAndLoss.cogs && profitAndLoss.cogs.length > 0) {
      pushItems(profitAndLoss.cogs, 'pl_cogs', 'Cost of Goods Sold', 'profit_and_loss');
      pushLine('pl_total_cogs', profitAndLoss.totalCogs ?? 0, 'profit_and_loss', {
        label: 'Total Cost of Goods Sold', section: 'Cost of Goods Sold', indentLevel: 0, isSubtotal: true,
      });
    }
    // Gross Profit
    pushLine('pl_gross_profit', profitAndLoss.grossProfit ?? 0, 'profit_and_loss', {
      label: 'GROSS PROFIT', section: 'Gross Profit', indentLevel: 0, isSubtotal: true,
    });
    // Operating Expenses
    if (profitAndLoss.operatingExpenses && profitAndLoss.operatingExpenses.length > 0) {
      pushLine('pl_header_opex', 0, 'profit_and_loss', { label: 'Operating Expenses', section: 'Operating Expenses', indentLevel: 0 });
      pushItems(profitAndLoss.operatingExpenses, 'pl_opex', 'Operating Expenses', 'profit_and_loss');
      pushLine('pl_total_opex', profitAndLoss.totalOperatingExpenses ?? 0, 'profit_and_loss', {
        label: 'Total Operating Expenses', section: 'Operating Expenses', indentLevel: 0, isSubtotal: true,
      });
    }
    // Operating Income
    pushLine('pl_operating_income', profitAndLoss.operatingIncome ?? 0, 'profit_and_loss', {
      label: 'OPERATING INCOME', section: 'Operating Income', indentLevel: 0, isSubtotal: true,
    });
    // Other Income / (Expense)
    if (profitAndLoss.otherIncomeExpense && profitAndLoss.otherIncomeExpense.length > 0) {
      pushLine('pl_header_other', 0, 'profit_and_loss', { label: 'Other Income / (Expense)', section: 'Other Income / (Expense)', indentLevel: 0 });
      pushItems(profitAndLoss.otherIncomeExpense, 'pl_other', 'Other Income / (Expense)', 'profit_and_loss');
      pushLine('pl_total_other', profitAndLoss.totalOtherIncomeExpense ?? 0, 'profit_and_loss', {
        label: 'Total Other Income / (Expense)', section: 'Other Income / (Expense)', indentLevel: 0, isSubtotal: true,
      });
    }
    // Income Before Tax
    pushLine('pl_income_before_tax', profitAndLoss.incomeBeforeTax ?? 0, 'profit_and_loss', {
      label: 'INCOME BEFORE TAX', section: 'Income Before Tax', indentLevel: 0, isSubtotal: true,
    });
    // Tax
    if (profitAndLoss.taxExpense && profitAndLoss.taxExpense.length > 0) {
      pushItems(profitAndLoss.taxExpense, 'pl_tax', 'Income Tax Expense', 'profit_and_loss');
    }
  } else {
    // Flat expense list (legacy/fallback)
    pushItems(profitAndLoss.expenses, 'pl_expenses', 'Expenses', 'profit_and_loss');
    pushLine('pl_total_expenses', profitAndLoss.totalExpenses, 'profit_and_loss', {
      label: 'Total Expenses', section: 'Expenses', indentLevel: 0, isSubtotal: true,
    });
  }

  // Net Income
  pushLine('pl_net_income', profitAndLoss.netIncome, 'profit_and_loss', {
    label: 'NET INCOME', section: 'Net Income', indentLevel: 0, isGrandTotal: true,
  });

  // EBITDA (non-GAAP supplemental)
  if (hasDetailedPL && profitAndLoss.ebitda != null) {
    pushLine('pl_ebitda', profitAndLoss.ebitda, 'profit_and_loss', {
      label: 'EBITDA', section: 'EBITDA', indentLevel: 0, isSubtotal: true,
    });
  }

  // Discontinued Operations (ASC 205-20)
  if ('discontinuedOperations' in profitAndLoss && (profitAndLoss as any).discontinuedOperations) {
    const discOps = (profitAndLoss as any).discontinuedOperations as { items: Array<{ label: string; amount: number; accountCode?: string }>; total: number };
    discOps.items.forEach((item: { label: string; amount: number; accountCode?: string }, i: number) => {
      pushLine(`pl_discontinued_${i}`, item.amount, 'profit_and_loss', {
        label: item.label, section: 'Discontinued Operations', accountCode: item.accountCode,
      });
    });
    pushLine('pl_total_discontinued', discOps.total, 'profit_and_loss', {
      label: 'Total Discontinued Operations', section: 'Discontinued Operations', indentLevel: 0, isSubtotal: true,
    });
  }

  // Cash Flow
  if (cashFlowStatement) {
    ['operating', 'investing', 'financing'].forEach((section) => {
      const items = cashFlowStatement[section as keyof CashFlowStatement] as Array<{ label: string; amount: number }> | undefined;
      if (!Array.isArray(items)) return;
      items.forEach((item, i) => {
        pushLine(`cf_${section}_${i}`, item.amount, 'cash_flow', { label: item.label, section });
      });
    });
    if (cashFlowStatement.beginningCash != null) {
      pushLine('cf_beginning_cash', cashFlowStatement.beginningCash, 'cash_flow', { label: 'Beginning cash', section: 'opening' });
    }
    if (cashFlowStatement.endingCash != null) {
      pushLine('cf_ending_cash', cashFlowStatement.endingCash, 'cash_flow', { label: 'Ending cash', section: 'closing' });
    }
    pushLine('cf_net_change', cashFlowStatement.netChangeInCash, 'cash_flow', { label: 'Net change in cash', section: 'summary' });
  }

  // Equity
  if (equityStatement) {
    if (equityStatement.openingEquity != null) {
      pushLine('eq_opening', equityStatement.openingEquity, 'equity', { label: 'Opening equity', section: 'opening' });
    }
    equityStatement.changes.forEach((item, i) => {
      pushLine(`eq_change_${i}`, item.amount, 'equity', { label: item.label, section: 'changes' });
    });
    if (equityStatement.ociChanges && equityStatement.ociChanges.length > 0) {
      equityStatement.ociChanges.forEach((item, i) => {
        pushLine(`eq_oci_${i}`, item.amount, 'equity', { label: item.label, section: 'other_comprehensive_income' });
      });
    }
    if (equityStatement.closingEquity != null) {
      pushLine('eq_closing', equityStatement.closingEquity, 'equity', { label: 'Closing equity', section: 'closing' });
    }
  }

  return lines;
}

/**
 * Generate statements for a close session and persist as a new package version.
 * Deterministic: same approved data (adjusted TB) => same output; input_hash and version stored.
 */
export async function generateStatements(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  opts?: { generatedBy?: string; status?: 'draft' | 'final'; ruleVersionsSnapshot?: Record<string, unknown> }
): Promise<StatementPackage> {
  const generationStartedAt = new Date().toISOString();
  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) {
    throw new Error(`Close session not found: ${closeSessionId}`);
  }
  const periodLabel = periodLabelFromSession(session);
  console.log(`[STMT-DEBUG] generateStatements: sessionId=${closeSessionId}, tenantId=${tenantId}, session.periodEnd=${session.periodEnd}, derived periodLabel=${periodLabel}`);
  const entries = await getAdjustedTrialBalance(tenantId, periodLabel, pool, closeSessionId);
  const totalDebits = sumRound2(entries.map((e) => e.debit ?? 0));
  const totalCredits = sumRound2(entries.map((e) => e.credit ?? 0));
  const trialBalance: TrialBalanceResult = {
    entries,
    totalDebits,
    totalCredits,
    balances: decimalFrom(totalDebits).minus(totalCredits).abs().lessThanOrEqualTo(TOLERANCE),
    errors: [],
  };
  const rawResult = buildValidatedStatements(trialBalance);
  const standard = normalizeAccountingStandard(session.standard);
  const result = {
    ...rawResult,
    ...applyPresentationReferences(standard, rawResult.balanceSheet, rawResult.profitAndLoss),
  };
  const priorTB = await getPriorPeriodAdjustedTB(pool, tenantId, session.entityId, session.periodEnd);
  const priorBS = priorTB ? buildBalanceSheet(priorTB.entries) : undefined;
  const cashFlowStatement = buildCashFlowStatement(trialBalance, result.profitAndLoss, priorTB ?? undefined);
  const equityStatement = buildEquityChangesStatement(result.balanceSheet, priorBS, result.profitAndLoss);
  const validationResults = runCrossStatementValidation(
    result.balanceSheet,
    result.profitAndLoss,
    cashFlowStatement,
    equityStatement
  );
  const inputHash = hashStatementInput(closeSessionId, standard, entries);
  const pkg = await withTransaction(pool, async (client) => {
    const tx = client as unknown as Pool;
    const nextVersion = (await repo.getMaxVersionByCloseSessionId(tx, tenantId, closeSessionId)) + 1;
    const id = randomUUID();
    const created = await repo.insertStatementPackage(tx, tenantId, id, {
      closeSessionId,
      version: nextVersion,
      inputHash,
      generatedBy: opts?.generatedBy,
      status: opts?.status ?? 'draft',
      engineVersion: ENGINE_VERSION,
      ruleVersionsSnapshot: {
        ...(opts?.ruleVersionsSnapshot ?? {}),
        accountingStandard: standard,
        presentationReferences: true,
      },
      validationResults,
    });
    const lines = flattenToLines(id, result.balanceSheet, result.profitAndLoss, cashFlowStatement, equityStatement);
    await repo.insertStatementLinesBatch(tx, lines.map((line) => ({
      packageId: line.packageId,
      fsLineId: line.fsLineId,
      amount: Number(line.amount),
      statement: line.statement,
      metadata: line.metadata,
      displayOrder: line.displayOrder,
      indentLevel: line.indentLevel,
      isSubtotal: line.isSubtotal,
      isGrandTotal: line.isGrandTotal,
      sectionName: line.sectionName,
    })));
    const previousPackages = await repo.listStatementPackagesByCloseSessionId(tx, tenantId, closeSessionId, 2);
    const prevPkg = previousPackages.length >= 2 ? previousPackages[1] : undefined;
    if (prevPkg) {
      const prevLines = await repo.listStatementLinesByPackageId(tx, prevPkg.id);
      const nextLines = await repo.listStatementLinesByPackageId(tx, id);
      const diff = computeDiff(prevLines, nextLines);
      await repo.upsertStatementDiff(tx, prevPkg.id, id, diff);
    }
    const staleCleared = await clearStatementsStaleSince(tx, tenantId, closeSessionId, generationStartedAt);
    if (!staleCleared) {
      console.warn(`[STMT-WARN] Statements became stale during generation for session ${closeSessionId}. Regeneration needed.`);
    }

    // Compute variances for period-over-period (after statement generation)
    const priorSessions = await listSessions(tx, { tenantId, entityId: session.entityId });
    const priorSession = priorSessions
      .filter((s) => (s.periodEnd as string) < session.periodEnd)
      .sort((a, b) => (b.periodEnd as string).localeCompare(a.periodEnd as string))[0];
    let priorLinesInput: Array<{ fsLineId: string; amount: number; statement: string; label?: string }> | null = null;
    if (priorSession) {
      const priorPkgs = await repo.listStatementPackagesByCloseSessionId(tx, tenantId, priorSession.id, 1);
      const priorPkgForVariance = priorPkgs[0];
      if (priorPkgForVariance) {
        const priorLines = await repo.listStatementLinesByPackageId(tx, priorPkgForVariance.id);
        priorLinesInput = priorLines.map((l) => ({
          fsLineId: l.fsLineId,
          amount: Number(l.amount),
          statement: l.statement,
          label: (l.metadata as { label?: string })?.label,
        }));
      } else if (priorTB) {
        // No statement package for prior period — build lines from adjusted TB
        const priorResult = buildValidatedStatements(priorTB);
        const priorCF = buildCashFlowStatement(priorTB, priorResult.profitAndLoss);
        const priorEq = buildEquityChangesStatement(priorResult.balanceSheet, undefined, priorResult.profitAndLoss);
        const priorFlatLines = flattenToLines('__prior_derived__', priorResult.balanceSheet, priorResult.profitAndLoss, priorCF, priorEq);
        priorLinesInput = priorFlatLines.map((l) => ({
          fsLineId: l.fsLineId,
          amount: Number(l.amount),
          statement: l.statement,
          label: (l.metadata as { label?: string })?.label,
        }));
      }
    }
    // First period (no prior session): compare against zero so variances are always generated
    if (!priorLinesInput) {
      priorLinesInput = lines.map((l) => ({
        fsLineId: l.fsLineId,
        amount: 0,
        statement: l.statement,
        label: (l.metadata as { label?: string })?.label,
      }));
    }
    {
      const currentLines = lines.map((l) => ({
        fsLineId: l.fsLineId,
        amount: Number(l.amount),
        statement: l.statement,
        label: (l.metadata as { label?: string })?.label,
      }));
      const entitySettings = await getEntitySettings(tx, tenantId, session.entityId);
      const materialPct = Number(entitySettings.varianceMaterialityPercent) || 10;
      await computeVariances(tx, {
        tenantId,
        closeSessionId,
        periodLabel,
        currentLines,
        priorLines: priorLinesInput,
        materialThresholdPct: materialPct,
      });
    }

    await recordMaterialEvent(tx, {
      tenantId,
      periodLabel,
      eventType: 'statement_package_generation',
      deterministicFlagSnapshot: {
        packageId: id,
        closeSessionId,
        version: nextVersion,
        inputHash,
        engineVersion: ENGINE_VERSION,
        lineCount: lines.length,
      },
      createdBy: opts?.generatedBy,
    });
    return created;
  });

  // Emit gate check event after successful statement generation
  financialEvents.emit('GATE_CHECK_REQUESTED', buildEventPacket('GATE_CHECK_REQUESTED', {
    errorCode: 'GATE_CHECK',
    conflictingData: {},
    metadata: { tenantId, closeSessionId },
    data: { closeSessionId, trigger: 'statement_generated', triggeredBy: opts?.generatedBy ?? 'system' },
  }));

  return pkg;
}

/**
 * Compute diff between two package line sets (by fs_line_id).
 */
export function computeDiff(prevLines: StatementLine[], nextLines: StatementLine[]): StatementDiffJson {
  const prevByKey = new Map(prevLines.map((l) => [l.fsLineId, l]));
  const nextByKey = new Map(nextLines.map((l) => [l.fsLineId, l]));
  const added: StatementDiffJson['added'] = [];
  const removed: StatementDiffJson['removed'] = [];
  const changed: StatementDiffJson['changed'] = [];
  for (const [key, next] of nextByKey) {
    const prev = prevByKey.get(key);
    if (!prev) {
      added.push({ fsLineId: key, amount: Number(next.amount), statement: next.statement, metadata: next.metadata });
    } else if (decimalFrom(prev.amount).minus(decimalFrom(next.amount)).abs().greaterThan(0.001)) {
      changed.push({
        fsLineId: key,
        prevAmount: Number(prev.amount),
        nextAmount: Number(next.amount),
        statement: next.statement,
        metadata: next.metadata,
      });
    }
  }
  for (const [key, prev] of prevByKey) {
    if (!nextByKey.has(key)) {
      removed.push({ fsLineId: key, amount: Number(prev.amount), statement: prev.statement, metadata: prev.metadata });
    }
  }
  return { added, removed, changed };
}

export async function getStatementPackage(pool: Pool, tenantId: string, id: string): Promise<StatementPackage | null> {
  return repo.getStatementPackageById(pool, tenantId, id);
}

/** Get the most recent prior-period statement package for the same entity. */
async function getPriorPeriodStatementPackage(
  pool: Pool,
  tenantId: string,
  entityId: string,
  currentPeriodEnd: string
): Promise<StatementPackage | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT sp.id FROM statement_packages sp
     JOIN close_sessions cs ON cs.id = sp.close_session_id
     WHERE cs.tenant_id = $1 AND cs.entity_id = $2
       AND cs.period_end < $3
       AND cs.status IN ('certified', 'subsequent_events_review', 'locked')
     ORDER BY cs.period_end DESC, sp.generated_at DESC
     LIMIT 1`,
    [tenantId, entityId, currentPeriodEnd]
  );
  const row = r.rows[0];
  if (!row) return null;
  return repo.getStatementPackageById(pool, tenantId, row.id);
}

export async function getStatementPackageWithLines(
  pool: Pool,
  tenantId: string,
  id: string,
  includePrior?: boolean
): Promise<{ package: StatementPackage; lines: StatementLine[]; priorPackageId?: string } | null> {
  const pkg = await repo.getStatementPackageById(pool, tenantId, id);
  if (!pkg) return null;
  const lines = await repo.listStatementLinesByPackageId(pool, id);
  let priorPackageId: string | undefined;

  if (includePrior) {
    const session = await getSession(pool, tenantId, pkg.closeSessionId);
    if (session?.entityId && session?.periodEnd) {
      const priorPkg = await getPriorPeriodStatementPackage(
        pool,
        tenantId,
        session.entityId,
        session.periodEnd
      );
      const priorLines = priorPkg
        ? await repo.listStatementLinesByPackageId(pool, priorPkg.id)
        : [];
      priorPackageId = priorPkg?.id;
      const priorByFs = new Map(priorLines.map((l) => [l.fsLineId, l]));
      if (priorPkg) {
        for (const line of lines) {
          const prior = priorByFs.get(line.fsLineId);
          const priorAmount = prior ? normalizeMoney(prior.amount) : '0.00';
          const current = decimalFrom(line.amount);
          const priorDec = decimalFrom(priorAmount);
          const changeAmount = current.minus(priorDec).toDecimalPlaces(2).toString();
          const changePercent =
            priorDec.isZero() || priorDec.abs().isZero()
              ? null
              : current.minus(priorDec).div(priorDec.abs()).times(100).toDecimalPlaces(2).toString();
          (line as StatementLine & { priorAmount?: string; changeAmount?: string; changePercent?: string | null }).priorAmount = priorAmount;
          (line as StatementLine & { priorAmount?: string; changeAmount?: string; changePercent?: string | null }).changeAmount = changeAmount;
          (line as StatementLine & { priorAmount?: string; changeAmount?: string; changePercent?: string | null }).changePercent = changePercent;
        }
      }
    }
  }

  return { package: pkg, lines, ...(priorPackageId && { priorPackageId }) };
}

export async function listStatementPackages(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  limit?: number
): Promise<StatementPackage[]> {
  return repo.listStatementPackagesByCloseSessionId(pool, tenantId, closeSessionId, limit);
}

export async function getStatementDiff(
  pool: Pool,
  tenantId: string,
  fromPackageId: string,
  toPackageId: string
): Promise<{ fromPackageId: string; toPackageId: string; diffJson: StatementDiffJson; createdAt: string } | null> {
  const rec = await repo.getStatementDiff(pool, tenantId, fromPackageId, toPackageId);
  if (!rec) return null;
  return {
    fromPackageId: rec.fromPackageId,
    toPackageId: rec.toPackageId,
    diffJson: rec.diffJson,
    createdAt: rec.createdAt,
  };
}

export { MathematicalIntegrityError };
