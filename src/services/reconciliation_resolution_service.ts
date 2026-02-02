/**
 * FW1: Reconciliation resolution workflow — assignee, due date, re-run when done.
 * Uses tenant DB when pool/tenantId provided; else in-memory.
 */

import type { Pool } from 'pg';
import type { ReconciliationResolution } from '../types/close_and_controls.js';
import { isDbConfigured } from '../db/index.js';
import * as recRepo from '../db/repositories/reconciliation_resolution_repository.js';

const store = new Map<string, ReconciliationResolution>();

function nextId(): string {
  return `rec-res-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface CreateReconciliationResolutionInput {
  periodLabel: string;
  reconciliationType: ReconciliationResolution['reconciliationType'];
  passed: boolean;
  message?: string;
  detail?: string;
  assignee?: string;
  dueDate?: string;
}

/**
 * Create a reconciliation resolution record. When pool/tenantId present, uses tenant DB.
 */
export async function createReconciliationResolution(
  input: CreateReconciliationResolutionInput,
  tenantId?: string,
  pool?: Pool
): Promise<ReconciliationResolution> {
  if (isDbConfigured() && tenantId && pool) {
    return recRepo.createResolution(pool, tenantId, input);
  }
  const now = new Date().toISOString();
  const id = nextId();
  const resolution: ReconciliationResolution = {
    id,
    periodLabel: input.periodLabel,
    reconciliationType: input.reconciliationType,
    passed: input.passed,
    message: input.message,
    detail: input.detail,
    assignee: input.assignee,
    dueDate: input.dueDate,
    status: input.passed ? 'resolved' : 'open',
    createdAt: now,
    updatedAt: now,
    ...(input.passed ? { resolvedAt: now, resolvedBy: 'system' } : {}),
  };
  store.set(id, resolution);
  return { ...resolution };
}

/**
 * List reconciliation resolutions. When pool/tenantId present, uses tenant DB.
 */
export async function listReconciliationResolutions(
  options?: {
    periodLabel?: string;
    status?: ReconciliationResolution['status'];
    reconciliationType?: ReconciliationResolution['reconciliationType'];
    limit?: number;
  },
  tenantId?: string,
  pool?: Pool
): Promise<ReconciliationResolution[]> {
  if (isDbConfigured() && tenantId && pool) {
    return recRepo.listResolutions(pool, tenantId, options);
  }
  let items = Array.from(store.values());
  if (options?.periodLabel) items = items.filter((r) => r.periodLabel === options.periodLabel);
  if (options?.status) items = items.filter((r) => r.status === options.status);
  if (options?.reconciliationType)
    items = items.filter((r) => r.reconciliationType === options.reconciliationType);
  const limit = options?.limit ?? 100;
  return items.slice(-limit).map((r) => ({ ...r }));
}

/**
 * Update resolution status. When pool/tenantId present, uses tenant DB.
 */
export async function updateReconciliationResolution(
  id: string,
  patch: {
    assignee?: string;
    dueDate?: string;
    status?: ReconciliationResolution['status'];
    resolvedBy?: string;
    waivedBy?: string;
    waivedReason?: string;
  },
  tenantId?: string,
  pool?: Pool
): Promise<ReconciliationResolution | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const out = await recRepo.updateResolution(pool, id, tenantId, patch);
    return out ?? undefined;
  }
  const resolution = store.get(id);
  if (!resolution) return undefined;
  const now = new Date().toISOString();
  resolution.assignee = patch.assignee ?? resolution.assignee;
  resolution.dueDate = patch.dueDate ?? resolution.dueDate;
  resolution.status = patch.status ?? resolution.status;
  resolution.updatedAt = now;
  if (patch.status === 'resolved' && !resolution.resolvedAt) {
    resolution.resolvedAt = now;
    resolution.resolvedBy = patch.resolvedBy ?? resolution.resolvedBy;
  }
  if (patch.status === 'waived') {
    resolution.waivedAt = now;
    resolution.waivedBy = patch.waivedBy;
    resolution.waivedReason = patch.waivedReason;
  }
  return { ...resolution };
}

/**
 * Get a single resolution by id. When pool/tenantId present, uses tenant DB.
 */
export async function getReconciliationResolution(
  id: string,
  tenantId?: string,
  pool?: Pool
): Promise<ReconciliationResolution | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const r = await recRepo.getResolution(pool, id, tenantId);
    return r ?? undefined;
  }
  const r = store.get(id);
  return r ? { ...r } : undefined;
}
