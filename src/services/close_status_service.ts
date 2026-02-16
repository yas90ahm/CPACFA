/**
 * Single "close status" view: period, lock, checklist summary, rec tie-out, readiness, sign-off, materiality.
 * Aggregates existing services; no new persistence.
 */

import type { Pool } from 'pg';
import type { CloseChecklistStep, CloseStage } from '../types/close_and_controls.js';
import { getPeriodCloseRecord } from './period_close_service.js';
import { isPeriodLocked, getPeriodLock } from './period_lock_service.js';
import { getChecklist } from './checklist_store_service.js';
import { buildReconciliationTieOut } from './reconciliation_tie_out_service.js';
import { buildCloseReadiness } from './close_readiness_service.js';
import { getMateriality, materialityThresholdFromSettings } from './materiality_service.js';
import { getUnadjustedMeta } from './trial_balance_store_service.js';
import type { PeriodTrialBalanceSource } from '../db/repositories/period_trial_balance_repository.js';
import { listAdjustments } from './close_adjustments_service.js';

export interface CloseStatusChecklist {
  total: number;
  completed: number;
  incompleteSteps: { id: string; label: string; status: string }[];
}

export interface CloseStatusRecTieOut {
  tied: boolean;
  openCount: number;
  openResolutions?: { id: string; reconciliationType: string; status: string }[];
}

export interface CloseStatusReadiness {
  ready: boolean;
  reason?: string;
}

export interface CloseStatusSignOff {
  status: string;
  closedBy?: string;
  closedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface MaterialityRef {
  thresholdAmount?: number;
  thresholdPercent?: number;
  basis?: string;
  periodLabel?: string;
}

export interface CloseStatus {
  periodLabel: string;
  locked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  checklist: CloseStatusChecklist;
  recTieOut: CloseStatusRecTieOut;
  readiness: CloseStatusReadiness;
  signOff: CloseStatusSignOff;
  materialityRef?: MaterialityRef;
  hasUnadjustedTB: boolean;
  tbSource: PeriodTrialBalanceSource | null;
  tbAt?: string;
  adjustmentCount: number;
  postedCount: number;
  closeStage: CloseStage;
}

/**
 * Derive close stage from TB presence, lock, readiness, and posted adjustments.
 */
export function computeCloseStage(
  hasUnadjustedTB: boolean,
  locked: boolean,
  readinessReady: boolean,
  postedCount: number
): CloseStage {
  if (locked) return 'closed';
  if (!hasUnadjustedTB) return 'no_tb';
  if (readinessReady) return 'ready_to_close';
  if (postedCount > 0) return 'adjustments';
  return 'unadjusted_in';
}

/**
 * Build single close status payload for a period.
 */
export async function buildCloseStatus(
  tenantId: string,
  periodLabel: string,
  pool: Pool | undefined
): Promise<CloseStatus> {
  const [periodClose, locked, lockRecord, steps, tieOut, readiness, tbMeta, adjustments] = await Promise.all([
    getPeriodCloseRecord(tenantId, periodLabel, pool),
    isPeriodLocked(periodLabel, tenantId, pool),
    getPeriodLock(periodLabel, tenantId, pool),
    getChecklist(periodLabel, undefined, tenantId, pool),
    buildReconciliationTieOut(tenantId, periodLabel, pool),
    buildCloseReadiness(tenantId, periodLabel, pool, { includeNarrative: false }),
    getUnadjustedMeta(tenantId, periodLabel, pool),
    listAdjustments({ periodLabel }, tenantId, pool),
  ]);

  const completed = steps.filter((s: CloseChecklistStep) => s.status === 'completed' || s.status === 'skipped');
  const incompleteSteps = steps
    .filter((s: CloseChecklistStep) => s.status !== 'completed' && s.status !== 'skipped')
    .map((s) => ({ id: s.id, label: s.label, status: s.status }));

  const materiality = getMateriality(tenantId, periodLabel, pool ?? undefined);
  const threshold = materialityThresholdFromSettings(materiality);
  const materialityRef: MaterialityRef | undefined = materiality
    ? {
        thresholdAmount: threshold.amount ?? materiality.overallMaterialityAmount,
        thresholdPercent: threshold.percent ?? materiality.overallMaterialityPercent,
        basis: materiality.basis,
        periodLabel,
      }
    : undefined;

  const hasUnadjustedTB = !!tbMeta;
  const postedCount = adjustments.filter((a) => a.status === 'posted').length;
  const closeStage = computeCloseStage(hasUnadjustedTB, locked, readiness.ready, postedCount);

  return {
    periodLabel,
    locked,
    lockedBy: lockRecord?.lockedBy,
    lockedAt: lockRecord?.lockedAt,
    checklist: {
      total: steps.length,
      completed: completed.length,
      incompleteSteps,
    },
    recTieOut: {
      tied: tieOut.tied,
      openCount: tieOut.openOrPending.length,
      openResolutions: tieOut.openOrPending.map((r) => ({
        id: r.id,
        reconciliationType: r.reconciliationType,
        status: r.status,
      })),
    },
    readiness: {
      ready: readiness.ready,
      reason: readiness.reason,
    },
    signOff: {
      status: periodClose?.status ?? 'draft',
      closedBy: periodClose?.closedBy,
      closedAt: periodClose?.closedAt,
      reviewedBy: periodClose?.reviewedBy,
      reviewedAt: periodClose?.reviewedAt,
    },
    materialityRef,
    hasUnadjustedTB,
    tbSource: tbMeta?.source ?? null,
    tbAt: tbMeta?.at,
    adjustmentCount: adjustments.length,
    postedCount,
    closeStage,
  };
}
