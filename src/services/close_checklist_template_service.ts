/**
 * Close checklist templates: per-tenant default steps per period type.
 * When creating a checklist for a new period, derive from template or fall back to default.
 */

import type { Pool } from 'pg';
import type { CloseChecklistStep } from '../types/close_and_controls.js';
import { isDbConfigured } from '../db/index.js';
import * as templateRepo from '../db/repositories/close_checklist_template_repository.js';
import type { CloseChecklistTemplateStepSpec } from '../db/repositories/close_checklist_template_repository.js';
import { createCloseChecklist } from './month_end_close_service.js';

export type PeriodType = 'monthly' | 'quarterly' | 'annual';

/**
 * Get template for tenant and period type. Returns undefined if none or DB not configured.
 */
export async function getTemplateForTenant(
  tenantId: string,
  periodType: PeriodType,
  pool?: Pool
): Promise<templateRepo.CloseChecklistTemplateRow | undefined> {
  if (!isDbConfigured() || !pool) return undefined;
  const t = await templateRepo.getTemplate(pool, tenantId, periodType);
  return t ?? undefined;
}

/**
 * List all templates for tenant.
 */
export async function listTemplatesForTenant(
  tenantId: string,
  pool?: Pool
): Promise<templateRepo.CloseChecklistTemplateRow[]> {
  if (!isDbConfigured() || !pool) return [];
  return templateRepo.listTemplates(pool, tenantId);
}

/**
 * Upsert template for tenant and period type.
 */
export async function upsertTemplateForTenant(
  tenantId: string,
  periodType: PeriodType,
  input: { name?: string; stepsSpec: templateRepo.CloseChecklistTemplateStepSpec[] },
  pool?: Pool
): Promise<templateRepo.CloseChecklistTemplateRow | undefined> {
  if (!isDbConfigured() || !pool) return undefined;
  return templateRepo.upsertTemplate(pool, tenantId, periodType, input);
}

/**
 * Create checklist steps from template for tenant/period. If no template, use default from month_end_close_service.
 * options.assignee and options.dueDate applied to each step; dueDate can be computed from periodLabel + step dueOffsetDays if needed.
 */
export async function createChecklistFromTemplate(
  tenantId: string,
  periodLabel: string,
  periodType: PeriodType,
  options: { assignee?: string; dueDate?: string },
  pool?: Pool
): Promise<CloseChecklistStep[]> {
  const template = await getTemplateForTenant(tenantId, periodType, pool);
  if (!template || !template.stepsSpec.length) {
    return createCloseChecklist(periodLabel, options);
  }
  const baseDue = options.dueDate;
  return template.stepsSpec.map((spec: CloseChecklistTemplateStepSpec, i) => {
    let dueDate = options.dueDate;
    if (baseDue && spec.dueOffsetDays != null) {
      const d = new Date(baseDue);
      d.setDate(d.getDate() + spec.dueOffsetDays);
      dueDate = d.toISOString().slice(0, 10);
    }
    return {
      id: `step-${i + 1}`,
      label: spec.label,
      status: 'pending' as const,
      category: spec.category,
      verificationMethod: spec.verificationMethod,
      controlId: spec.controlId,
      assignee: spec.assignee ?? options.assignee,
      dueDate: dueDate ?? undefined,
    };
  });
}
