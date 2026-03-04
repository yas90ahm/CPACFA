/**
 * Board package service: aggregates financial statements, variances, metrics,
 * and certification data into a structured JSON package for board reporting.
 */

import type { Pool } from 'pg';
import type { StatementLine, CumulativePeriod } from '../types/statement_package.js';
import { getSession } from './close_session_service.js';
import { getEntitySettings } from './entity_settings_service.js';
import * as stmtRepo from '../db/repositories/statement_package_repository.js';
import * as varianceRepo from '../db/repositories/variance_analysis_repository.js';
import { generateCumulativeStatements, type CumulativeGenerateInput } from './cumulative_statement_service.js';
import { normalizeMoney, from as decimalFrom, sumRound2 } from '../utils/decimal.js';

export type BoardPackagePeriodType = 'monthly' | 'QTD' | 'YTD';

export interface BoardPackageMetric {
  label: string;
  value: string;
  format: 'money' | 'percent' | 'text';
}

export interface BoardPackageVariance {
  lineItem: string;
  statement: string;
  currentAmount: string;
  priorAmount: string;
  changeAmount: string;
  changePercent: string | null;
  explanation: string | null;
}

export interface BoardPackage {
  entityName: string;
  periodType: BoardPackagePeriodType;
  periodLabel: string;
  periodEndDisplay: string;
  generatedAt: string;
  certificationStatus: string;
  certifiedBy: string | null;
  certifiedAt: string | null;
  preparerName: string | null;
  statements: {
    incomeStatement: Array<{ name: string; amount: string; isSubtotal: boolean; isGrandTotal: boolean; indentLevel: number; sectionName: string | null }>;
    balanceSheet: Array<{ name: string; amount: string; isSubtotal: boolean; isGrandTotal: boolean; indentLevel: number; sectionName: string | null }>;
    cashFlow: Array<{ name: string; amount: string; isSubtotal: boolean; isGrandTotal: boolean; indentLevel: number; sectionName: string | null }>;
    equity: Array<{ name: string; amount: string; isSubtotal: boolean; isGrandTotal: boolean; indentLevel: number; sectionName: string | null }>;
  };
  keyMetrics: BoardPackageMetric[];
  materialVariances: BoardPackageVariance[];
  validationResults: Array<{ check: string; passed: boolean; message?: string }>;
  cumulativeNote: string | null;
}

function formatLine(l: StatementLine): { name: string; amount: string; isSubtotal: boolean; isGrandTotal: boolean; indentLevel: number; sectionName: string | null } {
  return {
    name: (l.metadata as { label?: string })?.label ?? l.fsLineId,
    amount: normalizeMoney(l.amount),
    isSubtotal: l.isSubtotal ?? false,
    isGrandTotal: l.isGrandTotal ?? false,
    indentLevel: l.indentLevel ?? 0,
    sectionName: l.sectionName ?? null,
  };
}

