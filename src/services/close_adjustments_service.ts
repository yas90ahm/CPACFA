/**
 * Unified close adjustments queue: merge JE suggestions (from gaps/rec) + accrual suggestions;
 * each item has status pending / approved / rejected / posted.
 * Uses tenant pool when DATABASE_URL is set and pool is provided; otherwise in-memory.
 */

import type { Pool } from 'pg';
import type { CloseAdjustment, CloseAdjustmentStatus } from '../types/close_and_controls.js';
import type { JournalEntrySuggestion } from '../types/close_and_controls.js';
import type { AccrualSuggestion } from '../types/accrual_deferral.js';
import { validateJEProvenance } from '../types/amount_provenance.js';
import { isDbConfigured } from '../db/index.js';
import * as adjRepo from '../db/repositories/close_adjustment_repository.js';

/** Thrown when a JE suggestion has non-zero amounts without valid amountProvenance (Advisor scope). */
export class ProvenanceValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('; '));
    this.name = 'ProvenanceValidationError';
    Object.setPrototypeOf(this, ProvenanceValidationError.prototype);
  }
}

const store = new Map<string, CloseAdjustment>();
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `adj-${Date.now()}-${idCounter}`;
}

/**
 * Add JE suggestions to the adjustments queue (status pending).
 * When DB is configured and pool provided, tenantId is required.
 */
export async function addJEAsAdjustments(
  periodLabel: string,
  suggestions: JournalEntrySuggestion[],
  tenantId?: string,
  pool?: Pool
): Promise<CloseAdjustment[]> {
  for (const s of suggestions) {
    const result = validateJEProvenance(s);
    if (!result.valid) throw new ProvenanceValidationError(result.errors);
  }
  if (isDbConfigured() && tenantId && pool) {
    const added: CloseAdjustment[] = [];
    for (const s of suggestions) {
      const adj = await adjRepo.createAdjustment(pool, tenantId, {
        periodLabel,
        source: s.source,
        description: s.description,
        debits: s.debits ?? [],
        credits: s.credits ?? [],
        sourceDetail: s.sourceDetail,
        status: 'pending',
      });
      added.push(adj);
    }
    return added;
  }
  const now = new Date().toISOString();
  const added: CloseAdjustment[] = [];
  for (const s of suggestions) {
    const id = nextId();
    const adj: CloseAdjustment = {
      id,
      periodLabel,
      source: s.source,
      description: s.description,
      debits: s.debits ?? [],
      credits: s.credits ?? [],
      sourceDetail: s.sourceDetail,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    store.set(id, adj);
    added.push({ ...adj });
  }
  return added;
}

/**
 * Add accrual suggestions to the adjustments queue (status pending).
 * When DB is configured and pool provided, tenantId is required.
 */
export async function addAccrualsAsAdjustments(
  periodLabel: string,
  suggestions: AccrualSuggestion[],
  tenantId?: string,
  pool?: Pool
): Promise<CloseAdjustment[]> {
  if (isDbConfigured() && tenantId && pool) {
    const added: CloseAdjustment[] = [];
    for (const s of suggestions) {
      const adj = await adjRepo.createAdjustment(pool, tenantId, {
        periodLabel,
        source: 'accrual',
        description: s.description,
        debits: s.debitAccount ? [{ account: s.debitAccount, amount: s.amount }] : [],
        credits: s.creditAccount ? [{ account: s.creditAccount, amount: s.amount }] : [],
        sourceDetail: s.sourceDetail,
        status: 'pending',
      });
      added.push(adj);
    }
    return added;
  }
  const now = new Date().toISOString();
  const added: CloseAdjustment[] = [];
  for (const s of suggestions) {
    const id = nextId();
    const adj: CloseAdjustment = {
      id,
      periodLabel,
      source: 'accrual',
      description: s.description,
      debits: s.debitAccount ? [{ account: s.debitAccount, amount: s.amount }] : [],
      credits: s.creditAccount ? [{ account: s.creditAccount, amount: s.amount }] : [],
      sourceDetail: s.sourceDetail,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    store.set(id, adj);
    added.push({ ...adj });
  }
  return added;
}

/**
 * Get a single adjustment by id.
 */
export async function getAdjustment(
  pool: Pool | undefined,
  id: string,
  tenantId: string
): Promise<CloseAdjustment | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const adj = await adjRepo.getAdjustment(pool, id, tenantId);
    return adj ?? undefined;
  }
  return store.get(id);
}

/**
 * List adjustments for a period, optionally by status.
 * When DB is configured and pool provided, tenantId is required.
 */
export async function listAdjustments(
  params: { periodLabel?: string; status?: CloseAdjustmentStatus },
  tenantId?: string,
  pool?: Pool
): Promise<CloseAdjustment[]> {
  if (isDbConfigured() && tenantId && pool) {
    let list = await adjRepo.listAdjustments(pool, tenantId, params.periodLabel);
    if (params.status) list = list.filter((a) => a.status === params.status);
    return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  let list = Array.from(store.values());
  if (params.periodLabel) list = list.filter((a) => a.periodLabel === params.periodLabel);
  if (params.status) list = list.filter((a) => a.status === params.status);
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Update adjustment status (approved / rejected / posted).
 * When posting, optional patchOverride can provide postedAt and postedExternalId (e.g. after push to GL).
 * When DB is configured and pool provided, tenantId is required.
 */
export async function updateAdjustmentStatus(
  id: string,
  status: CloseAdjustmentStatus,
  actor?: string,
  tenantId?: string,
  pool?: Pool,
  patchOverride?: { postedAt?: string; postedExternalId?: string }
): Promise<CloseAdjustment | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const now = new Date().toISOString();
    const patch =
      status === 'approved' || status === 'rejected'
        ? { approvedBy: actor, approvedAt: now }
        : status === 'posted'
          ? { postedAt: patchOverride?.postedAt ?? now, postedExternalId: patchOverride?.postedExternalId }
          : undefined;
    const result = await adjRepo.updateAdjustmentStatus(pool, id, tenantId, status, patch ?? undefined);
    return result ?? undefined;
  }
  const adj = store.get(id);
  if (!adj) return undefined;
  const now = new Date().toISOString();
  adj.status = status;
  adj.updatedAt = now;
  if (status === 'approved' || status === 'rejected') {
    adj.approvedBy = actor;
    adj.approvedAt = now;
  }
  if (status === 'posted') {
    adj.postedAt = patchOverride?.postedAt ?? now;
    if (patchOverride?.postedExternalId) adj.postedExternalId = patchOverride.postedExternalId;
  }
  return { ...adj };
}
