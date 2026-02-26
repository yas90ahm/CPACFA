/**
 * Close summary and audit readiness one-pager: close status + readiness narrative + key metrics.
 * One API (and optional PDF) for board/audit one-page view.
 */

import type { Pool } from 'pg';
import { buildCloseStatus, type CloseStatus } from './close_status_service.js';
import { buildCloseReadiness } from './close_readiness_service.js';
import { createPdfFromStructuredPayload } from './pdf_export.js';

export interface CloseOnePager extends CloseStatus {
  narrative?: string;
}

export interface OnePagerOptions {
  includeNarrative?: boolean;
}

/**
 * Build close summary one-pager: close status plus optional readiness narrative.
 */
export async function buildCloseOnePager(
  tenantId: string,
  periodLabel: string,
  pool: Pool | undefined,
  options: OnePagerOptions = {}
): Promise<CloseOnePager> {
  const status = await buildCloseStatus(tenantId, periodLabel, pool);
  if (!options.includeNarrative) {
    return status;
  }
  const readiness = await buildCloseReadiness(tenantId, periodLabel, pool, { includeNarrative: true });
  return { ...status, narrative: readiness.narrative };
}

/**
 * Build structured payload for one-pager PDF: title, executive summary (narrative or status), highlights.
 */
function onePagerToStructuredPayload(
  onePager: CloseOnePager,
  title: string
): Parameters<typeof createPdfFromStructuredPayload>[0] {
  const executiveSummary =
    onePager.narrative ??
    [
      `Period: ${onePager.periodLabel}.`,
      onePager.readiness.ready ? 'Ready for close.' : `Not ready: ${onePager.readiness.reason ?? '—'}.`,
      `Checklist: ${onePager.checklist.completed}/${onePager.checklist.total} completed.`,
      onePager.recTieOut.tied ? 'Reconciliations tied.' : `Open reconciliations: ${onePager.recTieOut.openCount}.`,
      onePager.locked ? `Period locked by ${onePager.lockedBy ?? '—'}.` : 'Period not locked.',
      onePager.signOff.closedBy ? `Closed by ${onePager.signOff.closedBy}; Reviewed by ${onePager.signOff.reviewedBy ?? '—'}.` : 'Not closed.',
    ].join(' ');
  const highlights: string[] = [
    `Readiness: ${onePager.readiness.ready ? 'Ready' : 'Not ready'}`,
    `Checklist: ${onePager.checklist.completed}/${onePager.checklist.total}`,
    `Reconciliations tied: ${onePager.recTieOut.tied ? 'Yes' : 'No'} (open: ${onePager.recTieOut.openCount})`,
    `Locked: ${onePager.locked ? 'Yes' : 'No'}`,
    `Sign-off: ${onePager.signOff.status}`,
  ];
  if (onePager.materialityRef) {
    const m = onePager.materialityRef;
    highlights.push(
      `Materiality: ${m.thresholdAmount != null ? m.thresholdAmount : m.thresholdPercent != null ? m.thresholdPercent + '%' : '—'} (${m.basis ?? '—'})`
    );
  }
  return {
    cover: { title, period_label: onePager.periodLabel, report_date: new Date().toISOString() },
    executive_summary: executiveSummary,
    highlights,
  };
}

/**
 * Export close one-pager to PDF buffer.
 */
export async function exportCloseOnePagerToPdf(
  onePager: CloseOnePager,
  options: { title?: string } = {}
): Promise<Buffer> {
  const title = options.title ?? 'Close Summary One-Pager';
  const payload = onePagerToStructuredPayload(onePager, title);
  return createPdfFromStructuredPayload(payload);
}