function formatPeriodEnd(periodEnd: string): string {
  const d = new Date(periodEnd + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Build a structured board package for the given session and period type.
 */
export async function buildBoardPackage(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  periodType: BoardPackagePeriodType
): Promise<BoardPackage> {
  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) throw new Error(`Close session not found: ${closeSessionId}`);

  const settings = await getEntitySettings(pool, tenantId, session.entityId);

  // Get the statement package (cumulative or standard)
  let lines: StatementLine[];
  let cumulativeNote: string | null = null;
  let periodLabel: string;
  let periodEndDisplay: string;

  if (periodType === 'monthly') {
    const pkgs = await stmtRepo.listStatementPackagesByCloseSessionId(pool, tenantId, closeSessionId, 1, 'standard');
    if (pkgs.length === 0) throw new Error('No statement package found. Generate statements first.');
    lines = await stmtRepo.listStatementLinesByPackageId(pool, pkgs[0].id);
    periodLabel = session.periodEnd.slice(0, 7);
    periodEndDisplay = formatPeriodEnd(session.periodEnd);
  } else {
    // Generate or fetch cumulative package
    const cumulativePkgs = await stmtRepo.listStatementPackagesByCloseSessionId(pool, tenantId, closeSessionId, 1, 'cumulative');
    let cumulativePkg = cumulativePkgs.find((p) => p.cumulativePeriod === periodType);

    if (!cumulativePkg) {
      // Generate on the fly
      cumulativePkg = await generateCumulativeStatements(pool, tenantId, closeSessionId, {
        cumulativeType: periodType as CumulativePeriod,
        throughPeriodEnd: session.periodEnd,
      });
    }

    lines = await stmtRepo.listStatementLinesByPackageId(pool, cumulativePkg.id);
    cumulativeNote = cumulativePkg.cumulativeNote ?? null;
    periodLabel = `${periodType} through ${session.periodEnd}`;
    if (periodType === 'QTD') {
      periodEndDisplay = `For the Quarter Ended ${formatPeriodEnd(session.periodEnd)}`;
    } else {
      periodEndDisplay = `For the Year Ended ${formatPeriodEnd(session.periodEnd)}`;
    }
  }

  // Split lines by statement type
  const is = lines.filter((l) => l.statement === 'profit_and_loss');
  const bs = lines.filter((l) => l.statement === 'balance_sheet');
  const cf = lines.filter((l) => l.statement === 'cash_flow');
  const eq = lines.filter((l) => l.statement === 'equity');

  // Key metrics
  const revenue = is.find((l) => l.isSubtotal && /total revenue/i.test((l.metadata as { label?: string })?.label ?? ''));
  const netIncome = is.find((l) => l.isGrandTotal && /net income/i.test((l.metadata as { label?: string })?.label ?? ''));
  const totalAssets = bs.find((l) => l.isGrandTotal && l.fsLineId === 'bs_total_assets');
  const totalExpenses = is.find((l) => l.isSubtotal && /total expenses/i.test((l.metadata as { label?: string })?.label ?? ''));
  const endingCash = cf.find((l) => l.fsLineId === 'cf_ending_cash');

  const revenueAmt = revenue?.amount ?? 0;
  const expensesAmt = totalExpenses?.amount ?? 0;
  const netIncomeAmt = netIncome?.amount ?? 0;

  const grossMarginPct = revenueAmt !== 0
    ? decimalFrom(revenueAmt).minus(expensesAmt).div(decimalFrom(revenueAmt)).times(100).toDecimalPlaces(1).toString()
    : '0.0';
  const operatingMarginPct = revenueAmt !== 0
    ? decimalFrom(netIncomeAmt).div(decimalFrom(revenueAmt)).times(100).toDecimalPlaces(1).toString()
    : '0.0';

  const keyMetrics: BoardPackageMetric[] = [
    { label: 'Revenue', value: normalizeMoney(revenueAmt), format: 'money' },
    { label: 'Net Income', value: normalizeMoney(netIncomeAmt), format: 'money' },
    { label: 'Gross Margin %', value: `${grossMarginPct}%`, format: 'percent' },
    { label: 'Operating Margin %', value: `${operatingMarginPct}%`, format: 'percent' },
    { label: 'Cash Position', value: normalizeMoney(endingCash?.amount ?? 0), format: 'money' },
  ];

  // Material variances with explanations
  const variances = await varianceRepo.listVariancesForSession(pool, tenantId, closeSessionId);
  const materialVariances: BoardPackageVariance[] = variances
    .filter((v) => {
      const pct = v.changePercentage != null ? Math.abs(v.changePercentage) : 0;
      const threshold = v.materialThresholdPct ?? 5;
      return pct >= threshold;
    })
    .map((v) => ({
      lineItem: v.label ?? v.fsLineId,
      statement: v.statement,
      currentAmount: normalizeMoney(v.currentAmount),
      priorAmount: normalizeMoney(v.priorAmount),
      changeAmount: normalizeMoney(v.changeAmount),
      changePercent: v.changePercentage != null ? decimalFrom(v.changePercentage).toDecimalPlaces(1).toString() : null,
      explanation: v.explanation ?? null,
    }));

  // Validation results from the latest standard package
  const stdPkgs = await stmtRepo.listStatementPackagesByCloseSessionId(pool, tenantId, closeSessionId, 1, 'standard');
  const validationResults = stdPkgs[0]?.validationResults ?? [];

  return {
    entityName: settings.entityName || session.entityId,
    periodType,
    periodLabel,
    periodEndDisplay,
    generatedAt: new Date().toISOString(),
    certificationStatus: session.status,
    certifiedBy: session.certifiedBy ?? null,
    certifiedAt: session.certifiedAt ?? null,
    preparerName: null, // Could be derived from audit trail
    statements: {
      incomeStatement: is.map(formatLine),
      balanceSheet: bs.map(formatLine),
      cashFlow: cf.map(formatLine),
      equity: eq.map(formatLine),
    },
    keyMetrics,
    materialVariances,
    validationResults,
    cumulativeNote,
  };
}
