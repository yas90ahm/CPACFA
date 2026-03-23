/**
 * Cumulative (QTD / YTD) statement generation.
 * Derives cumulative financials from individually certified monthly close sessions.
 * Flow statements (P&L, CF) are summed; point-in-time statements (BS) use latest period only.
 * Equity: beginning = first period opening, activity = summed, ending = last period closing.
 */

import { randomUUID, createHash } from 'crypto';
import type { Pool } from 'pg';
import type { StatementPackage, StatementLine, CumulativePeriod, ValidationResult } from '../types/statement_package.js';
import type { CloseSession } from '../types/close_session.js';
import { getSession, listSessions } from './close_session_service.js';
import { getEntitySettings } from './entity_settings_service.js';
import * as fiscal from './fiscal_calendar_service.js';
import * as repo from '../db/repositories/statement_package_repository.js';
import { withTransaction } from '../db/transaction.js';
import { from as decimalFrom, sumRound2 } from '../utils/decimal.js';
import { recordMaterialEvent } from './audit_service.js';

const ENGINE_VERSION = 'cumulativeStatements.v1';

export interface CumulativeGenerateInput {
  cumulativeType: CumulativePeriod;
  throughPeriodEnd: string; // YYYY-MM-DD
}

export interface CumulativePeriodsResult {
  qtd: { available: boolean; quarter: number; fiscalYear: number; periods: Array<{ sessionId: string; label: string; status: string }> } | null;
  ytd: { available: boolean; fiscalYear: number; periods: Array<{ sessionId: string; label: string; status: string }> } | null;
}

