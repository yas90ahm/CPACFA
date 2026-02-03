/**
 * Close context — single type and loader for prior-period data used in comparative reporting.
 * Loads prior snapshot from KPI history when priorPeriodLabel is set; prior trial balance
 * must be supplied by the caller (no TB-by-period store) or parsed from request.
 */

import type { Pool } from 'pg';
import type { TrialBalanceResult } from '../types/financial.js';
import type { KPISnapshot } from '../types/kpi_history.js';
import * as kpiRepo from '../db/repositories/kpi_history_repository.js';

export interface CloseContext {
  entityId: string;
  currentPeriodLabel: string;
  priorPeriodLabel?: string;
  priorTrialBalance?: TrialBalanceResult;
  priorSnapshot?: KPISnapshot;
}

export interface LoadCloseContextInput {
  pool: Pool;
  tenantId: string;
  entityId: string;
  currentPeriodLabel: string;
  priorPeriodLabel?: string;
  priorTrialBalance?: TrialBalanceResult;
}

/**
 * Load close context: when priorPeriodLabel is set, loads prior snapshot from KPI history.
 * priorTrialBalance is taken from input (caller must supply; no TB-by-period store).
 */
export async function loadCloseContext(input: LoadCloseContextInput): Promise<CloseContext> {
  const { pool, tenantId, entityId, currentPeriodLabel, priorPeriodLabel, priorTrialBalance } = input;
  let priorSnapshot: KPISnapshot | undefined;
  if (priorPeriodLabel) {
    const list = await kpiRepo.list(pool, tenantId, { periodLabel: priorPeriodLabel, limit: 1 });
    if (list.length > 0) priorSnapshot = list[0];
  }
  return {
    entityId,
    currentPeriodLabel,
    priorPeriodLabel,
    priorTrialBalance,
    priorSnapshot,
  };
}

/**
 * Parse period label to a comparable number (year * 12 + month/quarter offset).
 * Supports YYYY-Qn, YYYY-MM, YYYY. Returns null if unparseable.
 */
function parsePeriodToComparable(label: string): number | null {
  const trimmed = label.trim();
  const qMatch = trimmed.match(/^(\d{4})[-]?Q([1-4])$/i);
  if (qMatch) {
    const y = parseInt(qMatch[1]!, 10);
    const q = parseInt(qMatch[2]!, 10);
    return y * 12 + (q - 1) * 3; // quarter to month offset
  }
  const mMatch = trimmed.match(/^(\d{4})[-](\d{1,2})$/);
  if (mMatch) {
    const y = parseInt(mMatch[1]!, 10);
    const m = parseInt(mMatch[2]!, 10);
    if (m >= 1 && m <= 12) return y * 12 + m;
  }
  const yMatch = trimmed.match(/^(\d{4})$/);
  if (yMatch) return parseInt(yMatch[1]!, 10) * 12;
  return null;
}

/**
 * Get period end date (ISO YYYY-MM-DD) for a period label.
 * Supports YYYY-MM (last day of month), YYYY-Q1..Q4 (last day of quarter), YYYY or FYyyyy (12-31).
 */
export function getPeriodEndDate(periodLabel: string): string {
  const trimmed = periodLabel.trim();
  const qMatch = trimmed.match(/^(\d{4})[-]?Q([1-4])$/i);
  if (qMatch) {
    const y = parseInt(qMatch[1]!, 10);
    const q = parseInt(qMatch[2]!, 10);
    const lastMonth = q * 3;
    const lastDay = new Date(y, lastMonth, 0).getDate();
    return `${y}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  const mMatch = trimmed.match(/^(\d{4})[-](\d{1,2})$/);
  if (mMatch) {
    const y = parseInt(mMatch[1]!, 10);
    const m = parseInt(mMatch[2]!, 10);
    if (m >= 1 && m <= 12) {
      const lastDay = new Date(y, m, 0).getDate();
      return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }
  const yMatch = trimmed.match(/^FY?(\d{4})$/i) ?? trimmed.match(/^(\d{4})$/);
  if (yMatch) {
    const y = parseInt(yMatch[1]!, 10);
    return `${y}-12-31`;
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get constituent month labels (YYYY-MM) for a period, for roll-up.
 * YYYY-MM -> [YYYY-MM]; YYYY-Q1..Q4 -> [YYYY-01, YYYY-02, YYYY-03], etc.; YYYY/FYyyyy -> [YYYY-01..YYYY-12].
 * Returns null if not a roll-up period (e.g. unparseable).
 */
export function getConstituentMonthLabels(periodLabel: string): string[] | null {
  const trimmed = periodLabel.trim();
  const qMatch = trimmed.match(/^(\d{4})[-]?Q([1-4])$/i);
  if (qMatch) {
    const y = parseInt(qMatch[1]!, 10);
    const q = parseInt(qMatch[2]!, 10);
    const startMonth = (q - 1) * 3 + 1;
    const labels: string[] = [];
    for (let m = startMonth; m < startMonth + 3; m++) {
      labels.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return labels;
  }
  const yMatch = trimmed.match(/^FY?(\d{4})$/i) ?? trimmed.match(/^(\d{4})$/);
  if (yMatch) {
    const y = parseInt(yMatch[1]!, 10);
    const labels: string[] = [];
    for (let m = 1; m <= 12; m++) {
      labels.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return labels;
  }
  const mMatch = trimmed.match(/^(\d{4})[-](\d{1,2})$/);
  if (mMatch) {
    const y = parseInt(mMatch[1]!, 10);
    const m = parseInt(mMatch[2]!, 10);
    if (m >= 1 && m <= 12) return [`${y}-${String(m).padStart(2, '0')}`];
  }
  return null;
}

/**
 * Returns true if priorPeriodLabel is temporally before currentPeriodLabel.
 * Used to prevent look-ahead (e.g. prior 2024-Q4 vs current 2024-Q1). If unparseable, returns false (reject).
 */
export function isPriorPeriodBeforeCurrent(
  priorPeriodLabel: string,
  currentPeriodLabel: string
): boolean {
  const prior = parsePeriodToComparable(priorPeriodLabel);
  const current = parsePeriodToComparable(currentPeriodLabel);
  if (prior == null || current == null) return false;
  return prior < current;
}

/**
 * Require prior period for comparison: when priorPeriodLabel is set but prior data is missing,
 * returns an error message for 400 response.
 */
export function requirePriorPeriodForComparison(
  priorPeriodLabel: string | undefined,
  priorTrialBalance: TrialBalanceResult | undefined,
  priorLines?: { label: string; amount: number }[]
): string | null {
  if (!priorPeriodLabel) return null;
  if (priorTrialBalance != null) return null;
  if (priorLines != null && priorLines.length > 0) return null;
  return 'Prior period data required. Provide prior trial balance (prior_entries) or prior lines for comparison.';
}
