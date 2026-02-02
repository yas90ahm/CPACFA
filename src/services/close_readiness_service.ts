/**
 * Close readiness: pre-close checks plus optional agentic summary (ready / not ready because...).
 */

import type { Pool } from 'pg';
import { runPreCloseChecks } from './period_close_service.js';
import { buildReconciliationTieOut } from './reconciliation_tie_out_service.js';
import { getChecklist } from './checklist_store_service.js';
import { isPeriodLocked } from './period_lock_service.js';
import { generateCloseReadinessNarrativeAgentic } from './agentic_close_readiness.js';

export interface CloseReadinessResult {
  periodLabel: string;
  ready: boolean;
  reason?: string;
  checklistDone: boolean;
  recsTied: boolean;
  locked: boolean;
  narrative?: string;
}

/**
 * Build close readiness for a period. Optional includeNarrative for agentic summary.
 */
export async function buildCloseReadiness(
  tenantId: string,
  periodLabel: string,
  pool: Pool | undefined,
  options?: { includeNarrative?: boolean }
): Promise<CloseReadinessResult> {
  const preClose = await runPreCloseChecks(tenantId, periodLabel, pool);
  const tieOut = await buildReconciliationTieOut(tenantId, periodLabel, pool);
  const steps = await getChecklist(periodLabel, undefined, tenantId, pool);
  const checklistDone = steps.every((s) => s.status === 'completed' || s.status === 'skipped');
  const locked = await isPeriodLocked(periodLabel, tenantId, pool);

  const ready = preClose.ok && tieOut.tied && checklistDone && locked;
  const reason = ready
    ? undefined
    : [preClose.ok ? undefined : preClose.reason, tieOut.tied ? undefined : tieOut.reason, checklistDone ? undefined : 'Checklist not complete', locked ? undefined : 'Period not locked']
        .filter(Boolean)
        .join('; ') || undefined;

  const base: CloseReadinessResult = {
    periodLabel,
    ready,
    reason,
    checklistDone,
    recsTied: tieOut.tied,
    locked,
  };

  if (options?.includeNarrative) {
    base.narrative = await generateCloseReadinessNarrativeAgentic(base);
  }
  return base;
}
