/**
 * Reconciliation state machine service: runs, items, match groups, exceptions, signoffs.
 * createReconRun, ingestReconItems, proposeMatches, confirmMatchGroup, markTimingDifference,
 * and issue emission for critical unmatched cash above materiality.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type {
  ReconRun,
  ReconItem,
  ReconMatchGroup,
  ReconException,
  ReconSignoff,
  ReconRunType,
  ReconRunStatus,
  IngestReconItemInput,
  ProposeMatchInput,
} from '../types/recon.js';
import * as repo from '../db/repositories/recon_repository.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { createIssueForSession } from './issue_service.js';
import { getLatestTriage } from './triage_service.js';
import { recordMaterialEvent } from './audit_service.js';

export class ReconError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT'
  ) {
    super(message);
    this.name = 'ReconError';
  }
}

/** Create a reconciliation run tied to close_session_id. */
export async function createReconRun(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  type: ReconRunType,
  status: ReconRunStatus = 'draft'
): Promise<ReconRun> {
  const id = randomUUID();
  return repo.insertReconRun(pool, tenantId, id, closeSessionId, type, status);
}

/** Ingest one or more reconciliation items into a run. */
export async function ingestReconItems(
  pool: Pool,
  tenantId: string,
  reconRunId: string,
  items: IngestReconItemInput[]
): Promise<ReconItem[]> {
  const run = await repo.getReconRunById(pool, tenantId, reconRunId);
  if (!run) throw new ReconError('Recon run not found', 'NOT_FOUND');
  const created: ReconItem[] = [];
  for (const input of items) {
    const id = randomUUID();
    const item = await repo.insertReconItem(pool, tenantId, id, reconRunId, input);
    created.push(item);
  }
  await repo.updateReconRunStatus(pool, tenantId, reconRunId, 'in_progress');
  return created;
}

/** Propose a match group (e.g. from bank feed matching). Links to decision_record_id when provided. */
export async function proposeMatches(
  pool: Pool,
  tenantId: string,
  reconRunId: string,
  input: ProposeMatchInput
): Promise<ReconMatchGroup> {
  const run = await repo.getReconRunById(pool, tenantId, reconRunId);
  if (!run) throw new ReconError('Recon run not found', 'NOT_FOUND');
  if (!input.reconItemIds.length) throw new ReconError('At least one recon item required', 'VALIDATION');
  const groupId = randomUUID();
  await repo.insertReconMatchGroup(pool, tenantId, groupId, reconRunId, {
    status: 'proposed',
    matchConfidence: input.matchConfidence,
    decisionRecordId: input.decisionRecordId,
  });
  for (const itemId of input.reconItemIds) {
    await repo.insertReconMatchGroupItem(pool, groupId, itemId);
  }
  const group = await repo.getReconMatchGroupById(pool, tenantId, groupId);
  if (!group) throw new ReconError('Match group not found after insert', 'NOT_FOUND');
  return group;
}

/** Confirm a proposed match group. */
export async function confirmMatchGroup(pool: Pool, tenantId: string, matchGroupId: string): Promise<ReconMatchGroup> {
  const group = await repo.getReconMatchGroupById(pool, tenantId, matchGroupId);
  if (!group) throw new ReconError('Match group not found', 'NOT_FOUND');
  if (group.status !== 'proposed') throw new ReconError('Only proposed groups can be confirmed', 'VALIDATION');
  await repo.updateReconMatchGroupStatus(pool, tenantId, matchGroupId, 'confirmed');
  const updated = await repo.getReconMatchGroupById(pool, tenantId, matchGroupId);
  return updated!;
}

/** Reject a proposed match group. */
export async function rejectMatchGroup(pool: Pool, tenantId: string, matchGroupId: string): Promise<ReconMatchGroup> {
  const group = await repo.getReconMatchGroupById(pool, tenantId, matchGroupId);
  if (!group) throw new ReconError('Match group not found', 'NOT_FOUND');
  if (group.status !== 'proposed') throw new ReconError('Only proposed groups can be rejected', 'VALIDATION');
  await repo.updateReconMatchGroupStatus(pool, tenantId, matchGroupId, 'rejected');
  const updated = await repo.getReconMatchGroupById(pool, tenantId, matchGroupId);
  return updated!;
}

/** Mark items as a timing difference (creates exception; optionally link issue). */
export async function markTimingDifference(
  pool: Pool,
  tenantId: string,
  reconRunId: string,
  reason: string,
  linkedIssueId?: string
): Promise<ReconException> {
  const run = await repo.getReconRunById(pool, tenantId, reconRunId);
  if (!run) throw new ReconError('Recon run not found', 'NOT_FOUND');
  const id = randomUUID();
  return repo.insertReconException(pool, tenantId, id, reconRunId, {
    reason,
    status: 'open',
    linkedIssueId,
  });
}

