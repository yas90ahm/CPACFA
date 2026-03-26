/**
 * Cumulative variance analysis: QTD/YTD variances comparing to prior year same period.
 * Informational only — does NOT gate certification (monthly variances do that).
 */

import type { Pool } from 'pg';
import type { StatementLine, CumulativePeriod } from '../types/statement_package.js';
import type { CloseSession } from '../types/close_session.js';
import { getSession, listSessions } from './close_session_service.js';
import { getEntitySettings } from './entity_settings_service.js';
import * as fiscal from './fiscal_calendar_service.js';
import * as repo from '../db/repositories/statement_package_repository.js';
import { from as decimalFrom, sumRound2 } from '../utils/decimal.js';

export type ComparisonType = 'prior_year_same_period' | 'sequential' | 'budget';

export interface CumulativeVarianceRecord {
  fsLineId: string;
  statement: string;
  label: string;
  currentAmount: string;
  priorAmount: string;
  changeAmount: string;
  changePercent: string | null;
  isMaterial: boolean;
  currentPeriodLabel: string;
  priorPeriodLabel: string;
}

export interface CumulativeVarianceResult {
  variances: CumulativeVarianceRecord[];
  currentPeriodLabel: string;
  priorPeriodLabel: string;
  comparisonType: ComparisonType;
  cumulativeType: CumulativePeriod;
  note: string;
}

/**
 * Compute cumulative variances: aggregate statement lines for the current cumulative period
 * and compare them to the equivalent period.
 */
export async function computeCumulativeVariances(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  cumulativeType: CumulativePeriod,
  comparisonType: ComparisonType = 'prior_year_same_period'
): Promise<CumulativeVarianceResult> {
  if (comparisonType === 'budget') {
    return {
      variances: [],
      currentPeriodLabel: '',
      priorPeriodLabel: '',
      comparisonType,
      cumulativeType,
      note: 'Budget comparison is not yet available.',
    };
  }

  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) throw new Error(`Close session not found: ${closeSessionId}`);

  const settings = await getEntitySettings(pool, tenantId, session.entityId);
  const fye: fiscal.FiscalYearEnd = { month: settings.fiscalYearEndMonth, day: settings.fiscalYearEndDay };
  const materialPct = Number(settings.varianceMaterialityPercent) || 10;

  const allSessions = await listSessions(pool, { tenantId, entityId: session.entityId });

  // Current period sessions
  const currentSessions = getSessionsForCumulativePeriod(allSessions, session.periodEnd, cumulativeType, fye);
  const currentLines = await aggregateStatementLines(pool, tenantId, currentSessions, cumulativeType);

  // Current period label
  let currentLabel: string;
  let priorLabel: string;

  if (cumulativeType === 'QTD') {
    const qi = fiscal.getQuarterForDate(session.periodEnd, fye);
    currentLabel = fiscal.formatQuarterLabel(qi.quarter, qi.fiscalYear);
  } else {
    const fy = fiscal.getFiscalYear(session.periodEnd, fye);
    currentLabel = fiscal.formatYTDLabel(fy);
  }

  // Prior period sessions
  let priorSessions: CloseSession[] = [];
  if (comparisonType === 'prior_year_same_period') {
    const priorYearEnd = shiftDateByYear(session.periodEnd, -1);
    priorSessions = getSessionsForCumulativePeriod(allSessions, priorYearEnd, cumulativeType, fye);
    if (cumulativeType === 'QTD') {
      const qi = fiscal.getQuarterForDate(priorYearEnd, fye);
      priorLabel = fiscal.formatQuarterLabel(qi.quarter, qi.fiscalYear);
    } else {
      const fy = fiscal.getFiscalYear(priorYearEnd, fye);
      priorLabel = fiscal.formatYTDLabel(fy);
    }
  } else {
    // sequential: prior quarter/period
    if (cumulativeType === 'QTD') {
      const priorQEnd = shiftDateByMonths(session.periodEnd, -3);
      priorSessions = getSessionsForCumulativePeriod(allSessions, priorQEnd, 'QTD', fye);
      const qi = fiscal.getQuarterForDate(priorQEnd, fye);
      priorLabel = fiscal.formatQuarterLabel(qi.quarter, qi.fiscalYear);
    } else {
      const priorYearEnd = shiftDateByYear(session.periodEnd, -1);
      priorSessions = getSessionsForCumulativePeriod(allSessions, priorYearEnd, 'YTD', fye);
      const fy = fiscal.getFiscalYear(priorYearEnd, fye);
      priorLabel = fiscal.formatYTDLabel(fy);
    }
  }

  const priorLines = priorSessions.length > 0
    ? await aggregateStatementLines(pool, tenantId, priorSessions, cumulativeType)
    : [];

  // Build variance records
  const priorByFs = new Map(priorLines.map((l) => [l.fsLineId, l]));
  const variances: CumulativeVarianceRecord[] = [];

  for (const line of currentLines) {
    // Skip header/zero rows
    if (line.indentLevel === 0 && !line.isSubtotal && !line.isGrandTotal) continue;

    const prior = priorByFs.get(line.fsLineId);
    const currentAmt = decimalFrom(line.amount).toDecimalPlaces(2);
    const priorAmt = decimalFrom(prior?.amount ?? 0).toDecimalPlaces(2);
    const change = currentAmt.minus(priorAmt).toDecimalPlaces(2);
    const changePct = priorAmt.isZero()
      ? null
      : change.div(priorAmt.abs()).times(100).toDecimalPlaces(2);

    const isMaterial = changePct !== null && changePct.abs().gte(materialPct);

    variances.push({
      fsLineId: line.fsLineId,
      statement: line.statement,
      label: (line.metadata as { label?: string })?.label ?? line.fsLineId,
      currentAmount: currentAmt.toString(),
      priorAmount: priorAmt.toString(),
      changeAmount: change.toString(),
      changePercent: changePct?.toString() ?? null,
      isMaterial,
      currentPeriodLabel: currentLabel,
      priorPeriodLabel: priorLabel,
    });
  }

  return {
    variances,
    currentPeriodLabel: currentLabel,
    priorPeriodLabel: priorLabel,
    comparisonType,
    cumulativeType,
    note: 'Cumulative variances are informational — monthly variances govern certification.',
  };
}

