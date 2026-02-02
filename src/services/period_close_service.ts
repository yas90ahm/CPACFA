/**
 * Period close record — one per period with status and sign-off.
 * Pre-close checks: recs passed/waived, checklist completed/skipped, period locked.
 * Persist in tenant DB when pool/tenantId provided; else in-memory.
 */

import type { Pool } from 'pg';
import type { PeriodCloseRecord, PeriodCloseStatusType } from '../types/close_and_controls.js';
import { isDbConfigured } from '../db/index.js';
import * as periodCloseRepo from '../db/repositories/period_close_repository.js';
import { listReconciliationResolutions } from './reconciliation_resolution_service.js';
import { getChecklist } from './checklist_store_service.js';
import { isPeriodLocked } from './period_lock_service.js';

const store = new Map<string, PeriodCloseRecord>();

function key(tenantId: string, periodLabel: string): string {
  return `${tenantId}:${periodLabel}`;
}

export interface PreCloseCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Run pre-close checks: recs passed/waived, checklist completed/skipped, period locked.
 */
export async function runPreCloseChecks(
  tenantId: string,
  periodLabel: string,
  pool?: Pool
): Promise<PreCloseCheckResult> {
  const resolutions = await listReconciliationResolutions({ periodLabel }, tenantId, pool);
  const openOrInProgress = resolutions.filter(
    (r) => (r.status === 'open' || r.status === 'in_progress') && !r.passed
  );
  if (openOrInProgress.length > 0) {
    return { ok: false, reason: `Reconciliation(s) not passed or waived: ${openOrInProgress.map((r) => r.id).join(', ')}` };
  }
  const steps = await getChecklist(periodLabel, undefined, tenantId, pool);
  const notDone = steps.filter((s) => s.status !== 'completed' && s.status !== 'skipped');
  if (notDone.length > 0) {
    return { ok: false, reason: `Checklist step(s) not completed or skipped: ${notDone.map((s) => s.id).join(', ')}` };
  }
  const locked = await isPeriodLocked(periodLabel, tenantId, pool);
  if (!locked) {
    return { ok: false, reason: 'Period is not locked. Lock the period before closing.' };
  }
  return { ok: true };
}

/**
 * Get or create period close record.
 */
export async function getOrCreatePeriodClose(
  tenantId: string,
  periodLabel: string,
  pool?: Pool
): Promise<PeriodCloseRecord> {
  if (isDbConfigured() && pool) {
    const existing = await periodCloseRepo.getPeriodClose(pool, tenantId, periodLabel);
    if (existing) return existing;
    return periodCloseRepo.upsertPeriodClose(pool, tenantId, periodLabel, 'draft');
  }
  const k = key(tenantId, periodLabel);
  let rec = store.get(k);
  if (!rec) {
    const now = new Date().toISOString();
    rec = { tenantId, periodLabel, status: 'draft', createdAt: now, updatedAt: now };
    store.set(k, rec);
  }
  return { ...rec };
}

/**
 * Get period close record.
 */
export async function getPeriodCloseRecord(
  tenantId: string,
  periodLabel: string,
  pool?: Pool
): Promise<PeriodCloseRecord | undefined> {
  if (isDbConfigured() && pool) {
    const r = await periodCloseRepo.getPeriodClose(pool, tenantId, periodLabel);
    return r ?? undefined;
  }
  return store.get(key(tenantId, periodLabel));
}

/**
 * Set period close status (in_review | closed). For 'closed', runs pre-close checks.
 */
export async function setPeriodCloseStatus(
  tenantId: string,
  periodLabel: string,
  status: PeriodCloseStatusType,
  closedBy?: string,
  pool?: Pool
): Promise<{ record: PeriodCloseRecord; preCloseChecked?: boolean }> {
  if (status === 'closed') {
    const check = await runPreCloseChecks(tenantId, periodLabel, pool);
    if (!check.ok) {
      throw new Error(check.reason ?? 'Pre-close checks failed');
    }
  }
  const now = new Date().toISOString();
  const closedAt = status === 'closed' ? now : undefined;
  const closedByVal = status === 'closed' ? closedBy : undefined;

  if (isDbConfigured() && pool) {
    const record = await periodCloseRepo.upsertPeriodClose(
      pool,
      tenantId,
      periodLabel,
      status,
      closedAt,
      closedByVal
    );
    return { record, preCloseChecked: status === 'closed' };
  }
  const k = key(tenantId, periodLabel);
  let rec = store.get(k);
  if (!rec) {
    rec = { tenantId, periodLabel, status: 'draft', createdAt: now, updatedAt: now };
  }
  rec = { ...rec, status, updatedAt: now, closedAt, closedBy: closedByVal };
  store.set(k, rec);
  return { record: rec, preCloseChecked: status === 'closed' };
}

/**
 * Set reviewer sign-off (second signer) for a period close.
 */
export async function setReviewerSignOff(
  tenantId: string,
  periodLabel: string,
  reviewedBy: string,
  pool?: Pool
): Promise<PeriodCloseRecord | undefined> {
  const now = new Date().toISOString();
  if (isDbConfigured() && pool) {
    const record = await periodCloseRepo.setReviewerSignOff(pool, tenantId, periodLabel, reviewedBy);
    return record ?? undefined;
  }
  const k = key(tenantId, periodLabel);
  const rec = store.get(k);
  if (!rec) return undefined;
  const updated = { ...rec, reviewedAt: now, reviewedBy, updatedAt: now };
  store.set(k, updated);
  return updated;
}
