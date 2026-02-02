/**
 * Audit file / workpaper structure: sections = control with assertions and evidence for a period.
 * Derives from controls + control_assertions + control_evidence. No new persistence.
 */

import type { Pool } from 'pg';
import type { ControlAssertion } from '../types/close_and_controls.js';
import type { ControlEvidenceRow } from '../db/repositories/close_control_repository.js';
import { listControls } from './close_controls_service.js';
import { listAssertionsForControl, listControlEvidenceForControl } from './close_controls_service.js';
import { createPdfFromStructuredPayload } from './pdf_export.js';

export interface AuditFileSection {
  controlId: string;
  controlName: string;
  assertions: ControlAssertion[];
  evidence: ControlEvidenceRow[];
  narrative?: string;
}

export interface AuditFile {
  periodLabel: string;
  sections: AuditFileSection[];
}

/**
 * Build audit file for tenant + period: sections = control with assertions and evidence.
 */
export async function buildAuditFile(
  tenantId: string,
  periodLabel: string,
  pool: Pool
): Promise<AuditFile> {
  const controls = await listControls(tenantId, pool);
  const sections: AuditFileSection[] = await Promise.all(
    controls.map(async (c) => {
      const [assertions, evidence] = await Promise.all([
        listAssertionsForControl(tenantId, pool, c.id),
        listControlEvidenceForControl(tenantId, pool, c.id, periodLabel),
      ]);
      return {
        controlId: c.id,
        controlName: c.name,
        assertions,
        evidence,
      };
    })
  );
  return { periodLabel, sections };
}

/**
 * Export audit file to PDF buffer (one-page summary: sections with assertion/evidence counts).
 */
export async function exportAuditFileToPdf(auditFile: AuditFile): Promise<Buffer> {
  const executiveSummary = `Audit file for period ${auditFile.periodLabel}. ${auditFile.sections.length} control section(s). Each section lists assertions and evidence for the control.`;
  const highlights = auditFile.sections.map(
    (s) => `${s.controlName}: ${s.assertions.length} assertion(s), ${s.evidence.length} evidence item(s)`
  );
  const payload = {
    cover: {
      title: 'Audit File',
      period_label: auditFile.periodLabel,
      report_date: new Date().toISOString(),
    },
    executive_summary: executiveSummary,
    highlights,
  };
  return createPdfFromStructuredPayload(payload);
}
