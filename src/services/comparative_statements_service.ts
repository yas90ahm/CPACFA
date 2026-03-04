/**
 * Comparative statements: multi-column data for multi-period side-by-side views.
 * Returns statement line amounts across N prior periods for rendering in multi-column tables.
 */

import type { Pool } from 'pg';
import type { StatementLine } from '../types/statement_package.js';
import { getSession, listSessions } from './close_session_service.js';
import * as repo from '../db/repositories/statement_package_repository.js';
import { normalizeMoney } from '../utils/decimal.js';

export interface ComparativePeriodAmount {
  period: string;      // e.g. "Mar 2026", "Q1 2026"
  sessionId: string;
  amount: string;      // Decimal string
}

export interface ComparativeStatementLine {
  fsLineId: string;
  name: string;
  statement: string;
  displayOrder: number;
  indentLevel: number;
  isSubtotal: boolean;
  isGrandTotal: boolean;
  sectionName: string | null;
  amounts: ComparativePeriodAmount[];
}

function formatPeriodLabel(periodEnd: string): string {
  const d = new Date(periodEnd + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Get comparative statement lines: the current period plus N prior periods.
 * Returns each line with an array of amounts across the requested periods.
 */
export async function getComparativeStatementLines(
  pool: Pool,
  tenantId: string,
  packageId: string,
  comparativePeriods: number
): Promise<{ lines: ComparativeStatementLine[]; periods: string[] }> {
  // Get the current package
  const pkg = await repo.getStatementPackageById(pool, tenantId, packageId);
  if (!pkg) throw new Error('Statement package not found');

  const session = await getSession(pool, tenantId, pkg.closeSessionId);
  if (!session) throw new Error('Close session not found');

  // Get all sessions for this entity, sorted by period_end DESC
  const allSessions = await listSessions(pool, { tenantId, entityId: session.entityId });
  const sorted = allSessions
    .filter((s) => s.periodEnd <= session.periodEnd)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));

  // Get the N+1 most recent sessions (current + N prior)
  const sessionsToInclude = sorted.slice(0, comparativePeriods + 1);

  // Get lines for each session's latest standard package
  const periodLines: Array<{ sessionId: string; periodLabel: string; lines: StatementLine[] }> = [];
  for (const s of sessionsToInclude) {
    const pkgs = await repo.listStatementPackagesByCloseSessionId(pool, tenantId, s.id, 1, 'standard');
    if (pkgs.length === 0) continue;
    const lines = await repo.listStatementLinesByPackageId(pool, pkgs[0].id);
    periodLines.push({
      sessionId: s.id,
      periodLabel: formatPeriodLabel(s.periodEnd),
      lines,
    });
  }

  // Use the current period's line structure as the template
  const currentLines = await repo.listStatementLinesByPackageId(pool, packageId);

  const periods = periodLines.map((p) => p.periodLabel);

  const comparativeLines: ComparativeStatementLine[] = currentLines.map((line) => {
    const amounts = periodLines.map((p) => {
      const matchingLine = p.lines.find((l) => l.fsLineId === line.fsLineId);
      return {
        period: p.periodLabel,
        sessionId: p.sessionId,
        amount: normalizeMoney(matchingLine?.amount ?? 0),
      };
    });

    return {
      fsLineId: line.fsLineId,
      name: (line.metadata as { label?: string })?.label ?? line.fsLineId,
      statement: line.statement,
      displayOrder: line.displayOrder ?? 0,
      indentLevel: line.indentLevel ?? 0,
      isSubtotal: line.isSubtotal ?? false,
      isGrandTotal: line.isGrandTotal ?? false,
      sectionName: line.sectionName ?? null,
      amounts,
    };
  });

  return { lines: comparativeLines, periods };
}