/** Format month label from a YYYY-MM-DD date. */
function monthLabel(periodEnd: string): string {
  const d = new Date(periodEnd + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Check which QTD and YTD views are available for a session. */
export async function getCumulativePeriods(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<CumulativePeriodsResult> {
  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) throw new Error(`Close session not found: ${closeSessionId}`);

  const settings = await getEntitySettings(pool, tenantId, session.entityId);
  const fye: fiscal.FiscalYearEnd = { month: settings.fiscalYearEndMonth, day: settings.fiscalYearEndDay };

  const allSessions = await listSessions(pool, { tenantId, entityId: session.entityId });

  // QTD
  const quarterInfo = fiscal.getQuarterForDate(session.periodEnd, fye);
  const qtdSessions = allSessions
    .filter((s) => fiscal.periodFallsInQuarter(s.periodEnd, quarterInfo))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  const qtdPeriods = qtdSessions.map((s) => ({
    sessionId: s.id,
    label: monthLabel(s.periodEnd),
    status: s.status,
  }));

  // YTD
  const ytdRange = fiscal.getYTDRange(session.periodEnd, fye);
  const ytdSessions = allSessions
    .filter((s) => fiscal.periodFallsInYTD(s.periodEnd, ytdRange))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  const ytdPeriods = ytdSessions.map((s) => ({
    sessionId: s.id,
    label: monthLabel(s.periodEnd),
    status: s.status,
  }));

  return {
    qtd: {
      available: qtdPeriods.length > 0,
      quarter: quarterInfo.quarter,
      fiscalYear: quarterInfo.fiscalYear,
      periods: qtdPeriods,
    },
    ytd: {
      available: ytdPeriods.length > 0,
      fiscalYear: ytdRange.fiscalYear,
      periods: ytdPeriods,
    },
  };
}

/**
 * Generate a cumulative statement package (QTD or YTD).
 * Rules:
 *  - All included sessions must be CERTIFIED or LOCKED.
 *  - Flow statements (P&L, CF) are summed across periods.
 *  - BS uses only the latest period.
 *  - Equity: opening from first period, activity summed, closing from last.
 *  - Cross-statement validation runs on the cumulative result.
 *  - Package stored with packageType='cumulative'.
 */
export async function generateCumulativeStatements(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  input: CumulativeGenerateInput,
  opts?: { generatedBy?: string }
): Promise<StatementPackage> {
  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) throw new Error(`Close session not found: ${closeSessionId}`);

  const settings = await getEntitySettings(pool, tenantId, session.entityId);
  const fye: fiscal.FiscalYearEnd = { month: settings.fiscalYearEndMonth, day: settings.fiscalYearEndDay };

  const allSessions = await listSessions(pool, { tenantId, entityId: session.entityId });

  // Find sessions in the cumulative range
  let includedSessions: CloseSession[];
  let periodDescription: string;

  if (input.cumulativeType === 'QTD') {
    const quarterInfo = fiscal.getQuarterForDate(input.throughPeriodEnd, fye);
    includedSessions = allSessions
      .filter((s) => fiscal.periodFallsInQuarter(s.periodEnd, quarterInfo))
      .filter((s) => s.periodEnd <= input.throughPeriodEnd)
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    periodDescription = `Q${quarterInfo.quarter} ${quarterInfo.fiscalYear}`;
  } else {
    const ytdRange = fiscal.getYTDRange(input.throughPeriodEnd, fye);
    includedSessions = allSessions
      .filter((s) => fiscal.periodFallsInYTD(s.periodEnd, ytdRange))
      .filter((s) => s.periodEnd <= input.throughPeriodEnd)
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    periodDescription = `YTD ${ytdRange.fiscalYear}`;
  }

  if (includedSessions.length === 0) {
    throw new Error(`Cannot generate ${input.cumulativeType} cumulative statements — no close sessions found in the range.`);
  }

  // Validate all sessions are CERTIFIED or LOCKED
  for (const s of includedSessions) {
    if (s.status !== 'certified' && s.status !== 'locked') {
      throw new Error(
        `Cannot generate ${periodDescription} cumulative statements — ${monthLabel(s.periodEnd)} is not yet certified.`
      );
    }
  }

  // Gather statement lines from each included session's latest package
  const periodPackageLines: Array<{ session: CloseSession; lines: StatementLine[] }> = [];
  for (const s of includedSessions) {
    const pkgs = await repo.listStatementPackagesByCloseSessionId(pool, tenantId, s.id, 1);
    if (pkgs.length === 0) {
      throw new Error(`Cannot generate ${periodDescription} cumulative statements — no statement package found for ${monthLabel(s.periodEnd)}.`);
    }
    const lines = await repo.listStatementLinesByPackageId(pool, pkgs[0].id);
    periodPackageLines.push({ session: s, lines });
  }

  // Build cumulative lines
  const cumulativeLines = buildCumulativeLines(periodPackageLines, input.cumulativeType);

  // Run cross-statement validation on the cumulative result
  const validationResults = runCumulativeValidation(cumulativeLines);

  // Build note
  const periodLabels = includedSessions.map((s) => monthLabel(s.periodEnd)).join(', ');
  const cumulativeNote = `Derived from certified monthly periods: ${periodLabels}.`;

  // Compute deterministic input hash
  const inputHash = createHash('sha256')
    .update(JSON.stringify({
      closeSessionId,
      cumulativeType: input.cumulativeType,
      throughPeriodEnd: input.throughPeriodEnd,
      includedSessionIds: includedSessions.map((s) => s.id),
    }))
    .digest('hex');

  // Store the cumulative package
  const pkg = await withTransaction(pool, async (client) => {
    const tx = client as unknown as Pool;
    const nextVersion = (await repo.getMaxVersionByCloseSessionId(tx, tenantId, closeSessionId)) + 1;
    const id = randomUUID();

    // Insert package with cumulative columns
    await tx.query(
      `INSERT INTO statement_packages
        (id, close_session_id, version, input_hash, generated_by, status, engine_version, validation_results,
         package_type, cumulative_period, cumulative_note, included_session_ids)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, 'cumulative', $8, $9, $10)`,
      [
        id,
        closeSessionId,
        nextVersion,
        inputHash,
        opts?.generatedBy ?? null,
        ENGINE_VERSION,
        validationResults.length > 0 ? JSON.stringify(validationResults) : null,
        input.cumulativeType,
        cumulativeNote,
        includedSessions.map((s) => s.id),
      ]
    );

    // Insert lines
    for (const line of cumulativeLines) {
      await repo.insertStatementLine(tx, {
        packageId: id,
        fsLineId: line.fsLineId,
        amount: Number(line.amount),
        statement: line.statement,
        metadata: line.metadata,
        displayOrder: line.displayOrder,
        indentLevel: line.indentLevel,
        isSubtotal: line.isSubtotal,
        isGrandTotal: line.isGrandTotal,
        sectionName: line.sectionName,
      });
    }

    await recordMaterialEvent(tx, {
      tenantId,
      periodLabel: periodDescription,
      eventType: 'statement_package_generation',
      deterministicFlagSnapshot: {
        packageId: id,
        closeSessionId,
        version: nextVersion,
        cumulativeType: input.cumulativeType,
        throughPeriodEnd: input.throughPeriodEnd,
        includedPeriods: includedSessions.map((s) => s.periodEnd),
        lineCount: cumulativeLines.length,
      },
      createdBy: opts?.generatedBy,
    });

    // Fetch the package back to return
    const created = await repo.getStatementPackageById(tx, tenantId, id);
    if (!created) throw new Error('Failed to fetch cumulative package after insert');
    return created;
  });

  return pkg;
}

// ---- line accumulation logic ----

const FLOW_STATEMENTS = new Set(['profit_and_loss', 'cash_flow']);
const POINT_IN_TIME_STATEMENTS = new Set(['balance_sheet']);

function buildCumulativeLines(
  periodPackageLines: Array<{ session: CloseSession; lines: StatementLine[] }>,
  cumulativeType: CumulativePeriod
): StatementLine[] {
  if (periodPackageLines.length === 0) return [];
  if (periodPackageLines.length === 1) {
    // Single period — just return as-is
    return periodPackageLines[0].lines.map((l) => ({ ...l, packageId: '__cumulative__' }));
  }

  const latestPeriod = periodPackageLines[periodPackageLines.length - 1];
  const firstPeriod = periodPackageLines[0];

  // Use the latest period's line structure as the template
  const templateLines = latestPeriod.lines;
  const result: StatementLine[] = [];

  for (const templateLine of templateLines) {
    if (POINT_IN_TIME_STATEMENTS.has(templateLine.statement)) {
      // Balance Sheet: use latest period only
      result.push({ ...templateLine, packageId: '__cumulative__' });
    } else if (templateLine.statement === 'equity') {
      // Equity: special handling
      result.push(buildCumulativeEquityLine(templateLine, periodPackageLines));
    } else if (FLOW_STATEMENTS.has(templateLine.statement)) {
      // P&L and CF: sum across all periods
      const summed = sumLineAcrossPeriods(templateLine.fsLineId, periodPackageLines);
      result.push({
        ...templateLine,
        packageId: '__cumulative__',
        amount: summed,
      });
    } else {
      result.push({ ...templateLine, packageId: '__cumulative__' });
    }
  }

  return result;
}

function sumLineAcrossPeriods(
  fsLineId: string,
  periodPackageLines: Array<{ session: CloseSession; lines: StatementLine[] }>
): string {
  const amounts = periodPackageLines.map((p) => {
    const line = p.lines.find((l) => l.fsLineId === fsLineId);
    return Number(line?.amount ?? 0);
  });
  return String(sumRound2(amounts));
}

function buildCumulativeEquityLine(
  templateLine: StatementLine,
  periodPackageLines: Array<{ session: CloseSession; lines: StatementLine[] }>
): StatementLine {
  const firstPeriod = periodPackageLines[0];
  const latestPeriod = periodPackageLines[periodPackageLines.length - 1];

  // Opening equity = first period's opening
  if (templateLine.fsLineId === 'eq_opening') {
    const firstLine = firstPeriod.lines.find((l) => l.fsLineId === 'eq_opening');
    return { ...templateLine, packageId: '__cumulative__', amount: firstLine?.amount ?? '0' };
  }

  // Closing equity = latest period's closing
  if (templateLine.fsLineId === 'eq_closing') {
    const latestLine = latestPeriod.lines.find((l) => l.fsLineId === 'eq_closing');
    return { ...templateLine, packageId: '__cumulative__', amount: latestLine?.amount ?? '0' };
  }

  // Activity lines (changes, OCI): sum across all periods
  const summed = sumLineAcrossPeriods(templateLine.fsLineId, periodPackageLines);
  return { ...templateLine, packageId: '__cumulative__', amount: summed };
}

// ---- cumulative validation ----

function runCumulativeValidation(lines: StatementLine[]): ValidationResult[] {
  const results: ValidationResult[] = [];
  const d = (n: number) => decimalFrom(n).toDecimalPlaces(2);

  // A = L + E
  const totalAssets = Number(lines.find((l) => l.fsLineId === 'bs_total_assets')?.amount ?? 0);
  const totalLiabilities = Number(lines.find((l) => l.fsLineId === 'bs_total_liabilities')?.amount ?? 0);
  const totalEquityLine = Number(lines.find((l) => l.fsLineId === 'bs_total_equity')?.amount ?? 0);
  const aleCheck = d(totalAssets).equals(d(totalLiabilities).plus(d(totalEquityLine)));
  results.push({
    check: 'balance_sheet_equation',
    passed: aleCheck,
    message: aleCheck ? undefined : `Assets ${totalAssets} != Liabilities ${totalLiabilities} + Equity ${totalEquityLine}`,
  });

  // Net income tie (IS → Equity)
  const isNetIncome = Number(lines.find((l) => l.fsLineId === 'pl_net_income')?.amount ?? 0);
  const eqNetIncome = lines.filter((l) => l.statement === 'equity' && /net income/i.test((l.metadata as { label?: string })?.label ?? '')).reduce((s, l) => d(s).plus(d(l.amount)).toNumber(), 0);
  const netIncomeTie = d(isNetIncome).equals(d(eqNetIncome || isNetIncome));
  results.push({
    check: 'net_income_tie',
    passed: netIncomeTie,
    message: netIncomeTie ? undefined : `IS net income ${isNetIncome} != equity net income ${eqNetIncome}`,
  });

  // Cash tie (CF ending → BS cash)
  const cfEndingCash = Number(lines.find((l) => l.fsLineId === 'cf_ending_cash')?.amount ?? 0);
  const bsCashLines = lines.filter(
    (l) => l.statement === 'balance_sheet' && /cash|bank/i.test((l.metadata as { label?: string })?.label ?? '')
  );
  const bsCash = sumRound2(bsCashLines.map((l) => Number(l.amount)));
  const cashTie = d(cfEndingCash).equals(d(bsCash));
  results.push({
    check: 'cash_tie',
    passed: cashTie,
    message: cashTie ? undefined : `CF ending cash ${cfEndingCash} != BS cash ${bsCash}`,
  });

  // Equity tie
  const eqClosing = Number(lines.find((l) => l.fsLineId === 'eq_closing')?.amount ?? totalEquityLine);
  const eqTie = d(eqClosing).equals(d(totalEquityLine));
  results.push({
    check: 'equity_tie',
    passed: eqTie,
    message: eqTie ? undefined : `Equity closing ${eqClosing} != BS total equity ${totalEquityLine}`,
  });

  return results;
}
