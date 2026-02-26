/**
 * Template Completeness Gate
 *
 * Hard gate: all proposed AJE templates for a close session must be applied or skipped before advancement to UNDER_REVIEW.
 */

import type { Pool } from 'pg';
import { getApplicationsForSession } from '../db/repositories/aje_template_repository.js';

export interface TemplateCompletenessResult {
  passes: boolean;
  total_proposed: number;
  applied: number;
  skipped: number;
  pending: number;
  pending_names: string[];
}

export async function checkTemplateCompleteness(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<TemplateCompletenessResult> {
  const applications = await getApplicationsForSession(pool, tenantId, closeSessionId);
  const proposed = applications.filter((a) => a.status === 'proposed');
  const applied = applications.filter((a) => a.status === 'applied');
  const skipped = applications.filter((a) => a.status === 'skipped');
  const pending = proposed.length;
  return {
    passes: pending === 0,
    total_proposed: applications.length,
    applied: applied.length,
    skipped: skipped.length,
    pending,
    pending_names: proposed.map((a) => a.templateId),
  };
}
