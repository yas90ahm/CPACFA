/**
 * High-Value Escalation (HITL) — Human-in-the-Loop orchestrator.
 *
 * 1. Thresholds: Any transaction/journal entry over $X (e.g. $10,000) or any change to
 *    Critical Accounting Policies requires a human signature.
 * 2. Staging Area: Bot presents "Proposed Action" and "Justification"; items stay Pending until approved.
 * 3. Approval Flow: Bot remains in Pending until webhook returns HumanApproved signal.
 * 4. Feedback Loop: If human rejects, the AI must ask "Why?" and update Context Memory to avoid the same mistake twice.
 *
 * When pool and tenantId are provided, staging is persisted to Postgres (persistence_service); otherwise in-memory.
 */

import type { Pool } from 'pg';
import * as persistence from './persistence_service.js';

// --- Default threshold (configurable) ---

const DEFAULT_AMOUNT_THRESHOLD = 10_000;

/** High-Value Escalation config */
export interface HitlThresholds {
  /** Any transaction or journal entry over this amount (absolute) requires human signature. */
  amountThreshold: number;
  /** If true, any change to Critical Accounting Policies requires human signature. */
  criticalPolicyChangeRequiresApproval: boolean;
}

let thresholds: HitlThresholds = {
  amountThreshold: DEFAULT_AMOUNT_THRESHOLD,
  criticalPolicyChangeRequiresApproval: true,
};

export function getThresholds(): HitlThresholds {
  return { ...thresholds };
}

export function setThresholds(next: Partial<HitlThresholds>): void {
  thresholds = { ...thresholds, ...next };
}

/**
 * Whether this action must be escalated to human (staging area + signature).
 */
export function shouldEscalateToHuman(params: {
  amount?: number;
  isCriticalAccountingPolicyChange?: boolean;
}): boolean {
  const { amount, isCriticalAccountingPolicyChange } = params;
  if (amount != null && Math.abs(amount) >= thresholds.amountThreshold) return true;
  if (thresholds.criticalPolicyChangeRequiresApproval && isCriticalAccountingPolicyChange) return true;
  return false;
}

// --- Staging Area ---

export type StagingStatus = 'pending' | 'approved' | 'rejected';

export type StagingItemType = 'journal_entry' | 'policy_change' | 'adjustment' | 'flag_override' | 'other';

export interface StagingItem {
  id: string;
  /** What the bot proposes to do (e.g. "Post journal entry: Dr Expense $12,000, Cr Cash"). */
  proposedAction: string;
  /** Why the bot proposes this (e.g. "Accrual for invoice #X per ASC 606"). */
  justification: string;
  status: StagingStatus;
  type: StagingItemType;
  /** Amount involved (for threshold display). */
  amount?: number;
  /** Optional payload (e.g. debit_account, credit_account, description). */
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** Set when approved via webhook. */
  approvedAt?: string;
  approvedBy?: string;
  /** Set when rejected; reason stored for feedback loop. */
  rejectedAt?: string;
  rejectedReason?: string;
}

export interface HitlPersistenceOptions {
  pool: Pool;
  tenantId: string;
}

const stagingStore = new Map<string, StagingItem>();
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `hitl-${Date.now()}-${idCounter}`;
}

/**
 * Submit a proposed action to the Staging Area. Status is 'pending' until webhook approves/rejects.
 * When opts.pool and opts.tenantId are provided, persists to Postgres; otherwise in-memory.
 */
export function submitToStaging(
  params: {
    proposedAction: string;
    justification: string;
    type?: StagingItemType;
    amount?: number;
    payload?: Record<string, unknown>;
  },
  opts?: HitlPersistenceOptions
): StagingItem | Promise<StagingItem> {
  const itemParams = {
    proposedAction: params.proposedAction,
    justification: params.justification,
    type: params.type,
    amount: params.amount,
    payload: params.payload,
  };
  if (opts?.pool && opts?.tenantId) {
    return persistence.createStagingItem(opts.pool, opts.tenantId, itemParams);
  }
  const id = nextId();
  const now = new Date().toISOString();
  const item: StagingItem = {
    id,
    ...itemParams,
    status: 'pending',
    type: params.type ?? 'other',
    createdAt: now,
    updatedAt: now,
  };
  stagingStore.set(id, item);
  return { ...item };
}

/**
 * Staging Area: list all items (for UI). Filter by status if needed.
 * When options.pool and options.tenantId are provided, uses Postgres; otherwise in-memory.
 */
export async function getStagingArea(
  options?: { status?: StagingStatus; limit?: number } & Partial<HitlPersistenceOptions>
): Promise<StagingItem[]> {
  if (options?.pool && options?.tenantId) {
    return persistence.listStagingItems(options.pool, options.tenantId, {
      status: options.status,
      limit: options.limit,
    });
  }
  let items = Array.from(stagingStore.values());
  if (options?.status) items = items.filter((i) => i.status === options.status);
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = options?.limit ?? 100;
  return items.slice(0, limit).map((i) => ({ ...i }));
}

/** When opts.pool is provided, fetches from Postgres (tenant-scoped); otherwise in-memory. */
export async function getStagingItem(id: string, opts?: { pool?: Pool; tenantId?: string }): Promise<StagingItem | undefined> {
  if (opts?.pool && opts?.tenantId) {
    return persistence.getStagingItem(opts.pool, opts.tenantId, id);
  }
  const item = stagingStore.get(id);
  return item ? { ...item } : undefined;
}

// --- Approval Flow (webhook) ---

export type WebhookSignal = 'HumanApproved' | 'HumanRejected';

