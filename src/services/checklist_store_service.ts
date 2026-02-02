/**
 * FW1: Checklist store per period so steps can be updated (e.g. evidenceId, evidenceType).
 * Uses tenant DB when pool/tenantId provided; else in-memory.
 */

import type { Pool } from 'pg';
import type { CloseChecklistStep } from '../types/close_and_controls.js';
import { createCloseChecklist } from './month_end_close_service.js';
import { createChecklistFromTemplate } from './close_checklist_template_service.js';
import { isDbConfigured } from '../db/index.js';
import * as checklistRepo from '../db/repositories/close_checklist_repository.js';

const store = new Map<string, CloseChecklistStep[]>();

/** Infer period type from period label (e.g. "2025-01" -> monthly, "Q4 FY24" -> quarterly). */
function inferPeriodType(periodLabel: string): 'monthly' | 'quarterly' | 'annual' {
  const lower = periodLabel.toLowerCase();
  if (lower.startsWith('q') || lower.includes('quarter')) return 'quarterly';
  if (lower.includes('fy') || lower.includes('annual') || lower.includes('year')) return 'annual';
  return 'monthly';
}

/**
 * Get checklist for period (stored or default). When pool/tenantId present, uses tenant DB.
 * When no stored checklist, derives from tenant template (if any) or default.
 */
export async function getChecklist(
  periodLabel: string,
  options?: { assignee?: string; dueDate?: string },
  tenantId?: string,
  pool?: Pool
): Promise<CloseChecklistStep[]> {
  if (isDbConfigured() && tenantId && pool) {
    const stored = await checklistRepo.getChecklist(pool, tenantId, periodLabel);
    if (stored && stored.length > 0) return stored.map((s) => ({ ...s }));
    const periodType = inferPeriodType(periodLabel);
    return createChecklistFromTemplate(tenantId, periodLabel, periodType, options ?? {}, pool);
  }
  const stored = store.get(periodLabel);
  if (stored) return stored.map((s) => ({ ...s }));
  return createCloseChecklist(periodLabel, options);
}

/**
 * Store checklist for period. When pool/tenantId present, uses tenant DB.
 */
export async function setChecklist(
  periodLabel: string,
  steps: CloseChecklistStep[],
  tenantId?: string,
  pool?: Pool
): Promise<CloseChecklistStep[]> {
  const copy = steps.map((s) => ({ ...s }));
  if (isDbConfigured() && tenantId && pool) {
    await checklistRepo.upsertChecklist(pool, tenantId, periodLabel, copy);
    return copy.map((s) => ({ ...s }));
  }
  store.set(periodLabel, copy);
  return copy.map((s) => ({ ...s }));
}

/**
 * Update a step's evidence link. When pool/tenantId present, uses tenant DB.
 */
export async function updateStepEvidence(
  periodLabel: string,
  stepId: string,
  evidence: { evidenceId?: string; evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off' },
  tenantId?: string,
  pool?: Pool
): Promise<CloseChecklistStep | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const steps = await checklistRepo.getChecklist(pool, tenantId, periodLabel);
    if (!steps || steps.length === 0) return undefined;
    const step = steps.find((s) => s.id === stepId);
    if (!step) return undefined;
    if (evidence.evidenceId != null) step.evidenceId = evidence.evidenceId;
    if (evidence.evidenceType != null) step.evidenceType = evidence.evidenceType;
    await checklistRepo.upsertChecklist(pool, tenantId, periodLabel, steps);
    return { ...step };
  }
  const steps = store.get(periodLabel);
  if (!steps) return undefined;
  const step = steps.find((s) => s.id === stepId);
  if (!step) return undefined;
  if (evidence.evidenceId != null) step.evidenceId = evidence.evidenceId;
  if (evidence.evidenceType != null) step.evidenceType = evidence.evidenceType;
  return { ...step };
}
