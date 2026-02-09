/**
 * Versioned statement packages: generateStatements(close_session_id) creates new package version deterministically;
 * computeDiff(prev, next) produces diff_json. Store classifier/mapping rule versions for traceability.
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import type { Pool } from 'pg';
import type { TrialBalanceResult } from '../types/financial.js';
import type { StatementPackage, StatementLine, StatementDiffJson } from '../types/statement_package.js';
import { buildValidatedStatements, MathematicalIntegrityError } from './financialStatements.js';
import { getAdjustedTrialBalance } from './adjusted_trial_balance_service.js';
import { getSession } from './close_session_service.js';
import { recordMaterialEvent } from './audit_ledger_service.js';
import * as repo from '../db/repositories/statement_package_repository.js';

const ENGINE_VERSION = 'financialStatements.v1';

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

/** Flatten balance sheet and P&L to statement lines with stable fs_line_id. */
function flattenToLines(
  packageId: string,
  balanceSheet: { assets: { label: string; amount: number }[]; liabilities: { label: string; amount: number }[]; equity: { label: string; amount: number }[] },
  profitAndLoss: { revenue: { label: string; amount: number }[]; expenses: { label: string; amount: number }[] }
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
  });
  const lines = flattenToLines(id, result.balanceSheet, result.profitAndLoss);
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