/** Sign off on a recon run. */
export async function signOffReconRun(
  pool: Pool,
  tenantId: string,
  reconRunId: string,
  signedBy: string,
  notes?: string
): Promise<ReconSignoff> {
  const run = await repo.getReconRunById(pool, tenantId, reconRunId);
  if (!run) throw new ReconError('Recon run not found', 'NOT_FOUND');
  const signoff = await repo.upsertReconSignoff(pool, tenantId, reconRunId, signedBy, notes);
  await repo.updateReconRunStatus(pool, tenantId, reconRunId, 'signed_off');
  const periodLabel = (await getCloseSessionById(pool, tenantId, run.closeSessionId))?.periodEnd?.slice(0, 7);
  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel,
    eventType: 'recon_signoff',
    deterministicFlagSnapshot: {
      reconRunId,
      closeSessionId: run.closeSessionId,
      signedBy,
      runType: run.type,
    },
    createdBy: signedBy,
  });
  return signoff;
}

/** Get recon run by id. */
export async function getReconRun(pool: Pool, tenantId: string, id: string): Promise<ReconRun | null> {
  return repo.getReconRunById(pool, tenantId, id);
}

/** List recon runs for a close session (optionally by type). */
export async function listReconRunsByCloseSession(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  type?: ReconRunType
): Promise<ReconRun[]> {
  return repo.listReconRunsByCloseSession(pool, tenantId, closeSessionId, type);
}

/** List items for a recon run. */
export async function listReconItemsByRunId(pool: Pool, tenantId: string, reconRunId: string): Promise<ReconItem[]> {
  return repo.listReconItemsByRunId(pool, tenantId, reconRunId);
}

/** List match groups for a recon run. */
export async function listReconMatchGroupsByRunId(pool: Pool, tenantId: string, reconRunId: string): Promise<ReconMatchGroup[]> {
  return repo.listReconMatchGroupsByRunId(pool, tenantId, reconRunId);
}

/** Return recon_item ids that are not in any match group (confirmed or proposed). */
export async function getUnmatchedReconItemIds(pool: Pool, tenantId: string, reconRunId: string): Promise<string[]> {
  const items = await repo.listReconItemsByRunId(pool, tenantId, reconRunId);
  const matched = new Set<string>();
  const groups = await repo.listReconMatchGroupsByRunId(pool, tenantId, reconRunId);
  for (const g of groups) {
    if (g.status === 'proposed' || g.status === 'confirmed') {
      const itemIds = await repo.listReconMatchGroupItemIds(pool, tenantId, g.id);
      itemIds.forEach((id) => matched.add(id));
    }
  }
  return items.filter((i) => !matched.has(i.id)).map((i) => i.id);
}

/** Get unmatched items with full records (for issue emission). */
export async function getUnmatchedReconItems(pool: Pool, tenantId: string, reconRunId: string): Promise<ReconItem[]> {
  const items = await repo.listReconItemsByRunId(pool, tenantId, reconRunId);
  const matched = new Set<string>();
  const groups = await repo.listReconMatchGroupsByRunId(pool, tenantId, reconRunId);
  for (const g of groups) {
    if (g.status === 'proposed' || g.status === 'confirmed') {
      const itemIds = await repo.listReconMatchGroupItemIds(pool, tenantId, g.id);
      itemIds.forEach((id) => matched.add(id));
    }
  }
  return items.filter((i) => !matched.has(i.id));
}

/**
 * Emit issue items for unmatched cash above materiality.
 * Uses triage materiality for the close session when materialityThreshold not provided.
 */
export async function emitIssuesForUnmatchedAboveMateriality(
  pool: Pool,
  opts: {
    reconRunId: string;
    closeSessionId: string;
    tenantId: string;
    materialityThreshold?: number;
    currency?: string;
    createdBy?: string;
  }
): Promise<{ issueId: string; reconItemId: string; amount: number }[]> {
  const run = await repo.getReconRunById(pool, opts.tenantId, opts.reconRunId);
  if (!run) throw new ReconError('Recon run not found', 'NOT_FOUND');
  let threshold = opts.materialityThreshold;
  if (threshold == null || threshold <= 0) {
    const triage = await getLatestTriage(pool, opts.tenantId, opts.closeSessionId);
    threshold = triage?.materialityThreshold ?? 0;
  }
  const unmatched = await getUnmatchedReconItems(pool, opts.tenantId, opts.reconRunId);
  const emitted: { issueId: string; reconItemId: string; amount: number }[] = [];
  for (const item of unmatched) {
    const absAmount = Math.abs(Number(item.amount));
    if (absAmount <= threshold) continue;
    const issue = await createIssueForSession(pool, {
      closeSessionId: opts.closeSessionId,
      tenantId: opts.tenantId,
      category: 'reconciliation',
      severity: 'critical',
      title: `Unmatched reconciliation item above materiality: ${item.description ?? item.id}`,
      description: `Recon run ${opts.reconRunId}; item ${item.id}; amount ${item.amount}; source ${item.source}.`,
      sourceRef: { reconRunId: opts.reconRunId, reconItemId: item.id, source: item.source, amount: item.amount, threshold },
      createdBy: opts.createdBy ?? undefined,
    });
    emitted.push({ issueId: issue.issueId, reconItemId: item.id, amount: Number(item.amount) });
  }
  return emitted;
}