// ---- helpers ----

function getSessionsForCumulativePeriod(
  allSessions: CloseSession[],
  throughDate: string,
  cumulativeType: CumulativePeriod,
  fye: fiscal.FiscalYearEnd
): CloseSession[] {
  if (cumulativeType === 'QTD') {
    const qi = fiscal.getQuarterForDate(throughDate, fye);
    return allSessions
      .filter((s) => fiscal.periodFallsInQuarter(s.periodEnd, qi) && s.periodEnd <= throughDate)
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  } else {
    const ytdRange = fiscal.getYTDRange(throughDate, fye);
    return allSessions
      .filter((s) => fiscal.periodFallsInYTD(s.periodEnd, ytdRange) && s.periodEnd <= throughDate)
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  }
}

const FLOW_STATEMENTS = new Set(['profit_and_loss', 'cash_flow']);

async function aggregateStatementLines(
  pool: Pool,
  tenantId: string,
  sessions: CloseSession[],
  cumulativeType: CumulativePeriod
): Promise<StatementLine[]> {
  if (sessions.length === 0) return [];

  // Get lines for each session
  const allLines: Array<{ session: CloseSession; lines: StatementLine[] }> = [];
  for (const s of sessions) {
    const pkgs = await repo.listStatementPackagesByCloseSessionId(pool, tenantId, s.id, 1, 'standard');
    if (pkgs.length === 0) continue;
    const lines = await repo.listStatementLinesByPackageId(pool, pkgs[0].id);
    allLines.push({ session: s, lines });
  }

  if (allLines.length === 0) return [];
  if (allLines.length === 1) return allLines[0].lines;

  const latestLines = allLines[allLines.length - 1].lines;
  const result: StatementLine[] = [];

  for (const templateLine of latestLines) {
    if (templateLine.statement === 'balance_sheet') {
      result.push(templateLine);
    } else if (templateLine.statement === 'equity') {
      // Opening from first, closing from last, activity summed
      if (templateLine.fsLineId === 'eq_opening') {
        const firstLine = allLines[0].lines.find((l) => l.fsLineId === 'eq_opening');
        result.push({ ...templateLine, amount: firstLine?.amount ?? '0' });
      } else if (templateLine.fsLineId === 'eq_closing') {
        result.push(templateLine); // latest period's closing
      } else {
        const summed = String(sumRound2(allLines.map((p) => Number(p.lines.find((l) => l.fsLineId === templateLine.fsLineId)?.amount ?? 0))));
        result.push({ ...templateLine, amount: summed });
      }
    } else if (FLOW_STATEMENTS.has(templateLine.statement)) {
      const summed = String(sumRound2(allLines.map((p) => Number(p.lines.find((l) => l.fsLineId === templateLine.fsLineId)?.amount ?? 0))));
      result.push({ ...templateLine, amount: summed });
    } else {
      result.push(templateLine);
    }
  }

  return result;
}

function shiftDateByYear(dateStr: string, years: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y + years}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function shiftDateByMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  // End-of-month-aware month addition (avoids JS Date overflow, e.g. Jan 31 + 1 → Feb 28)
  const targetYear = date.getFullYear() + Math.floor((date.getMonth() + months) / 12);
  const targetMonth = (date.getMonth() + months) % 12;
  const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(date.getDate(), maxDay);
  const result = new Date(targetYear, targetMonth, clampedDay);
  const y = result.getFullYear();
  const m = String(result.getMonth() + 1).padStart(2, '0');
  const day = String(result.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
