/**
 * Versioning flow: Unadjusted TB (Source CSV) → Proposed Adjustments (HITL table) → Adjusted TB.
 *
 * - Unadjusted TB: raw trial balance from upload/session snapshot (source of truth).
 * - Proposed Adjustments: items in tenant_hitl_staging with status 'pending' (must approve/reject before statements).
 * - Adjusted TB: Unadjusted + approved adjustments merged (journal_entry / adjustment payloads with debits/credits).
 *
 * Statement generation must refuse to run on raw source data if pending adjustments exist;
 * it merges approved adjustments from Postgres into a virtual Adjusted state first.
 * Every number in the final report is traceable to the original upload or a specific agent-proposed adjustment.
 */

import type { Pool } from 'pg';
import type { TrialBalanceEntry } from '../types/financial.js';
import type { CloseAdjustment } from '../types/close_and_controls.js';
import { getUnadjustedOrRollup } from './trial_balance_rollup_service.js';
import { listAdjustments } from './close_adjustments_service.js';
import { getPostableJEAdjustments } from './journal_entry_service.js';
import { buildDerivedTrialBalance } from './gl_to_tb_aggregation_service.js';
import * as glRepository from '../db/repositories/general_ledger_repository.js';
import { plus } from '../utils/decimal.js';

/** Single debit or credit line for an adjustment (journal entry or reclassification). */
export interface AdjustmentLine {
  account: string;
  amount: number;
}

/** One adjustment: list of debits and credits (double-entry). Used by close adjustments and HITL approved payloads. */
export interface TrialBalanceAdjustment {
  debits: AdjustmentLine[];
  credits: AdjustmentLine[];
}

function accountKey(entry: { accountCode?: string; accountName: string }): string {
  return (entry.accountCode ?? entry.accountName ?? '').trim() || entry.accountName;
}

/**
 * Merge unadjusted trial balance entries with a list of adjustments (approved HITL or posted close adjustments).
 * Returns adjusted entries: every number is traceable to source or a specific adjustment.
 */
export function mergeAdjustmentsIntoEntries(
  unadjustedEntries: Array<{ accountName: string; debit?: number; credit?: number; accountCode?: string; accountType?: TrialBalanceEntry['accountType'] }>,
  adjustments: TrialBalanceAdjustment[]
): Array<{ accountName: string; debit: number; credit: number; accountCode?: string; accountType?: TrialBalanceEntry['accountType'] }> {
  const byAccount = new Map<
    string,
    { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: TrialBalanceEntry['accountType'] }
  >();

  for (const e of unadjustedEntries) {
    const key = accountKey(e);
    const existing = byAccount.get(key);
    const debit = e.debit ?? 0;
    const credit = e.credit ?? 0;
    if (existing) {
      existing.debit = plus(existing.debit, debit);
      existing.credit = plus(existing.credit, credit);
    } else {
      byAccount.set(key, {
        accountCode: e.accountCode,
        accountName: e.accountName,
        debit,
        credit,
        accountType: e.accountType,
      });
    }
  }

  for (const adj of adjustments) {
    const debits = adj.debits ?? [];
    const credits = adj.credits ?? [];
    for (const d of debits) {
      const name = (d.account ?? '').trim() || 'Unknown';
      const key = name;
      const existing = byAccount.get(key);
      if (existing) {
        existing.debit = plus(existing.debit, d.amount ?? 0);
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
        existing.credit = plus(existing.credit, c.amount ?? 0);
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

/**
 * Get adjusted trial balance for a period: Unadjusted TB (roll-up from months) + posted close adjustments + approved/postable JEs (when closeSessionId provided).
 * When no unadjusted TB exists but GL data exists for the period, derives TB from GL (GL-only flow).
 * Throws if no unadjusted TB and no GL data for period (caller may 404).
 */
export async function getAdjustedTrialBalance(
  tenantId: string,
  periodLabel: string,
  pool: Pool | undefined,
  closeSessionId?: string
): Promise<TrialBalanceEntry[]> {
  let result = await getUnadjustedOrRollup(tenantId, periodLabel, pool);
  if (!result || result.entries.length === 0) {
    // Fallback: derive from GL when period_trial_balance is empty (GL-only flow)
    if (pool) {
      const glLines = await glRepository.getGLForPeriod(pool, tenantId, periodLabel);
      if (glLines.length > 0) {
        const derivedTB = await buildDerivedTrialBalance(pool, tenantId, periodLabel);
        result = {
          entries: derivedTB.entries.map((e) => ({
            accountCode: e.account_code,
            accountName: e.account_name,
            debit: e.total_debits ?? e.debit ?? 0,
            credit: e.total_credits ?? e.credit ?? 0,
            accountType: mapAccountTypeToFinancial(e.account_type),
          })),
          source: 'uploaded',
        };
      }
    }
    if (!result || result.entries.length === 0) {
      throw new Error(`No unadjusted trial balance for period ${periodLabel}`);
    }
  }

  const adjustmentPayloads: TrialBalanceAdjustment[] = [];

  const adjustments = await listAdjustments({ periodLabel, status: 'posted' }, tenantId, pool);
  for (const adj of adjustments as CloseAdjustment[]) {
    adjustmentPayloads.push({
      debits: adj.debits ?? [],
      credits: adj.credits ?? [],
    });
  }

  if (pool && closeSessionId) {
    try {
      const jeAdjustments = await getPostableJEAdjustments(pool, tenantId, closeSessionId);
      for (const jeAdj of jeAdjustments) {
        adjustmentPayloads.push({ debits: jeAdj.debits, credits: jeAdj.credits });
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  if (adjustmentPayloads.length === 0) {
    return result.entries;
  }

  return mergeAdjustmentsIntoEntries(result.entries, adjustmentPayloads);
}

/** Map COA account_type (Asset/Liability) to financial.ts AccountType (ASSET/LIABILITY). */
function mapAccountTypeToFinancial(
  t?: string
): TrialBalanceEntry['accountType'] | undefined {
  if (!t) return undefined;
  const u = t.toUpperCase();
  if (u === 'ASSET' || u === 'LIABILITY' || u === 'EQUITY' || u === 'REVENUE' || u === 'EXPENSE') {
    return u as TrialBalanceEntry['accountType'];
  }
  return undefined;
}

/**
 * Get trial balance for certification.
 * Priority: GL-derived TB > Uploaded TB.
 * When GL exists for period, derive TB from GL. Otherwise use uploaded TB + adjustments.
 */
export async function getTrialBalanceForCertification(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  closeSessionId?: string
): Promise<{
  trialBalance: TrialBalanceEntry[];
  source: 'gl_derived' | 'uploaded' | 'adjusted';
  hasGL: boolean;
}> {
  const glLines = await glRepository.getGLForPeriod(pool, tenantId, periodLabel);

  if (glLines.length > 0) {
    const derivedTB = await buildDerivedTrialBalance(pool, tenantId, periodLabel);
    const entries: TrialBalanceEntry[] = derivedTB.entries.map((e) => ({
      accountCode: e.account_code,
      accountName: e.account_name,
      debit: e.debit ?? 0,
      credit: e.credit ?? 0,
      accountType: mapAccountTypeToFinancial(e.account_type),
    }));
    return {
      trialBalance: entries,
      source: 'gl_derived',
      hasGL: true,
    };
  }

  const existingTB = await getAdjustedTrialBalance(tenantId, periodLabel, pool, closeSessionId);
  return {
    trialBalance: existingTB,
    source: 'adjusted',
    hasGL: false,
  };
}
