/**
 * Versioned statement packages: generateStatements(close_session_id) creates new package version deterministically;
 * computeDiff(prev, next) produces diff_json. Store classifier/mapping rule versions for traceability.
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import type { Pool } from 'pg';
import type { TrialBalanceResult, TrialBalanceEntry, BalanceSheet, CashFlowStatement, EquityChangesStatement } from '../types/financial.js';
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
import { from as decimalFrom } from '../utils/decimal.js';

const ENGINE_VERSION = 'financialStatements.v1';
const TOLERANCE = 0.01;

/** Get prior period adjusted TB for the same entity (period_end < current). Returns null if first close. */
async function getPriorPeriodAdjustedTB(
  pool: Pool,
  tenantId: string,
  entityId: string,
  currentPeriodEnd: string
): Promise<TrialBalanceResult | null> {
  const sessions = await listSessions(pool, { tenantId, entityId });
  const prior = sessions
    .filter((s) => s.periodEnd < currentPeriodEnd)
    .sort((a, b) => (b.periodEnd as string).localeCompare(a.periodEnd as string))[0];
  if (!prior) return null;
  const priorPeriodLabel = (prior.periodEnd as string).slice(0, 7);
  const entries = await getAdjustedTrialBalance(tenantId, priorPeriodLabel, pool, prior.id);
  const totalDebits = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
  const totalCredits = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
  return {
    entries,
    totalDebits,
    totalCredits,
    balances: Math.abs(totalDebits - totalCredits) < TOLERANCE,
    errors: [],
  };
}

/** Sum BS assets whose label matches cash/bank (for cash tie check). */
function getCashFromBalanceSheet(bs: BalanceSheet): number {
  return bs.assets
    .filter((a) => /cash|bank/i.test(a.label ?? ''))
    .reduce((s, a) => s + a.amount, 0);
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

  const closingEquity = equityStatement.closingEquity ?? balanceSheet.totalEquity;
  const reTie = d(closingEquity).equals(d(balanceSheet.totalEquity));
  results.push({
    check: 'equity_tie',
    passed: reTie,
    message: reTie ? undefined : `Equity statement closing ${closingEquity} != BS total equity ${balanceSheet.totalEquity}`,
  });

  return results;
}

function periodLabelFromSession(session: { periodEnd: string }): string {
  return session.periodEnd.slice(0, 7);
}

/** Canonical hash of inputs that determine statement output (deterministic). */
function hashStatementInput(closeSessionId: string, entries: Array<{ accountName: string; debit?: number; credit?: number }>): string {
  const canonical = JSON.stringify(
    { closeSessionId, entries: entries.map((e) => ({ n: e.accountName, d: e.debit ?? 0, c: e.credit ?? 0 })).sort((a, b) => a.n.localeCompare(b.n)) },
    null,
    0
  );
  return createHash('sha256').update(canonical).digest('hex');
}

