/**
 * Close session service: create, get, list, update status, certify.
 * Enforces allowed status transitions; certification is the gate before export.
 */

import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import type { CloseSession, CloseSessionStatus, CreateCloseSessionInput, ListCloseSessionsInput } from '../types/close_session.js';
import type { CloseRole } from '../types/close_and_controls.js';
import * as repo from '../db/repositories/close_session_repository.js';
import { computeReadiness } from './close_checklist_readiness_service.js';
import { canPerform } from './segregation_service.js';
import { recordMaterialEvent } from './audit_ledger_service.js';
import { getAdjustedTrialBalance } from './adjusted_trial_balance_service.js';
import { createSnapshotFromTrialBalanceAndEntries } from './ledger_snapshot_service.js';
import { buildEvidenceManifest } from './evidence_manifest_service.js';
import { checkEvidencePolicyForCertification } from './evidence_policy_service.js';
import { withTransaction } from '../db/transaction.js';
import { buildCertifiedStatementsFromSnapshot } from './certified_statements_service.js';
import { buildCertificationArtifact } from './certification_artifact_service.js';
import * as certArtifactRepo from '../db/repositories/certification_artifact_repository.js';
import { verifyChain } from '../db/repositories/audit_ledger_repository.js';
import { sumRound2 } from '../utils/decimal.js';
import type { LedgerSnapshotPayload } from '../types/ledger_snapshot.js';
import { getLedgerSnapshotById } from '../db/repositories/ledger_snapshot_repository.js';

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
    public readonly code: 'OVERLAP' | 'INVALID_TRANSITION' | 'NOT_FOUND' | 'VALIDATION' | 'INSUFFICIENT_ROLE' | 'NOT_LOCKED' | 'HARD_BLOCKERS' | 'NOT_READY' | 'SESSION_DATA_MISSING'
  ) {
    super(message);
    this.name = 'CloseSessionError';
  }
}

