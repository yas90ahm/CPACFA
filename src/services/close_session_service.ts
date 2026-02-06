/**
 * Close session service: create, get, list, update status, certify.
 * Enforces allowed status transitions; certification is the gate before export.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { CloseSession, CloseSessionStatus, CreateCloseSessionInput, ListCloseSessionsInput } from '../types/close_session.js';
import type { CloseRole } from '../types/close_and_controls.js';
import * as repo from '../db/repositories/close_session_repository.js';
import { computeReadiness } from './close_checklist_readiness_service.js';
import { canPerform } from './segregation_service.js';
import { recordMaterialEvent } from './audit_ledger_service.js';
import { getAdjustedTrialBalance } from './adjusted_trial_balance_service.js';
import { createSnapshotFromTrialBalanceAndEntries } from './ledger_snapshot_service.js';
import { buildCertifiedStatementsFromSnapshot } from './certified_statements_service.js';
import type { LedgerSnapshotPayload } from '../types/ledger_snapshot.js';

const ALLOWED_TRANSITIONS: Record<CloseSessionStatus, CloseSessionStatus[]> = {
  draft: ['in_progress'],
  in_progress: ['draft', 'ready_for_review'],
  ready_for_review: ['in_progress', 'finalized'],
  finalized: ['ready_for_review', 'locked'],
  locked: ['certified'],
  certified: [],
};

export class CloseSessionError extends Error {
  constructor(
    message: string,
    public readonly code: 'OVERLAP' | 'INVALID_TRANSITION' | 'NOT_FOUND' | 'VALIDATION' | 'INSUFFICIENT_ROLE' | 'NOT_LOCKED' | 'HARD_BLOCKERS'
  ) {
    super(message);
    this.name = 'CloseSessionError';
  }
}

export async function createSession(
  pool: Pool,
  input: CreateCloseSessionInput
): Promise<CloseSession> {
  const basis = input.basis ?? 'accrual';
  const standard = input.standard ?? 'GAAP';
  const status = input.status ?? 'draft';
  if (basis !== 'cash' && basis !== 'accrual') {
    throw new CloseSessionError('basis must be cash or accrual', 'VALIDATION');
  }
  if (status !== 'draft' && status !== 'in_progress' && status !== 'ready_for_review' && status !== 'finalized' && status !== 'locked' && status !== 'certified') {
    throw new CloseSessionError('invalid status', 'VALIDATION');
  }
  const overlapping = await repo.hasOverlappingSession(
    pool,
    input.tenantId,
    input.entityId,
    input.periodStart,
    input.periodEnd
  );
  if (overlapping) {
    throw new CloseSessionError(
      'Overlapping session exists for same tenant and entity',
      'OVERLAP'
    );
  }
  const id = randomUUID();
  return repo.insertCloseSession(
    pool,
    id,
    input.tenantId,
    input.entityId,
    input.periodStart,
    input.periodEnd,
    basis,
    standard,
    status
  );
}

export interface CreateSessionResult {
  session: CloseSession;
  created: boolean;
}

/** Idempotent create: return existing session for same tenant+entity+period with 200, or new session with 201. */
export async function createSessionOrGetExisting(
  pool: Pool,
  input: CreateCloseSessionInput
): Promise<CreateSessionResult> {
  const existing = await repo.getOverlappingSession(
    pool,
    input.tenantId,
    input.entityId,
    input.periodStart,
    input.periodEnd
  );
  if (existing) {
    return { session: existing, created: false };
  }
  const session = await createSession(pool, input);
  return { session, created: true };
}

