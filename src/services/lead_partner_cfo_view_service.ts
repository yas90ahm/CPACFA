/**
 * Lead Partner + CFO one-call: build cfoView from snapshot and optional variance/sensitivity reports
 * so the orchestrator can run Lead Partner CoT with unified board narrative (CFO view) in one request.
 */

import { computeCFOKPIs } from './executive_summarizer.js';
import { generateBoardOnePagerAgentic } from './agentic_board_one_pager.js';
import {
  explainVarianceAgentic,
  explainSensitivityReportAgentic,
} from './agentic_variance_explainer.js';
import type { CFOFinancialSnapshot, VarianceReport, SensitivityReport } from '../types/cfo-dashboard.js';

export interface CfoViewFromSnapshotInput {
  snapshot: CFOFinancialSnapshot;
  varianceReport?: VarianceReport;
  sensitivityReport?: SensitivityReport;
  periodLabel?: string;
}

export interface CfoViewResult {
  narrative: string;
  varianceSummary?: string;
  sensitivitySummary?: string;
}

/**
 * Build cfoView (narrative, varianceSummary, sensitivitySummary) from snapshot and optional reports.
 * Used by POST /api/cfo-dashboard/lead-partner-view to feed Lead Partner in one call.
 */
export async function buildCfoViewFromSnapshotAndReports(
  input: CfoViewFromSnapshotInput
): Promise<CfoViewResult> {
  const period = input.periodLabel ?? input.snapshot.periodLabel ?? 'Current Period';
  const kpis = computeCFOKPIs(input.snapshot);

  const onePager = await generateBoardOnePagerAgentic({
    snapshot: input.snapshot,
    kpis,
    varianceReport: input.varianceReport,
    sensitivityReport: input.sensitivityReport,
    periodLabel: period,
  });

  const narrative = [onePager.narrative, onePager.bullets?.length ? onePager.bullets.join(' ') : '']
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000);

  let varianceSummary: string | undefined;
  if (input.varianceReport) {
    try {
      varianceSummary = await explainVarianceAgentic(input.varianceReport);
    } catch {
      varianceSummary = input.varianceReport.summaryNarrative ?? 'Variance report available.';
    }
  }

  let sensitivitySummary: string | undefined;
  if (input.sensitivityReport) {
    try {
      sensitivitySummary = await explainSensitivityReportAgentic(input.sensitivityReport);
    } catch {
      sensitivitySummary = input.sensitivityReport.summaryNarrative ?? 'Sensitivity report available.';
    }
  }

  return { narrative, varianceSummary, sensitivitySummary };
}