export interface ApprovalWebhookPayload {
  id: string;
  signal: WebhookSignal;
  signedBy?: string;
  signatureToken?: string;
  /** Required when signal is HumanRejected: reason for rejection (for feedback loop). */
  rejectionReason?: string;
}

/**
 * Webhook: Human approved. Marks item approved; bot can proceed.
 * When opts.pool is provided, updates in Postgres; otherwise in-memory.
 */
export async function receiveHumanApproval(
  params: { id: string; signedBy?: string; signatureToken?: string },
  opts?: { pool?: Pool; tenantId?: string }
): Promise<{ ok: boolean; item?: StagingItem; error?: string }> {
  if (opts?.pool && opts?.tenantId) {
    const existing = await persistence.getStagingItem(opts.pool, opts.tenantId, params.id);
    if (!existing) return { ok: false, error: 'Staging item not found' };
    if (existing.status !== 'pending') return { ok: false, error: `Item is not pending (status: ${existing.status})` };
    const updated = await persistence.updateStagingStatus(opts.pool, opts.tenantId, params.id, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: params.signedBy,
    });
    return { ok: true, item: updated };
  }
  const item = stagingStore.get(params.id);
  if (!item) return { ok: false, error: 'Staging item not found' };
  if (item.status !== 'pending') return { ok: false, error: `Item is not pending (status: ${item.status})` };
  const now = new Date().toISOString();
  item.status = 'approved';
  item.updatedAt = now;
  item.approvedAt = now;
  item.approvedBy = params.signedBy;
  return { ok: true, item: { ...item } };
}

/**
 * Webhook: Human rejected. Marks item rejected and records reason for feedback loop.
 * When opts.pool is provided, updates in Postgres; otherwise in-memory.
 */
export async function receiveHumanRejection(
  params: { id: string; rejectionReason: string },
  opts?: { pool?: Pool; tenantId?: string }
): Promise<{ ok: boolean; item?: StagingItem; error?: string }> {
  const reason = params.rejectionReason?.trim() || 'No reason provided';
  if (opts?.pool && opts?.tenantId) {
    const existing = await persistence.getStagingItem(opts.pool, opts.tenantId, params.id);
    if (!existing) return { ok: false, error: 'Staging item not found' };
    if (existing.status !== 'pending') return { ok: false, error: `Item is not pending (status: ${existing.status})` };
    const updated = await persistence.updateStagingStatus(opts.pool, opts.tenantId, params.id, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedReason: reason,
    });
    recordRejectionFeedback(params.id, reason, existing);
    return { ok: true, item: updated };
  }
  const item = stagingStore.get(params.id);
  if (!item) return { ok: false, error: 'Staging item not found' };
  if (item.status !== 'pending') return { ok: false, error: `Item is not pending (status: ${item.status})` };
  const now = new Date().toISOString();
  item.status = 'rejected';
  item.updatedAt = now;
  item.rejectedAt = now;
  item.rejectedReason = reason;
  recordRejectionFeedback(params.id, item.rejectedReason, item);
  return { ok: true, item: { ...item } };
}

/**
 * Handle webhook payload (HumanApproved or HumanRejected).
 */
export async function handleApprovalWebhook(
  payload: ApprovalWebhookPayload,
  opts?: { pool?: Pool; tenantId?: string }
): Promise<{ ok: boolean; item?: StagingItem; error?: string }> {
  if (payload.signal === 'HumanApproved') {
    return receiveHumanApproval(
      { id: payload.id, signedBy: payload.signedBy, signatureToken: payload.signatureToken },
      opts ? { pool: opts.pool, tenantId: opts.tenantId } : undefined
    );
  }
  if (payload.signal === 'HumanRejected') {
    return receiveHumanRejection(
      { id: payload.id, rejectionReason: payload.rejectionReason ?? 'No reason provided' },
      opts ? { pool: opts.pool, tenantId: opts.tenantId } : undefined
    );
  }
  return { ok: false, error: `Unknown signal: ${payload.signal}` };
}

// --- Feedback Loop: Context Memory ---

export interface RejectionFeedback {
  id: string;
  stagingItemId: string;
  reason: string;
  /** Snapshot of proposedAction so AI can avoid repeating same pattern. */
  proposedActionPreview: string;
  createdAt: string;
}

const contextMemory: RejectionFeedback[] = [];
const MAX_CONTEXT_MEMORY = 500;

/**
 * When a human rejects, the AI must ask "Why?" — the reason is stored here and in the staging item.
 * Update Context Memory so the AI can avoid making the same mistake twice.
 */
export function recordRejectionFeedback(stagingItemId: string, reason: string, item: StagingItem): void {
  contextMemory.push({
    id: `fb-${Date.now()}-${contextMemory.length}`,
    stagingItemId,
    reason,
    proposedActionPreview: item.proposedAction.slice(0, 500),
    createdAt: new Date().toISOString(),
  });
  if (contextMemory.length > MAX_CONTEXT_MEMORY) contextMemory.splice(0, contextMemory.length - MAX_CONTEXT_MEMORY);
}

/**
 * Get Context Memory (rejection history) so the AI can avoid repeating the same mistake.
 */
export function getContextMemory(options?: { limit?: number }): RejectionFeedback[] {
  const limit = options?.limit ?? 100;
  return contextMemory.slice(-limit).map((f) => ({ ...f }));
}

/**
 * Prompt snippet for the AI: "Why?" after rejection — and instruction to use Context Memory.
 */
export const FEEDBACK_LOOP_PROMPT = `If a human rejected your proposed action, you must ask "Why?" and record the reason. Update your internal Context Memory so you do not make the same mistake twice. Use getContextMemory() to retrieve past rejection reasons when proposing similar actions.`;