export async function getSession(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<CloseSession | null> {
  return repo.getCloseSessionById(pool, tenantId, id);
}

export async function listSessions(
  pool: Pool,
  input: ListCloseSessionsInput
): Promise<CloseSession[]> {
  return repo.listCloseSessions(pool, input.tenantId, input.entityId, input.status);
}

export async function updateStatus(
  pool: Pool,
  tenantId: string,
  id: string,
  newStatus: CloseSessionStatus
): Promise<CloseSession> {
  const current = await repo.getCloseSessionById(pool, tenantId, id);
  if (!current) {
    throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  }
  const allowed = ALLOWED_TRANSITIONS[current.status];
  if (!allowed?.includes(newStatus)) {
    throw new CloseSessionError(
      `Transition from ${current.status} to ${newStatus} is not allowed`,
      'INVALID_TRANSITION'
    );
  }
  const updated = await repo.updateCloseSessionStatus(pool, tenantId, id, newStatus);
  if (!updated) {
    throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  }
  return updated;
}

export function getAllowedTransitions(from: CloseSessionStatus): CloseSessionStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

export interface CertifyCloseInput {
  tenantId: string;
  closeSessionId: string;
  certifiedBy: string;
  periodLabel?: string;
  memo?: string;
}

/**
 * Certify a close session: only from locked, no hard blockers, approver role.
 * Sets status to certified and records certify_close in audit ledger.
 */
export async function certifyCloseSession(
  pool: Pool,
  input: CertifyCloseInput,
  actorRole: CloseRole
): Promise<CloseSession> {
  const session = await repo.getCloseSessionById(pool, input.tenantId, input.closeSessionId);
  if (!session) {
    throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  }
  if (session.status !== 'locked') {
    throw new CloseSessionError(
      `Certification only allowed from locked; current status is ${session.status}`,
      'NOT_LOCKED'
    );
  }
  const readiness = await computeReadiness(pool, input.tenantId, session);
  if (readiness.hardBlockers.length > 0) {
    throw new CloseSessionError(
      `Cannot certify: ${readiness.hardBlockers.join('; ')}`,
      'HARD_BLOCKERS'
    );
  }
  if (!canPerform(actorRole, 'certify_close')) {
    throw new CloseSessionError('Insufficient role: certify_close requires approver', 'INSUFFICIENT_ROLE');
  }
  const periodLabel = input.periodLabel ?? session.periodEnd.slice(0, 7);

  // Create ledger snapshot at certification so binder/export have a certified source of truth.
  let adjustedEntries: Awaited<ReturnType<typeof getAdjustedTrialBalance>>;
  try {
    adjustedEntries = await getAdjustedTrialBalance(
      input.tenantId,
      periodLabel,
      pool,
      input.closeSessionId
    );
  } catch (_e) {
    throw new CloseSessionError(
      'No trial balance for period; run ingest or resolve staging before certifying.',
      'VALIDATION'
    );
  }
  const totalDebits = adjustedEntries.reduce((s, e) => s + (e.debit ?? 0), 0);
  const totalCredits = adjustedEntries.reduce((s, e) => s + (e.credit ?? 0), 0);
  const snapshotPayload: LedgerSnapshotPayload = {
    trialBalance: {
      entries: adjustedEntries.map((e) => ({
        accountName: e.accountName,
        debit: e.debit ?? 0,
        credit: e.credit ?? 0,
        ...(e.accountCode != null && { accountCode: e.accountCode }),
        ...(e.lineId != null && e.lineId !== '' && { lineId: e.lineId }),
      })),
      totalDebits,
      totalCredits,
    },
  };
  try {
    buildCertifiedStatementsFromSnapshot(snapshotPayload);
  } catch (_e) {
    throw new CloseSessionError(
      'Trial balance does not pass integrity check (Truth Gate). Fix imbalance or balance sheet equation before certifying.',
      'VALIDATION'
    );
  }
  const snapshot = await createSnapshotFromTrialBalanceAndEntries(pool, {
    tenantId: input.tenantId,
    periodLabel,
    closeSessionId: input.closeSessionId,
    createdBy: input.certifiedBy,
    source: 'close_session',
    trialBalance: {
      entries: snapshotPayload.trialBalance.entries.map((e) => ({
        accountName: e.accountName,
        debit: e.debit,
        credit: e.credit,
        ...(e.accountCode != null && { accountCode: e.accountCode }),
      })),
      totalDebits: snapshotPayload.trialBalance.totalDebits,
      totalCredits: snapshotPayload.trialBalance.totalCredits,
    },
  });

  const certifiedAt = new Date().toISOString();
  const updated = await repo.updateCertification(
    pool,
    input.tenantId,
    input.closeSessionId,
    input.certifiedBy,
    certifiedAt,
    input.memo,
    snapshot.id
  );
  if (!updated) {
    throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  }
  await recordMaterialEvent(pool, {
    tenantId: input.tenantId,
    periodLabel,
    eventType: 'certify_close',
    deterministicFlagSnapshot: {
      closeSessionId: input.closeSessionId,
      certifiedBy: input.certifiedBy,
      certifiedAt,
      certificationMemo: input.memo,
      certifiedSnapshotId: snapshot.id,
    },
    createdBy: input.certifiedBy,
  });
  return updated;
}
