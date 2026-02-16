/**
 * Trial balance roll-up: aggregate monthly unadjusted TBs into quarter or year.
 * Used when viewing close workspace for YYYY-Qn or YYYY and no direct TB exists for that period.
 */

import type { Pool } from 'pg';
import type { TrialBalanceEntry } from '../types/financial.js';
import { getConstituentMonthLabels } from './close_context.js';
import { getUnadjusted } from './trial_balance_store_service.js';

export interface UnadjustedRollupResult {
  entries: TrialBalanceEntry[];
  source: 'rollup';
  constituentPeriods: string[];
  at?: string;
  by?: string;
}

/**
 * Get unadjusted trial balance for a period. If period is quarter or year and no direct TB exists,
 * returns roll-up from constituent months. Otherwise returns null (caller should use getUnadjusted).
 */
export async function getUnadjustedOrRollup(
  tenantId: string,
  periodLabel: string,
  pool?: Pool
): Promise<UnadjustedRollupResult | { entries: TrialBalanceEntry[]; source: 'uploaded' | 'synced' | 'gl_derived'; at?: string; by?: string; connectionId?: string; fileName?: string; constituentPeriods?: never } | null> {
  const direct = await getUnadjusted(tenantId, periodLabel, pool);
  if (direct) {
    return {
      entries: direct.entries,
      source: direct.source,
      at: direct.at,
      by: direct.by,
      ...(direct.connectionId ? { connectionId: direct.connectionId } : {}),
      ...(direct.fileName ? { fileName: direct.fileName } : {}),
    };
  }
  const monthLabels = getConstituentMonthLabels(periodLabel);
  if (!monthLabels || monthLabels.length <= 1) return null;
  const records = await Promise.all(
    monthLabels.map((label) => getUnadjusted(tenantId, label, pool))
  );
  const nonNull = records.filter((r): r is NonNullable<typeof r> => r != null);
  if (nonNull.length === 0) return null;
  const aggregated = aggregateEntries(nonNull.map((r) => r.entries));
  const lastAt = nonNull.map((r) => r.at).filter(Boolean).pop();
  const lastBy = nonNull.map((r) => r.by).filter(Boolean).pop();
  return {
    entries: aggregated,
    source: 'rollup',
    constituentPeriods: monthLabels,
    at: lastAt ?? undefined,
    by: lastBy ?? undefined,
  };
}

function aggregateEntries(entriesArrays: TrialBalanceEntry[][]): TrialBalanceEntry[] {
  const byKey = new Map<string, { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: TrialBalanceEntry['accountType'] }>();
  for (const entries of entriesArrays) {
    for (const e of entries) {
      const key = [e.accountCode ?? '', e.accountName].join('\0');
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          accountCode: e.accountCode,
          accountName: e.accountName,
          debit: e.debit ?? 0,
          credit: e.credit ?? 0,
          accountType: e.accountType,
        });
      } else {
        existing.debit += e.debit ?? 0;
        existing.credit += e.credit ?? 0;
      }
    }
  }
  return Array.from(byKey.values())
    .filter((row) => row.debit !== 0 || row.credit !== 0)
    .sort((a, b) => a.accountName.localeCompare(b.accountName))
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      debit: row.debit,
      credit: row.credit,
      accountType: row.accountType,
    })) as TrialBalanceEntry[];
}