/** Flatten BS, P&L, Cash Flow, and Equity to statement lines with stable fs_line_id. */
function flattenToLines(
  packageId: string,
  balanceSheet: { assets: { label: string; amount: number }[]; liabilities: { label: string; amount: number }[]; equity: { label: string; amount: number }[] },
  profitAndLoss: { revenue: { label: string; amount: number }[]; expenses: { label: string; amount: number }[] },
  cashFlowStatement?: CashFlowStatement,
  equityStatement?: EquityChangesStatement
): StatementLine[] {
  const lines: StatementLine[] = [];
  const sections: { statement: 'balance_sheet' | 'profit_and_loss'; section: string; items: { label: string; amount: number }[] }[] = [
    { statement: 'balance_sheet', section: 'assets', items: balanceSheet.assets },
    { statement: 'balance_sheet', section: 'liabilities', items: balanceSheet.liabilities },
    { statement: 'balance_sheet', section: 'equity', items: balanceSheet.equity },
    { statement: 'profit_and_loss', section: 'revenue', items: profitAndLoss.revenue },
    { statement: 'profit_and_loss', section: 'expenses', items: profitAndLoss.expenses },
  ];
  for (const { statement, section, items } of sections) {
    const prefix = statement === 'balance_sheet' ? 'bs' : 'pl';
    items.forEach((item, i) => {
      lines.push({
        packageId,
        fsLineId: `${prefix}_${section}_${i}`,
        amount: item.amount,
        statement,
        metadata: { label: item.label, section },
      });
    });
  }
  if (cashFlowStatement) {
    ['operating', 'investing', 'financing'].forEach((section) => {
      const items = cashFlowStatement[section as keyof CashFlowStatement] as Array<{ label: string; amount: number }> | undefined;
      if (!Array.isArray(items)) return;
      items.forEach((item, i) => {
        lines.push({
          packageId,
          fsLineId: `cf_${section}_${i}`,
          amount: item.amount,
          statement: 'cash_flow',
          metadata: { label: item.label, section },
        });
      });
    });
    if (cashFlowStatement.beginningCash != null) {
      lines.push({ packageId, fsLineId: 'cf_beginning_cash', amount: cashFlowStatement.beginningCash, statement: 'cash_flow', metadata: { label: 'Beginning cash', section: 'opening' } });
    }
    if (cashFlowStatement.endingCash != null) {
      lines.push({ packageId, fsLineId: 'cf_ending_cash', amount: cashFlowStatement.endingCash, statement: 'cash_flow', metadata: { label: 'Ending cash', section: 'closing' } });
    }
    lines.push({ packageId, fsLineId: 'cf_net_change', amount: cashFlowStatement.netChangeInCash, statement: 'cash_flow', metadata: { label: 'Net change in cash', section: 'summary' } });
  }
  if (equityStatement) {
    if (equityStatement.openingEquity != null) {
      lines.push({ packageId, fsLineId: 'eq_opening', amount: equityStatement.openingEquity, statement: 'equity', metadata: { label: 'Opening equity', section: 'opening' } });
    }
    equityStatement.changes.forEach((item, i) => {
      lines.push({ packageId, fsLineId: `eq_change_${i}`, amount: item.amount, statement: 'equity', metadata: { label: item.label, section: 'changes' } });
    });
    if (equityStatement.closingEquity != null) {
      lines.push({ packageId, fsLineId: 'eq_closing', amount: equityStatement.closingEquity, statement: 'equity', metadata: { label: 'Closing equity', section: 'closing' } });
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
  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) {
    throw new Error(`Close session not found: ${closeSessionId}`);
  }
  const periodLabel = periodLabelFromSession(session);
  const entries = await getAdjustedTrialBalance(tenantId, periodLabel, pool, closeSessionId);
  const totalDebits = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
  const totalCredits = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
  const trialBalance: TrialBalanceResult = {
    entries,
    totalDebits,
    totalCredits,
    balances: Math.abs(totalDebits - totalCredits) < 0.01,
    errors: [],
  };
  const result = buildValidatedStatements(trialBalance);
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
  const inputHash = hashStatementInput(closeSessionId, entries);
  const nextVersion = (await repo.getMaxVersionByCloseSessionId(pool, tenantId, closeSessionId)) + 1;
  const id = randomUUID();
  const pkg = await repo.insertStatementPackage(pool, tenantId, id, {
    closeSessionId,
    version: nextVersion,
    inputHash,
    generatedBy: opts?.generatedBy,
    status: opts?.status ?? 'draft',
    engineVersion: ENGINE_VERSION,
    ruleVersionsSnapshot: opts?.ruleVersionsSnapshot,
    validationResults,
  });
  const lines = flattenToLines(id, result.balanceSheet, result.profitAndLoss, cashFlowStatement, equityStatement);
  for (const line of lines) {
    await repo.insertStatementLine(pool, {
      packageId: line.packageId,
      fsLineId: line.fsLineId,
      amount: line.amount,
      statement: line.statement,
      metadata: line.metadata,
    });
  }
  const previousPackages = await repo.listStatementPackagesByCloseSessionId(pool, tenantId, closeSessionId, 2);
  const prevPkg = previousPackages.length >= 2 ? previousPackages[1] : undefined;
  if (prevPkg) {
    const prevLines = await repo.listStatementLinesByPackageId(pool, prevPkg.id);
    const nextLines = await repo.listStatementLinesByPackageId(pool, id);
    const diff = computeDiff(prevLines, nextLines);
    await repo.upsertStatementDiff(pool, prevPkg.id, id, diff);
  }
  await clearStatementsStaleSince(pool, tenantId, closeSessionId);

  // Compute variances for period-over-period (after statement generation)
  const priorSessions = await listSessions(pool, { tenantId, entityId: session.entityId });
  const priorSession = priorSessions
    .filter((s) => (s.periodEnd as string) < session.periodEnd)
    .sort((a, b) => (b.periodEnd as string).localeCompare(a.periodEnd as string))[0];
  if (priorSession) {
    const priorPkgs = await repo.listStatementPackagesByCloseSessionId(pool, tenantId, priorSession.id, 1);
    const priorPkg = priorPkgs[0];
    if (priorPkg) {
      const priorLines = await repo.listStatementLinesByPackageId(pool, priorPkg.id);
      const currentLines = lines.map((l) => ({
        fsLineId: l.fsLineId,
        amount: l.amount,
        statement: l.statement,
        label: (l.metadata as { label?: string })?.label,
      }));
      const priorLinesInput = priorLines.map((l) => ({
        fsLineId: l.fsLineId,
        amount: l.amount,
        statement: l.statement,
        label: (l.metadata as { label?: string })?.label,
      }));
      await computeVariances(pool, {
        tenantId,
        closeSessionId,
        periodLabel,
        currentLines,
        priorLines: priorLinesInput,
      });
    }
  }

  await recordMaterialEvent(pool, {
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
      added.push({ fsLineId: key, amount: next.amount, statement: next.statement, metadata: next.metadata });
    } else if (Math.abs(prev.amount - next.amount) > 0.001) {
      changed.push({
        fsLineId: key,
        prevAmount: prev.amount,
        nextAmount: next.amount,
        statement: next.statement,
        metadata: next.metadata,
      });
    }
  }
  for (const [key, prev] of prevByKey) {
    if (!nextByKey.has(key)) {
      removed.push({ fsLineId: key, amount: prev.amount, statement: prev.statement, metadata: prev.metadata });
    }
  }
  return { added, removed, changed };
}

export async function getStatementPackage(pool: Pool, tenantId: string, id: string): Promise<StatementPackage | null> {
  return repo.getStatementPackageById(pool, tenantId, id);
}

export async function getStatementPackageWithLines(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<{ package: StatementPackage; lines: StatementLine[] } | null> {
  const pkg = await repo.getStatementPackageById(pool, tenantId, id);
  if (!pkg) return null;
  const lines = await repo.listStatementLinesByPackageId(pool, id);
  return { package: pkg, lines };
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