/** Used to signal advance blocked by readiness; triggers rollback, caught to return 422-style result. */
class AdvanceBlockedError extends Error {
  constructor(
    public readonly blockers: AdvanceBlocker[],
    public readonly session: CloseSession
  ) {
    super('Advance blocked');
    this.name = 'AdvanceBlockedError';
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

const PERIOD_LABEL_REGEX = /^(\d{4})-(\d{2})$/;

/** Convert periodLabel (YYYY-MM) to periodStart and periodEnd (first and last day of month). Returns null if invalid. */
export function periodLabelToPeriodBounds(periodLabel: string): { periodStart: string; periodEnd: string } | null {
  const trimmed = (periodLabel ?? '').trim();
  const m = trimmed.match(PERIOD_LABEL_REGEX);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  const periodStart = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`;
  return { periodStart, periodEnd };
}

export interface EnsureSessionForPeriodResult {
  session: CloseSession;
  created: boolean;
}

/** Idempotent ensure: find or create a draft close session for (tenantId, entityId, periodLabel). No lock/certify. */
export async function ensureSessionForPeriod(
  pool: Pool,
  tenantId: string,
  entityId: string,
  periodLabel: string
): Promise<EnsureSessionForPeriodResult> {
  const bounds = periodLabelToPeriodBounds(periodLabel);
  if (!bounds) {
    throw new CloseSessionError('periodLabel must be YYYY-MM (e.g. 2025-06)', 'VALIDATION');
  }
  const result = await createSessionOrGetExisting(pool, {
    tenantId,
    entityId,
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    status: 'draft',
  });
  return result;
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
  client: Pool | PoolClient,
  tenantId: string,
  id: string,
  newStatus: CloseSessionStatus
): Promise<CloseSession> {
  const current = await repo.getCloseSessionById(client, tenantId, id);
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
  const updated = await repo.updateCloseSessionStatus(client, tenantId, id, newStatus);
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
    const evidenceCheck = await checkEvidencePolicyForCertification(
      pool,
      input.tenantId,
      input.closeSessionId
    );
    const isEvidenceBlock =
      evidenceCheck.hardBlockers.length > 0 &&
      readiness.hardBlockers.some((m) =>
        evidenceCheck.hardBlockers.some((eb) => eb.message === m)
      );
    throw new CloseSessionError(
      `Cannot certify: ${readiness.hardBlockers.join('; ')}`,
      isEvidenceBlock ? 'NOT_READY' : 'HARD_BLOCKERS'
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
      'No trial balance anchored to session period; run ingest or resolve staging before certifying.',
      'SESSION_DATA_MISSING'
    );
  }
  const totalDebits = sumRound2(adjustedEntries.map((e) => e.debit ?? 0));
  const totalCredits = sumRound2(adjustedEntries.map((e) => e.credit ?? 0));
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
  return withTransaction(pool, async (client) => {
    const lockedSession = await repo.getCloseSessionByIdForUpdate(client, input.tenantId, input.closeSessionId);
    if (!lockedSession) {
      throw new CloseSessionError('Close session not found', 'NOT_FOUND');
    }
    if (lockedSession.status !== 'locked') {
      throw new CloseSessionError(
        `Certification only allowed from locked; current status is ${lockedSession.status}`,
        'NOT_LOCKED'
      );
    }
    const evidenceManifest = await buildEvidenceManifest(client, input.tenantId, input.closeSessionId);
    const snapshot = await createSnapshotFromTrialBalanceAndEntries(client, {
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
      evidenceManifest,
    });

    const certifiedAt = new Date().toISOString();

    let certificationArtifactId: string | null = null;
    const existingArtifact = await certArtifactRepo.existsForCloseSession(client, input.tenantId, input.closeSessionId);
    if (!existingArtifact) {
      const auditChainResult = await verifyChain(client, input.tenantId);
      const { artifact, artifactHash, signatureB64, publicKeyB64, alg } = buildCertificationArtifact({
        tenantId: input.tenantId,
        closeSessionId: input.closeSessionId,
        periodLabel,
        certifiedAt,
        certifiedBy: input.certifiedBy,
        snapshotId: snapshot.id,
        snapshotHash: snapshot.snapshotHash,
        hashVersion: snapshot.hashVersion,
        snapshotPayload: snapshot.snapshotPayloadJson,
        auditChainResult,
      });
      const inserted = await certArtifactRepo.insertCertificationArtifact(client, {
        tenantId: input.tenantId,
        closeSessionId: input.closeSessionId,
        periodLabel,
        artifact,
        artifactHash,
        signatureB64: signatureB64 || '',
        publicKeyB64: publicKeyB64 || '',
        alg,
      });
      certificationArtifactId = inserted.id;
    }

    const updated = await repo.updateCertification(
      client,
      input.tenantId,
      input.closeSessionId,
      input.certifiedBy,
      certifiedAt,
      input.memo,
      snapshot.id,
      certificationArtifactId
    );
    if (!updated) {
      throw new CloseSessionError('Close session not found', 'NOT_FOUND');
    }
    await recordMaterialEvent(client, {
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
  });
}

/** Next status toward locked (draft → … → locked). Returns null when already locked or certified. */
function nextStatusTowardLocked(status: CloseSessionStatus): CloseSessionStatus | null {
  switch (status) {
    case 'draft':
      return 'in_progress';
    case 'in_progress':
      return 'ready_for_review';
    case 'ready_for_review':
      return 'finalized';
    case 'finalized':
      return 'locked';
    case 'locked':
    case 'certified':
      return null;
    default:
      return null;
  }
}

export interface AdvanceBlocker {
  code: string;
  message: string;
  remediation: string;
  details: Record<string, unknown>;
}

export interface AdvanceResultSuccess {
  success: true;
  session: CloseSession;
  statusBefore: CloseSessionStatus;
  statusAfter: CloseSessionStatus;
  actionTaken: 'none' | 'locked' | 'certified';
  result: {
    certifiedSnapshotId: string | null;
    snapshotHash: string | null;
    hashVersion: string | null;
  };
  blockers: AdvanceBlocker[];
}

export interface AdvanceResultFailure {
  success: false;
  session: CloseSession;
  statusBefore: CloseSessionStatus;
  statusAfter: CloseSessionStatus;
  actionTaken: 'none';
  result: {
    certifiedSnapshotId: null;
    snapshotHash: null;
    hashVersion: null;
  };
  blockers: AdvanceBlocker[];
}

export type AdvanceResult = AdvanceResultSuccess | AdvanceResultFailure;

const REMEDIATION = 'Complete checklist, resolve issues, and ensure integrity before advancing.';

function mapHardBlockersToBlockers(hardBlockers: string[]): AdvanceBlocker[] {
  return hardBlockers.map((message) => ({
    code: 'NOT_READY',
    message,
    remediation: REMEDIATION,
    details: {},
  }));
}

export interface AdvanceSessionInput {
  tenantId: string;
  closeSessionId: string;
  certifiedBy?: string;
  actorRole: CloseRole;
}

/**
 * Deterministic advance: draft → … → locked (one call), locked → certified, certified → no-op.
 * Reuses updateStatus and certifyCloseSession. Returns 422-style result (success: false + blockers) when not ready.
 */
export async function advanceSession(
  pool: Pool,
  input: AdvanceSessionInput
): Promise<AdvanceResult> {
  const session = await repo.getCloseSessionById(pool, input.tenantId, input.closeSessionId);
  if (!session) {
    throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  }

  const emptyResult: AdvanceResultFailure['result'] = {
    certifiedSnapshotId: null,
    snapshotHash: null,
    hashVersion: null,
  };

  if (session.status === 'certified') {
    return {
      success: true,
      session,
      statusBefore: 'certified',
      statusAfter: 'certified',
      actionTaken: 'none',
      result: emptyResult,
      blockers: [],
    };
  }

  if (session.status === 'locked') {
    const readiness = await computeReadiness(pool, input.tenantId, session);
    try {
      const certified = await certifyCloseSession(
        pool,
        {
          tenantId: input.tenantId,
          closeSessionId: input.closeSessionId,
          certifiedBy: (input.certifiedBy ?? 'advance-api').trim() || 'advance-api',
          periodLabel: session.periodEnd?.slice(0, 7),
        },
        input.actorRole
      );
      const snapshot = certified.certifiedSnapshotId
        ? await getLedgerSnapshotById(pool, input.tenantId, certified.certifiedSnapshotId)
        : null;
      return {
        success: true,
        session: certified,
        statusBefore: 'locked',
        statusAfter: 'certified',
        actionTaken: 'certified',
        result: {
          certifiedSnapshotId: certified.certifiedSnapshotId ?? null,
          snapshotHash: snapshot?.snapshotHash ?? null,
          hashVersion: snapshot?.hashVersion != null ? String(snapshot.hashVersion) : null,
        },
        blockers: [],
      };
    } catch (e) {
      if (e instanceof CloseSessionError && e.code === 'HARD_BLOCKERS') {
        return {
          success: false,
          session,
          statusBefore: 'locked',
          statusAfter: 'locked',
          actionTaken: 'none',
          result: emptyResult,
          blockers: mapHardBlockersToBlockers(readiness.hardBlockers),
        };
      }
      if (e instanceof CloseSessionError && (e.code === 'INSUFFICIENT_ROLE' || e.code === 'NOT_LOCKED')) {
        return {
          success: false,
          session,
          statusBefore: 'locked',
          statusAfter: 'locked',
          actionTaken: 'none',
          result: emptyResult,
          blockers: mapHardBlockersToBlockers([e.message]),
        };
      }
      throw e;
    }
  }

  // draft | in_progress | ready_for_review | finalized → advance toward locked
  // Wrap status updates + close_lock audit in a single transaction for atomicity.
  try {
    const current = await withTransaction(pool, async (client) => {
      let currentSession = session;
      while (currentSession.status !== 'locked') {
        const next = nextStatusTowardLocked(currentSession.status);
        if (!next) break;
        if (next === 'finalized' || next === 'locked') {
          const readiness = await computeReadiness(pool, input.tenantId, currentSession);
          if (!readiness.ready && readiness.hardBlockers.length > 0) {
            throw new AdvanceBlockedError(mapHardBlockersToBlockers(readiness.hardBlockers), currentSession);
          }
        }
        currentSession = await updateStatus(client, input.tenantId, input.closeSessionId, next);
      }

      if (currentSession.status === 'locked') {
        await recordMaterialEvent(client, {
          tenantId: input.tenantId,
          periodLabel: currentSession.periodEnd?.slice(0, 7),
          eventType: 'close_lock',
          deterministicFlagSnapshot: {
            closeSessionId: input.closeSessionId,
            statusBefore: session.status,
            statusAfter: 'locked',
            actor: 'advance-api',
          },
          createdBy: 'advance-api',
        });
      }
      return currentSession;
    });

    return {
      success: true,
      session: current,
      statusBefore: session.status,
      statusAfter: current.status,
      actionTaken: 'locked',
      result: emptyResult,
      blockers: [],
    };
  } catch (err) {
    if (err instanceof AdvanceBlockedError) {
      return {
        success: false,
        session: err.session,
        statusBefore: err.session.status,
        statusAfter: err.session.status,
        actionTaken: 'none',
        result: emptyResult,
        blockers: err.blockers,
      };
    }
    throw err;
  }
}
