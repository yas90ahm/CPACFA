/**
 * Close package and audit package export — PDF and CSV from buildClosePackage output.
 * PDF via createPdfFromStructuredPayload (summary + highlights); HTML for future use. No new persistence.
 */

import type { ClosePackage } from './close_package_service.js';
import { createPdfFromStructuredPayload } from './pdf_export.js';

export interface ExportOptions {
  title?: string;
  includeNarrative?: boolean;
  narrative?: string | null;
}

/**
 * Build HTML summary of close package for PDF: period, sign-off, checklist, recs, controls, materiality, optional narrative.
 */
export function closePackageToHtml(pkg: ClosePackage, options: ExportOptions = {}): string {
  const title = options.title ?? 'Close Package';
  const parts: string[] = [];
  parts.push(`<h1>${escapeHtml(title)}</h1>`);
  parts.push(`<p><strong>Period:</strong> ${escapeHtml(pkg.periodLabel)}</p>`);
  parts.push(`<p><strong>Generated:</strong> ${new Date().toISOString()}</p>`);

  if (pkg.periodClose) {
    const pc = pkg.periodClose as { status?: string; closedBy?: string; reviewedBy?: string };
    parts.push('<h2>Sign-off</h2>');
    parts.push(`<p>Status: ${escapeHtml(String(pc.status ?? '—'))}</p>`);
    if (pc.closedBy) parts.push(`<p>Closed by: ${escapeHtml(pc.closedBy)}</p>`);
    if (pc.reviewedBy) parts.push(`<p>Reviewed by: ${escapeHtml(pc.reviewedBy)}</p>`);
  }

  if (pkg.materialityRef) {
    parts.push('<h2>Materiality</h2>');
    const m = pkg.materialityRef;
    parts.push(`<p>Threshold: ${m.thresholdAmount != null ? String(m.thresholdAmount) : m.thresholdPercent != null ? String(m.thresholdPercent) + '%' : '—'}; Basis: ${escapeHtml(m.basis ?? '—')}</p>`);
  }
  if (pkg.materialItemsSummary) {
    parts.push(`<p>${escapeHtml(pkg.materialItemsSummary)}</p>`);
  }

  const steps = pkg.checklistStepsWithSignOff as Array<{ id?: string; label?: string; status?: string; signedOffBy?: string; completedBy?: string }>;
  if (steps?.length) {
    parts.push('<h2>Checklist (signed / completed)</h2>');
    parts.push('<table border="1" cellpadding="4"><tr><th>Step</th><th>Status</th><th>Signed/Completed by</th></tr>');
    for (const s of steps) {
      parts.push(`<tr><td>${escapeHtml(s.label ?? s.id ?? '')}</td><td>${escapeHtml(String(s.status ?? ''))}</td><td>${escapeHtml(s.signedOffBy ?? s.completedBy ?? '')}</td></tr>`);
    }
    parts.push('</table>');
  }

  const recs = pkg.reconciliationResolutions as Array<{ id?: string; reconciliationType?: string; status?: string }>;
  if (recs?.length) {
    parts.push('<h2>Reconciliation resolutions</h2>');
    parts.push(`<p>Count: ${recs.length}</p>`);
    parts.push('<table border="1" cellpadding="4"><tr><th>Type</th><th>Status</th></tr>');
    for (const r of recs.slice(0, 50)) {
      parts.push(`<tr><td>${escapeHtml(String(r.reconciliationType ?? ''))}</td><td>${escapeHtml(String(r.status ?? ''))}</td></tr>`);
    }
    if (recs.length > 50) parts.push(`<tr><td colspan="2">... and ${recs.length - 50} more</td></tr>`);
    parts.push('</table>');
  }

  const controls = pkg.controlEvidenceSummary as Array<{ controlId?: string; controlName?: string; evidenceCount?: number }>;
  if (controls?.length) {
    parts.push('<h2>Control evidence summary</h2>');
    parts.push('<table border="1" cellpadding="4"><tr><th>Control</th><th>Evidence count</th></tr>');
    for (const c of controls.slice(0, 30)) {
      parts.push(`<tr><td>${escapeHtml(String(c.controlName ?? c.controlId ?? ''))}</td><td>${c.evidenceCount ?? 0}</td></tr>`);
    }
    if (controls.length > 30) parts.push(`<tr><td colspan="2">... and ${controls.length - 30} more</td></tr>`);
    parts.push('</table>');
  }

  parts.push('<h2>Summary counts</h2>');
  parts.push(`<p>DRL items: ${pkg.drlSummary?.count ?? 0}; PBC items: ${Array.isArray(pkg.pbcItems) ? pkg.pbcItems.length : 0}; Sampling runs: ${Array.isArray(pkg.samplingRuns) ? pkg.samplingRuns.length : 0}; Adjustments: ${Array.isArray(pkg.adjustments) ? pkg.adjustments.length : 0}</p>`);

  if (options.includeNarrative && options.narrative) {
    parts.push('<h2>Narrative</h2>');
    parts.push(`<div class="narrative">${escapeHtml(options.narrative)}</div>`);
  }

  return parts.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build structured payload for PDF: cover, executive summary (or narrative), highlights from package.
 */
function closePackageToStructuredPayload(pkg: ClosePackage, options: ExportOptions = {}): Parameters<typeof createPdfFromStructuredPayload>[0] {
  const title = options.title ?? 'Close Package';
  const periodClose = pkg.periodClose as { status?: string; closedBy?: string; reviewedBy?: string } | null;
  const executiveSummary =
    options.includeNarrative && options.narrative
      ? options.narrative
      : [
          `Period: ${pkg.periodLabel}.`,
          periodClose ? `Sign-off status: ${periodClose.status ?? '—'}. Closed by: ${periodClose.closedBy ?? '—'}. Reviewed by: ${periodClose.reviewedBy ?? '—'}.` : 'No period close record.',
          pkg.materialityRef
            ? `Materiality: ${pkg.materialityRef.thresholdAmount != null ? pkg.materialityRef.thresholdAmount : pkg.materialityRef.thresholdPercent != null ? pkg.materialityRef.thresholdPercent + '%' : '—'} (${pkg.materialityRef.basis ?? '—'}).`
            : '',
          pkg.materialItemsSummary ? pkg.materialItemsSummary : '',
          `Checklist steps with sign-off: ${Array.isArray(pkg.checklistStepsWithSignOff) ? pkg.checklistStepsWithSignOff.length : 0}. Reconciliations: ${Array.isArray(pkg.reconciliationResolutions) ? pkg.reconciliationResolutions.length : 0}. Control evidence items: ${Array.isArray(pkg.controlEvidenceSummary) ? pkg.controlEvidenceSummary.length : 0}.`,
        ].join(' ');
  const highlights: string[] = [];
  highlights.push(`DRL items: ${pkg.drlSummary?.count ?? 0}`);
  highlights.push(`PBC items: ${Array.isArray(pkg.pbcItems) ? pkg.pbcItems.length : 0}`);
  highlights.push(`Sampling runs: ${Array.isArray(pkg.samplingRuns) ? pkg.samplingRuns.length : 0}`);
  highlights.push(`Adjustments: ${Array.isArray(pkg.adjustments) ? pkg.adjustments.length : 0}`);
  return {
    cover: { title, period_label: pkg.periodLabel, report_date: new Date().toISOString() },
    executive_summary: executiveSummary,
    highlights,
  };
}

/**
 * Export close package to PDF buffer.
 */
export async function exportClosePackageToPdf(pkg: ClosePackage, options: ExportOptions = {}): Promise<Buffer> {
  const payload = closePackageToStructuredPayload(pkg, options);
  return createPdfFromStructuredPayload(payload);
}

/**
 * Flatten close package to CSV rows: checklist, rec status, control evidence list.
 */
export function closePackageToCsvRows(pkg: ClosePackage): string[][] {
  const rows: string[][] = [];
  const escape = (v: unknown) => (v == null ? '' : String(v).replace(/"/g, '""'));

  rows.push(['Section', 'Field1', 'Field2', 'Field3', 'Field4']);
  const steps = pkg.checklistStepsWithSignOff as Array<{ id?: string; label?: string; status?: string; signedOffBy?: string; completedBy?: string }>;
  if (steps?.length) {
    for (const s of steps) {
      rows.push(['checklist', s.label ?? s.id ?? '', s.status ?? '', s.signedOffBy ?? s.completedBy ?? '', '']);
    }
  }
  const recs = pkg.reconciliationResolutions as Array<{ id?: string; reconciliationType?: string; status?: string }>;
  if (recs?.length) {
    for (const r of recs) {
      rows.push(['reconciliation', r.reconciliationType ?? '', r.status ?? '', r.id ?? '', '']);
    }
  }
  const controls = pkg.controlEvidenceSummary as Array<{ controlId?: string; controlName?: string; evidenceCount?: number }>;
  if (controls?.length) {
    for (const c of controls) {
      rows.push(['control_evidence', c.controlName ?? c.controlId ?? '', String(c.evidenceCount ?? 0), '', '']);
    }
  }
  return rows;
}

/**
 * Export close package to CSV buffer (UTF-8).
 */
export function exportClosePackageToCsv(pkg: ClosePackage): Buffer {
  const rows = closePackageToCsvRows(pkg);
  const escapeCell = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = rows.map((row) => row.map((c) => escapeCell(String(c))).join(',')).join('\n');
  return Buffer.from(csv, 'utf-8');
}
