/**
 * Adjusted trial balance = unadjusted + posted close adjustments per period.
 * All period-based statement generation uses this.
 */

import type { Pool } from 'pg';
import type { TrialBalanceEntry } from '../types/financial.js';
import type { CloseAdjustment } from '../types/close_and_controls.js';
import { getUnadjustedOrRollup } from './trial_balance_rollup_service.js';
import { listAdjustments } from './close_adjustments_service.js';

function accountKey(entry: { accountCode?: string; accountName: string }): string {
  return (entry.accountCode ?? entry.accountName ?? '').trim() || entry.accountName;
}

/**
 * Get adjusted trial balance for a period: unadjusted TB (or roll-up from months) + all posted adjustments.
 * Throws if no unadjusted TB for period (caller may 404).
 */
export async function getAdjustedTrialBalance(
  tenantId: string,
  periodLabel: string,
  pool: Pool | undefined
): Promise<TrialBalanceEntry[]> {
  const result = await getUnadjustedOrRollup(tenantId, periodLabel, pool);
  if (!result || result.entries.length === 0) {
    throw new Error(`No unadjusted trial balance for period ${periodLabel}`);
  }
  const unadjusted = { entries: result.entries };

  const adjustments = await listAdjustments({ periodLabel, status: 'posted' }, tenantId, pool);
  if (adjustments.length === 0) {
    return unadjusted.entries;
  }

  const byAccount = new Map<
    string,
    { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: TrialBalanceEntry['accountType'] }
  >();

  for (const e of unadjusted.entries) {
    const key = accountKey(e);
    const existing = byAccount.get(key);
    if (existing) {
      existing.debit += e.debit ?? 0;
      existing.credit += e.credit ?? 0;
    } else {
      byAccount.set(key, {
        accountCode: e.accountCode,
        accountName: e.accountName,
        debit: e.debit ?? 0,
        credit: e.credit ?? 0,
        accountType: e.accountType,
      });
    }
  }

  for (const adj of adjustments as CloseAdjustment[]) {
    const debits = adj.debits ?? [];
    const credits = adj.credits ?? [];
    for (const d of debits) {
      const name = (d.account ?? '').trim() || 'Unknown';
      const key = name;
      const existing = byAccount.get(key);
      if (existing) {
        existing.debit += d.amount ?? 0;
      } else {
        byAccount.set(key, {
          accountName: name,
          debit: d.amount ?? 0,
          credit: 0,
        });
      }
    }
    for (const c of credits) {
      const name = (c.account ?? '').trim() || 'Unknown';
      const key = name;
      const existing = byAccount.get(key);
      if (existing) {
        existing.credit += c.amount ?? 0;
      } else {
        byAccount.set(key, {
          accountName: name,
          debit: 0,
          credit: c.amount ?? 0,
        });
      }
    }
  }

  return Array.from(byAccount.values()).map((v) => ({
    accountCode: v.accountCode,
    accountName: v.accountName,
    debit: v.debit,
    credit: v.credit,
    accountType: v.accountType,
  }));
}
