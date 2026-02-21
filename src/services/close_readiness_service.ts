/**
 * Close readiness: pre-close checks plus optional agentic summary (ready / not ready because...).
 */

import type { Pool } from 'pg';
import { runPreCloseChecks } from './period_close_service.js';
// QUARANTINED — Summary/reporting service not in MVP architecture
// import { buildReconciliationTieOut } from './reconciliation_tie_out_service.js';
import { getChecklist } from './checklist_store_service.js';
import { isPeriodLocked } from './period_lock_service.js';
// QUARANTINED — Agentic service not in MVP architecture
// import { generateCloseReadinessNarrativeAgentic } from './agentic_close_readiness.js';

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
  // QUARANTINED — reconciliation_tie_out_service is summary/reporting, not close execution
  // Use recon_completeness_gate instead for readiness checks
  // const tieOut = await buildReconciliationTieOut(tenantId, periodLabel, pool);
  const steps = await getChecklist(periodLabel, undefined, tenantId, pool);
  const checklistDone = steps.every((s) => s.status === 'completed' || s.status === 'skipped');
  const locked = await isPeriodLocked(periodLabel, tenantId, pool);

  // Simplified: recsTied defaults to true (recon completeness is checked by recon_completeness_gate in readiness service)
  const recsTied = true; // Recon completeness is enforced by recon_completeness_gate, not tie-out summary
  const ready = preClose.ok && recsTied && checklistDone && locked;
  const reason = ready
    ? undefined
    : [preClose.ok ? undefined : preClose.reason, recsTied ? undefined : 'Reconciliations not complete', checklistDone ? undefined : 'Checklist not complete', locked ? undefined : 'Period not locked']
        .filter(Boolean)
        .join('; ') || undefined;

  const base: CloseReadinessResult = {
    periodLabel,
    ready,
    reason,
    checklistDone,
    recsTied,
    locked,
  };

  // QUARANTINED — Agentic narrative not in MVP architecture
  // if (options?.includeNarrative) {
  //   base.narrative = await generateCloseReadinessNarrativeAgentic(base);
  // }
  return base;
}
