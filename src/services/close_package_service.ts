/**
 * Close package export — structured object for a period (no LLM).
 * Assembled from period close, checklist, adjustments, recs, control evidence, binder, DRL, PBC, sampling, GAAP.
 */

import type { Pool } from 'pg';
import type { PeriodCloseRecord } from '../types/close_and_controls.js';
import { getPeriodCloseRecord } from './period_close_service.js';
import { getLastStatementGeneration } from './audit_export_service.js';
import { listDocumentRequests } from './drl_service.js';
import { listPBCItems } from './pbc_service.js';
import { listSamplingRuns } from './sampling_result_store.js';
import { getRecordedPolicyChanges } from './audit_export_service.js';
import { getChecklist } from './checklist_store_service.js';
import { listAdjustments } from './close_adjustments_service.js';
import { listReconciliationResolutions } from './reconciliation_resolution_service.js';
import { getControlEvidenceSummaryForPeriod } from './close_controls_service.js';
import { getMateriality, materialityThresholdFromSettings } from './materiality_service.js';

export interface MaterialityRefInPackage {
  thresholdAmount?: number;
  thresholdPercent?: number;
  basis?: string;
  periodLabel?: string;
}

export interface ClosePackage {
  periodLabel: string;
  periodClose: PeriodCloseRecord | null;
  binderUrl: string;
  lastStatementGenerationId: string | null;
  drlSummary: { count: number; items: unknown[] };
  pbcItems: unknown[];
  samplingRuns: unknown[];
  gaapConsistencyRef: unknown[];
  checklistStepsWithSignOff: unknown[];
  adjustments: unknown[];
  reconciliationResolutions: unknown[];
  controlEvidenceSummary: unknown[];
  materialityRef?: MaterialityRefInPackage;
  materialItemsSummary?: string;
}

/**
 * Build close package for tenant + period. No LLM; pure assembly from existing services.
 */
export async function buildClosePackage(
  tenantId: string,
  periodLabel: string,
  pool: Pool
): Promise<ClosePackage> {
  const periodClose = (await getPeriodCloseRecord(tenantId, periodLabel, pool)) ?? null;
  const stored = await getLastStatementGeneration(tenantId, pool);
  const drl = await listDocumentRequests(undefined, pool, tenantId);
  const pbcItems = await listPBCItems({ periodLabel }, pool, tenantId);
  const samplingRuns = await listSamplingRuns(pool, tenantId);
  const gaapConsistencyRef = getRecordedPolicyChanges();
  const steps = await getChecklist(periodLabel, undefined, tenantId, pool);
  const adjustments = await listAdjustments({ periodLabel }, tenantId, pool);
  const reconciliationResolutions = await listReconciliationResolutions({ periodLabel }, tenantId, pool);
  const controlEvidenceSummary = await getControlEvidenceSummaryForPeriod(tenantId, pool, periodLabel);
  const materiality = getMateriality(tenantId, periodLabel, pool);
  const threshold = materialityThresholdFromSettings(materiality);
  const materialityRef: MaterialityRefInPackage | undefined = materiality
    ? {
        thresholdAmount: threshold.amount ?? materiality.overallMaterialityAmount,
        thresholdPercent: threshold.percent ?? materiality.overallMaterialityPercent,
        basis: materiality.basis,
        periodLabel,
      }
    : undefined;

  return {
    periodLabel,
    periodClose,
    binderUrl: '/api/audit/binder',
    lastStatementGenerationId: stored?.reasoningChainId ?? null,
    drlSummary: { count: drl.length, items: drl },
    pbcItems,
    samplingRuns,
    gaapConsistencyRef,
    checklistStepsWithSignOff: steps.filter((s: { signedOffBy?: string; completedBy?: string }) => s.signedOffBy ?? s.completedBy),
    adjustments,
    reconciliationResolutions,
    controlEvidenceSummary,
    materialityRef,
  };
}
