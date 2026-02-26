/**
 * Reconciliation tie-out: for a period, list resolutions and indicate whether all are passed or waived (tied).
 * Used for close readiness and audit package.
 */

import type { Pool } from 'pg';
import type { ReconciliationResolution } from '../types/close_and_controls.js';
import { listReconciliationResolutions } from './reconciliation_resolution_service.js';

export interface ReconciliationTieOutResult {
  periodLabel: string;
  tied: boolean;
  resolutions: ReconciliationResolution[];
  /** Resolutions that are not resolved or waived (open, in_progress, re_run_pending) and not passed */
  openOrPending: ReconciliationResolution[];
  reason?: string;
}

/**
 * Build tie-out for a period: all resolutions must be status resolved or waived (and passed or waived).
 */
export async function buildReconciliationTieOut(
  tenantId: string,
  periodLabel: string,
  pool?: Pool
): Promise<ReconciliationTieOutResult> {
  const resolutions = await listReconciliationResolutions({ periodLabel }, tenantId, pool ?? undefined);
  const openOrPending = resolutions.filter(
    (r) =>
      (r.status === 'open' || r.status === 'in_progress' || r.status === 're_run_pending') && !r.passed
  );
  const tied = openOrPending.length === 0;
  const reason = tied
    ? undefined
    : `Reconciliation(s) not tied: ${openOrPending.map((r) => `${r.reconciliationType} (${r.id})`).join(', ')}`;
  return {
    periodLabel,
    tied,
    resolutions,
    openOrPending,
    reason,
  };
}
