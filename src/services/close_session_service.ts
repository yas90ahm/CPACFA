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
  const certifiedAt = new Date().toISOString();
  const updated = await repo.updateCertification(
    pool,
    input.tenantId,
    input.closeSessionId,
    input.certifiedBy,
    certifiedAt,
    input.memo
  );
  if (!updated) {
    throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  }
  const periodLabel = input.periodLabel ?? updated.periodEnd.slice(0, 7);
  await recordMaterialEvent(pool, {
    tenantId: input.tenantId,
    periodLabel,
    eventType: 'certify_close',
    deterministicFlagSnapshot: {
      closeSessionId: input.closeSessionId,
      certifiedBy: input.certifiedBy,
      certifiedAt,
      certificationMemo: input.memo,
    },
    createdBy: input.certifiedBy,
  });
  return updated;
}
