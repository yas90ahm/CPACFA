/**
 * Close Session Service — State Machine
 *
 * States: OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → SUBSEQUENT_EVENTS_REVIEW → LOCKED
 *
 * OPEN: Period exists, close not started
 * IN_PROGRESS: Active close work (recons, AJEs, statement generation)
 * UNDER_REVIEW: All work complete, senior reviewer examining package
 * CERTIFIED: Human has attested to correctness, snapshot created
 * SUBSEQUENT_EVENTS_REVIEW: ASC 855 review of post-balance-sheet-date events
 * LOCKED: Permanent immutability, terminal state
 *
 * Key transitions:
 * - IN_PROGRESS → UNDER_REVIEW: gated by completeness checks (canAdvanceToUnderReview)
 * - UNDER_REVIEW → CERTIFIED: gated by re-validation + authority (canCertify)
 * - UNDER_REVIEW → IN_PROGRESS: rejection (preserves all work)
 * - CERTIFIED → IN_PROGRESS: reopen (requires CFO auth + reason)
 * - CERTIFIED → SUBSEQUENT_EVENTS_REVIEW: advance to review subsequent events
 * - SUBSEQUENT_EVENTS_REVIEW → LOCKED: permanent (no undo), requires all events dispositioned
 */

import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import type { CloseSession, CloseSessionStatus, CreateCloseSessionInput, ListCloseSessionsInput } from '../types/close_session.js';
import type { CloseRole } from '../types/close_and_controls.js';
import * as repo from '../db/repositories/close_session_repository.js';
import { computeReadiness } from './close_checklist_readiness_service.js';
import { canPerform } from './segregation_service.js';
import { recordMaterialEvent } from './audit_service.js';
import { getTrialBalanceForCertification } from './adjusted_trial_balance_service.js';
import { createSnapshotFromTrialBalanceAndEntries } from './ledger_snapshot_service.js';
import * as glRepository from '../db/repositories/general_ledger_repository.js';
import { buildEvidenceManifest } from './evidence_manifest_service.js';
import { checkEvidencePolicyForCertification } from './evidence_policy_service.js';
import { withTransaction } from '../db/transaction.js';
import { buildCertifiedStatementsFromSnapshot } from './certified_statements_service.js';
import { runCrossStatementValidationForCertification } from './cross_statement_validation.js';
import { buildCertificationArtifact, gatherAiMetadata } from './certification_artifact_service.js';
import * as certArtifactRepo from '../db/repositories/certification_artifact_repository.js';
import { verifyChain } from '../db/repositories/audit_ledger_repository.js';
import { getReadinessGates } from './session_readiness_gates_service.js';
import { sumRound2 } from '../utils/decimal.js';
import type { LedgerSnapshotPayload } from '../types/ledger_snapshot.js';
import { getLedgerSnapshotById } from '../db/repositories/ledger_snapshot_repository.js';
import { assertNoAiMutationContext } from '../lib/ai_boundary.js';
import { createIssue } from './issue_service.js';
import { getEntitySettings } from './entity_settings_service.js';

const ALLOWED_TRANSITIONS: Record<CloseSessionStatus, CloseSessionStatus[]> = {
  open: ['in_progress'],
  in_progress: ['under_review'],
  under_review: ['in_progress'], // certified only via certifyCloseSession (updateCertification)
  certified: ['in_progress', 'subsequent_events_review'],
  subsequent_events_review: ['in_progress', 'locked'],
  locked: [],
};

export class CloseSessionError extends Error {
  constructor(
    message: string,
    public readonly code: 'OVERLAP' | 'INVALID_TRANSITION' | 'NOT_FOUND' | 'VALIDATION' | 'INSUFFICIENT_ROLE' | 'NOT_LOCKED' | 'NOT_UNDER_REVIEW' | 'HARD_BLOCKERS' | 'NOT_READY' | 'SESSION_DATA_MISSING' | 'REOPEN_REASON_REQUIRED' | 'REOPEN_FORBIDDEN_LOCKED' | 'REOPEN_UNAUTHORIZED'
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
  const status = input.status ?? 'open';
  if (basis !== 'cash' && basis !== 'accrual') {
    throw new CloseSessionError('basis must be cash or accrual', 'VALIDATION');
  }
  const validStatuses: CloseSessionStatus[] = ['open', 'in_progress', 'under_review', 'certified', 'locked'];
  if (!validStatuses.includes(status)) {
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

/** Idempotent ensure: find or create an open close session for (tenantId, entityId, periodLabel). No lock/certify. */
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
    status: 'open',
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

/**
 * Update session status. Call only from within a transaction; acquires row lock (FOR UPDATE) to prevent concurrent advance races.
 * Logs close_session_transition for every state change.
 */
export async function updateStatus(
  client: Pool | PoolClient,
  tenantId: string,
  id: string,
  newStatus: CloseSessionStatus,
  createdBy?: string
): Promise<CloseSession> {
  const current = await repo.getCloseSessionByIdForUpdate(client, tenantId, id);
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
  const updated = await repo.updateCloseSessionStatus(client, tenantId, id, newStatus, createdBy);
  if (!updated) {
    throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  }

  // Log close_session_transition for every state change (audit firms need full history).
  // close_lock and certify_close are additional, richer events with operation-specific payload.
  await recordMaterialEvent(client, {
    tenantId,
    periodLabel: updated.periodEnd?.slice(0, 7),
    eventType: 'close_session_transition',
    deterministicFlagSnapshot: {
      from: current.status,
      to: newStatus,
      sessionId: id,
      ...(createdBy != null && { userId: createdBy }),
    },
    createdBy: createdBy ?? 'api',
  });

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
 * Certify a close session: only from under_review, no hard blockers, approver role.
 * Re-runs all hard validation checks, creates snapshot, signs artifact, sets status to certified.
 * Uses row-level lock (SELECT FOR UPDATE) inside transaction to prevent concurrent certify races.
 */
export async function certifyCloseSession(
  pool: Pool,
  input: CertifyCloseInput,
  actorRole: CloseRole
): Promise<CloseSession> {
  assertNoAiMutationContext();
  if (!canPerform(actorRole, 'certify_close')) {
    throw new CloseSessionError('Insufficient role: certify_close requires approver', 'INSUFFICIENT_ROLE');
  }

  return withTransaction(pool, async (client) => {
    // Acquire row-level lock FIRST to serialize concurrent certify attempts
    const lockResult = await client.query<{ id: string; status: string }>(
      'SELECT id, status FROM close_sessions WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [input.closeSessionId, input.tenantId]
    );
    if (lockResult.rows.length === 0) {
      throw new CloseSessionError('Close session not found', 'NOT_FOUND');
    }
    const currentStatus = lockResult.rows[0].status;
    if (currentStatus !== 'under_review') {
      throw new CloseSessionError(
        `Certification only allowed from under_review; current status is ${currentStatus}`,
        'NOT_UNDER_REVIEW'
      );
    }

    const session = await repo.getCloseSessionById(client, input.tenantId, input.closeSessionId);
    if (!session) throw new CloseSessionError('Close session not found', 'NOT_FOUND');

    // SoD check: certifier must differ from person who advanced to under_review (unless tenant setting allows)
    if (session.advancedToReviewBy && input.certifiedBy && session.advancedToReviewBy === input.certifiedBy) {
      const entitySettings = await getEntitySettings(pool, input.tenantId, session.entityId);
      if (!entitySettings.allowSameUserCertify) {
        throw new CloseSessionError(
          'Segregation of duties: certifier cannot be the same user who advanced to under_review',
          'INSUFFICIENT_ROLE'
        );
      }
    }

    if (session.statementsStaleSince) {
      throw new CloseSessionError(
        'Financial statements have changed since last generation; regenerate statements before certifying.',
        'VALIDATION'
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

    const periodLabel = input.periodLabel ?? session.periodEnd.slice(0, 7);

    let adjustedEntries: Awaited<ReturnType<typeof getTrialBalanceForCertification>>['trialBalance'];
    let hasGL = false;
    try {
      const tbResult = await getTrialBalanceForCertification(
        pool,
        input.tenantId,
        periodLabel,
        input.closeSessionId
      );
      adjustedEntries = tbResult.trialBalance;
      hasGL = tbResult.hasGL;
      if (process.env.NODE_ENV !== 'test') {
        console.log(`Certification using TB source: ${tbResult.source}, hasGL: ${hasGL}`);
      }
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
          ...(e.accountType != null && { accountType: e.accountType }),
          ...(e.lineId != null && e.lineId !== '' && { lineId: e.lineId }),
        })),
        totalDebits,
        totalCredits,
      },
    };
    let statements;
    try {
      statements = buildCertifiedStatementsFromSnapshot(snapshotPayload);
    } catch (_e) {
      throw new CloseSessionError(
        'Trial balance does not pass integrity check (Truth Gate). Fix imbalance or balance sheet equation before certifying.',
        'VALIDATION'
      );
    }

    const validationChecks = runCrossStatementValidationForCertification(
      statements.balanceSheet,
      statements.profitAndLoss,
      statements.cashFlow ?? null,
      statements.equityChanges ?? null
    );
    const hardFailures = validationChecks.filter((c) => c.check_type === 'hard' && !c.passes);
    if (hardFailures.length > 0) {
      const messages = hardFailures.map((c) => c.message ?? c.check_name).join('; ');
      throw new CloseSessionError(`Cross-statement validation failed: ${messages}`, 'VALIDATION');
    }

    let generalLedger: LedgerSnapshotPayload['generalLedger'];
    if (hasGL) {
      const glLines = await glRepository.getGLForPeriod(pool, input.tenantId, periodLabel);
      const entries = glRepository.groupLinesByEntry(glLines);
      generalLedger = entries.map((entry) => ({
        entry_id: entry.entry_id,
        entry_date:
          typeof entry.entry_date === 'string'
            ? entry.entry_date
            : (entry.entry_date as Date).toISOString().slice(0, 10),
        description: entry.description,
        lines: entry.lines.map((line) => ({
          line_number: line.line_number,
          account_code: line.account_code,
          debit: Number(line.debit ?? 0),
          credit: Number(line.credit ?? 0),
          description: line.description,
        })),
      }));
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
          ...(e.accountType != null && { accountType: e.accountType }),
          ...(e.lineId != null && e.lineId !== '' && { lineId: e.lineId }),
        })),
        totalDebits: snapshotPayload.trialBalance.totalDebits,
        totalCredits: snapshotPayload.trialBalance.totalCredits,
      },
      evidenceManifest,
      ...(generalLedger != null && generalLedger.length > 0 && { generalLedger }),
    });

    const certifiedAt = new Date().toISOString();

    let certificationArtifactId: string | null = null;
    const existingArtifact = await certArtifactRepo.existsForCloseSession(client, input.tenantId, input.closeSessionId);
    if (!existingArtifact) {
      const auditChainResult = await verifyChain(client, input.tenantId);
      let aiMetadata;
      try {
        aiMetadata = await gatherAiMetadata(client, input.tenantId, input.closeSessionId);
      } catch (_) {
        /* non-fatal: AI metadata gathering failed */
      }
      // Capture gate snapshot at certification moment
      let gateSnapshot;
      try {
        const gatesResult = await getReadinessGates(pool, input.tenantId, session);
        gateSnapshot = {
          gatesPassing: gatesResult.gatesPassing,
          gatesTotal: gatesResult.gatesTotal,
          canAdvance: gatesResult.canAdvance,
          gateDetails: gatesResult.gates.map((g) => ({
            id: g.id, name: g.name, passing: g.passing, detail: g.detail, category: g.category,
          })),
          checkedAt: certifiedAt,
        };
      } catch {
        // Non-fatal: gate snapshot capture failed
      }

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
        validationStateAtCertification: validationChecks.map((c) => ({
          check_name: c.check_name,
          check_type: c.check_type,
          passes: c.passes,
          message: c.message,
        })),
        aiMetadata,
        gateSnapshot,
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

/** Reject from UNDER_REVIEW back to IN_PROGRESS. Creates blocking issue. */
export async function rejectSession(
  pool: Pool,
  tenantId: string,
  sessionId: string,
  reason: string,
  rejectedBy: string
): Promise<CloseSession> {
  const session = await repo.getCloseSessionById(pool, tenantId, sessionId);
  if (!session) throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  if (session.status !== 'under_review') {
    throw new CloseSessionError(
      `Cannot reject session in '${session.status}' state. Can only reject from UNDER_REVIEW.`,
      'NOT_UNDER_REVIEW'
    );
  }

  const reasonTrimmed = reason?.trim() ?? '';
  if (reasonTrimmed.length < 10) {
    throw new CloseSessionError('Rejection reason is required (minimum 10 characters)', 'VALIDATION');
  }

  await withTransaction(pool, async (client) => {
    await updateStatus(client, tenantId, sessionId, 'in_progress', rejectedBy);
    const issue = await createIssue(client as unknown as Pool, {
      tenantId,
      periodId: sessionId,
      entityId: session.entityId,
      issueType: 'review_rejection',
      severity: 'blocking',
      category: 'review',
      title: `Review rejected: ${reasonTrimmed.substring(0, 100)}`,
      description: `Close session was rejected by reviewer and sent back to IN_PROGRESS.\n\nReason: ${reasonTrimmed}`,
      sourceCheck: 'review_rejection',
      sourceDetails: { rejectedBy, reason: reasonTrimmed },
    });
    const preparerId = (session as { createdBy?: string }).createdBy ?? null;
    if (preparerId) {
      const { assignIssue } = await import('./issue_service.js');
      await assignIssue(client as unknown as Pool, tenantId, issue.issueId, preparerId, rejectedBy);
    }
  });

  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel: session.periodEnd?.slice(0, 7),
    eventType: 'close_session_transition',
    deterministicFlagSnapshot: {
      event: 'close_session_rejected',
      sessionId,
      rejectedBy,
      reason: reasonTrimmed,
      fromState: 'under_review',
      toState: 'in_progress',
    },
  });

  const updated = await repo.getCloseSessionById(pool, tenantId, sessionId);
  if (!updated) throw new CloseSessionError('Close session not found after update', 'NOT_FOUND');
  return updated;
}

/** Next status toward under_review (open → in_progress → under_review). Returns null when already under_review or beyond. */
function nextStatusTowardUnderReview(status: CloseSessionStatus): CloseSessionStatus | null {
  switch (status) {
    case 'open':
      return 'in_progress';
    case 'in_progress':
      return 'under_review';
    case 'under_review':
    case 'certified':
    case 'locked':
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
  actionTaken: 'none' | 'advanced';
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

/** Gate: can transition IN_PROGRESS → UNDER_REVIEW. Returns ready and list of missing items. */
export async function canAdvanceToUnderReview(
  pool: Pool,
  tenantId: string,
  session: CloseSession
): Promise<{ allowed: boolean; missing: string[] }> {
  const readiness = await computeReadiness(pool, tenantId, session);
  if (readiness.ready && readiness.hardBlockers.length === 0) {
    return { allowed: true, missing: [] };
  }
  return { allowed: false, missing: readiness.hardBlockers };
}

/** Gate: can transition UNDER_REVIEW → CERTIFIED. Re-validates (no cache). */
export async function canCertify(
  pool: Pool,
  tenantId: string,
  session: CloseSession
): Promise<{ allowed: boolean; missing: string[] }> {
  if (session.status !== 'under_review') {
    return { allowed: false, missing: [`Session must be under_review; current status is ${session.status}`] };
  }
  const readiness = await computeReadiness(pool, tenantId, session);
  if (!readiness.ready || readiness.hardBlockers.length > 0) {
    return { allowed: false, missing: readiness.hardBlockers };
  }
  const evidenceCheck = await checkEvidencePolicyForCertification(pool, tenantId, session.id);
  for (const b of evidenceCheck.hardBlockers) {
    readiness.hardBlockers.push(b.message);
  }
  if (readiness.hardBlockers.length > 0) {
    return { allowed: false, missing: readiness.hardBlockers };
  }
  return { allowed: true, missing: [] };
}

/** Gate: can transition CERTIFIED → LOCKED. */
export function canLock(session: CloseSession): boolean {
  return session.status === 'subsequent_events_review';
}

/** Gate: can reopen (CERTIFIED → IN_PROGRESS). Requires reason and reopen authority. */
export function canReopen(
  session: CloseSession,
  reason: string | undefined,
  hasReopenAuthority: boolean
): { allowed: boolean; missing: string[] } {
  const missing: string[] = [];
  if (session.status === 'locked') {
    missing.push('Cannot reopen: session is locked (terminal state).');
    return { allowed: false, missing };
  }
  if (session.status !== 'certified') {
    missing.push(`Reopen only allowed from certified; current status is ${session.status}`);
    return { allowed: false, missing };
  }
  if (!hasReopenAuthority) {
    missing.push('Reopen requires CFO-level or configured reopen authority.');
    return { allowed: false, missing };
  }
  const trimmed = (reason ?? '').trim();
  if (trimmed.length === 0) {
    missing.push('Reopen reason is required and cannot be empty.');
    return { allowed: false, missing };
  }
  if (trimmed.length < 10) {
    missing.push('Reopen reason must be at least 10 characters.');
    return { allowed: false, missing };
  }
  return { allowed: true, missing: [] };
}

/** Reopen: CERTIFIED → IN_PROGRESS. Requires same authority as certify (approver) and non-empty reason. */
export async function reopenCloseSession(
  pool: Pool,
  sessionId: string,
  tenantId: string,
  userId: string,
  reason: string,
  actorRole: CloseRole
): Promise<CloseSession> {
  assertNoAiMutationContext();
  if (!canPerform(actorRole, 'certify_close')) {
    throw new CloseSessionError('Insufficient role: reopen requires approver', 'REOPEN_UNAUTHORIZED');
  }
  const session = await repo.getCloseSessionById(pool, tenantId, sessionId);
  if (!session) throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  const check = canReopen(session, reason, true);
  if (!check.allowed) {
    if (session.status === 'locked') throw new CloseSessionError(check.missing[0] ?? 'Cannot reopen locked session', 'REOPEN_FORBIDDEN_LOCKED');
    if ((reason ?? '').trim().length < 10) throw new CloseSessionError(check.missing[0] ?? 'Reopen reason required (min 10 characters)', 'REOPEN_REASON_REQUIRED');
    throw new CloseSessionError(check.missing[0] ?? 'Cannot reopen', 'INVALID_TRANSITION');
  }
  return withTransaction(pool, async (client) => {
    const updated = await repo.updateReopen(client, tenantId, sessionId, userId, reason.trim());
    if (!updated) throw new CloseSessionError('Close session not found', 'NOT_FOUND');
    await recordMaterialEvent(client, {
      tenantId,
      periodLabel: updated.periodEnd?.slice(0, 7),
      eventType: 'close_session_reopened',
      deterministicFlagSnapshot: {
        closeSessionId: sessionId,
        reopenedBy: userId,
        reason: reason.trim(),
        priorCertifiedAt: session.certifiedAt,
        priorCertifiedSnapshotId: session.certifiedSnapshotId ?? null,
      },
      createdBy: userId,
    });
    await createIssue(pool, {
      tenantId,
      periodId: sessionId,
      entityId: session.entityId,
      issueType: 'period_reopened',
      category: 'review',
      severity: 'info',
      title: 'Period reopened',
      description: `Period reopened by ${userId}. Reason: ${reason.trim()}`,
      sourceDetails: { type: 'period_reopened', reopenedBy: userId },
    });
    return updated;
  });
}

/** Advance: CERTIFIED → SUBSEQUENT_EVENTS_REVIEW. Requires approver role. */
export async function advanceToSubsequentEventsReview(
  pool: Pool,
  sessionId: string,
  tenantId: string,
  userId: string,
  actorRole: CloseRole
): Promise<CloseSession> {
  assertNoAiMutationContext();
  if (!canPerform(actorRole, 'period_lock')) {
    throw new CloseSessionError('Insufficient role: advancing to subsequent_events_review requires approver', 'INSUFFICIENT_ROLE');
  }
  const session = await repo.getCloseSessionById(pool, tenantId, sessionId);
  if (!session) throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  if (session.status !== 'certified') {
    throw new CloseSessionError(`Can only advance to subsequent_events_review from certified; current status is ${session.status}`, 'INVALID_TRANSITION');
  }
  return withTransaction(pool, async (client) => {
    const updated = await repo.updateCloseSessionStatus(client, tenantId, sessionId, 'subsequent_events_review', userId);
    if (!updated) throw new CloseSessionError('Close session not found', 'NOT_FOUND');
    await recordMaterialEvent(client, {
      tenantId,
      periodLabel: updated.periodEnd?.slice(0, 7),
      eventType: 'close_session_transition',
      deterministicFlagSnapshot: {
        closeSessionId: sessionId,
        from: 'certified',
        to: 'subsequent_events_review',
        advancedBy: userId,
      },
      createdBy: userId,
    });
    return updated;
  });
}

/** Confirm "no subsequent events found" for a session in SUBSEQUENT_EVENTS_REVIEW. */
export async function confirmNoSubsequentEvents(
  pool: Pool,
  sessionId: string,
  tenantId: string,
  userId: string,
  actorRole: CloseRole
): Promise<CloseSession> {
  assertNoAiMutationContext();
  if (!canPerform(actorRole, 'period_lock')) {
    throw new CloseSessionError('Insufficient role: confirming no subsequent events requires approver', 'INSUFFICIENT_ROLE');
  }
  const session = await repo.getCloseSessionById(pool, tenantId, sessionId);
  if (!session) throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  if (session.status !== 'subsequent_events_review') {
    throw new CloseSessionError(`Confirm no subsequent events only allowed in subsequent_events_review; current status is ${session.status}`, 'INVALID_TRANSITION');
  }
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE close_sessions SET subsequent_events_confirmed_by = $1, subsequent_events_confirmed_at = $2, updated_at = $2 WHERE id = $3 AND tenant_id = $4',
    [userId, now, sessionId, tenantId]
  );
  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel: session.periodEnd?.slice(0, 7),
    eventType: 'subsequent_events_confirmed_none',
    deterministicFlagSnapshot: { closeSessionId: sessionId, confirmedBy: userId },
    createdBy: userId,
  });
  const updated = await repo.getCloseSessionById(pool, tenantId, sessionId);
  return updated!;
}

/** Lock: SUBSEQUENT_EVENTS_REVIEW → LOCKED. Terminal state; no further transitions. Requires approver role. */
export async function lockCloseSession(pool: Pool, sessionId: string, tenantId: string, lockedBy?: string, actorRole?: CloseRole): Promise<CloseSession> {
  assertNoAiMutationContext();
  if (actorRole && !canPerform(actorRole, 'period_lock')) {
    throw new CloseSessionError('Insufficient role: period_lock requires approver', 'INSUFFICIENT_ROLE');
  }
  const session = await repo.getCloseSessionById(pool, tenantId, sessionId);
  if (!session) throw new CloseSessionError('Close session not found', 'NOT_FOUND');
  if (!canLock(session)) {
    throw new CloseSessionError(`Lock only allowed from subsequent_events_review; current status is ${session.status}`, 'INVALID_TRANSITION');
  }
  // Verify subsequent events review is complete before locking
  const { isReviewComplete } = await import('./subsequent_event_service.js');
  const reviewStatus = await isReviewComplete(pool, tenantId, sessionId, session.subsequentEventsConfirmedBy);
  if (!reviewStatus.complete) {
    throw new CloseSessionError(`Cannot lock: ${reviewStatus.reason}`, 'VALIDATION');
  }
  return withTransaction(pool, async (client) => {
    const updated = await repo.updateCloseSessionStatus(client, tenantId, sessionId, 'locked');
    if (!updated) throw new CloseSessionError('Close session not found', 'NOT_FOUND');
    const daysSinceCert = session.certifiedAt
      ? Math.floor((Date.now() - new Date(session.certifiedAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    await recordMaterialEvent(client, {
      tenantId,
      periodLabel: updated.periodEnd?.slice(0, 7),
      eventType: 'close_session_locked',
      deterministicFlagSnapshot: {
        closeSessionId: sessionId,
        lockedBy: lockedBy ?? 'system',
        daysSinceCertification: daysSinceCert,
      },
      createdBy: lockedBy ?? 'system',
    });
    return updated;
  });
}

/**
 * Auto-lock certified sessions that have been certified for longer than `daysAfterCert` days.
 * Advances through subsequent_events_review (with auto-confirmation) then locks.
 * Intended to be called by a scheduled job (e.g. daily cron).
 * Returns the list of session IDs that were auto-locked.
 */
export async function autoLockCertifiedSessions(
  pool: Pool,
  tenantId: string,
  daysAfterCert: number = 30
): Promise<string[]> {
  // Handle sessions already in subsequent_events_review (auto-lock them)
  const reviewSessions = await repo.listCloseSessions(pool, tenantId, undefined, 'subsequent_events_review');
  const locked: string[] = [];
  for (const session of reviewSessions) {
    try {
      // Auto-confirm no subsequent events then lock
      await confirmNoSubsequentEvents(pool, session.id, tenantId, 'system:auto-lock', 'approver');
      await lockCloseSession(pool, session.id, tenantId, 'system:auto-lock', 'approver');
      locked.push(session.id);
    } catch {
      // Skip sessions that fail (e.g. concurrent modification)
    }
  }

  // Handle certified sessions past the cutoff (advance to review then lock)
  const certifiedSessions = await repo.listCloseSessions(pool, tenantId, undefined, 'certified');
  const cutoff = Date.now() - daysAfterCert * 24 * 60 * 60 * 1000;
  for (const session of certifiedSessions) {
    if (!session.certifiedAt) continue;
    const certTime = new Date(session.certifiedAt).getTime();
    if (certTime <= cutoff) {
      try {
        await advanceToSubsequentEventsReview(pool, session.id, tenantId, 'system:auto-lock', 'approver');
        await confirmNoSubsequentEvents(pool, session.id, tenantId, 'system:auto-lock', 'approver');
        await lockCloseSession(pool, session.id, tenantId, 'system:auto-lock', 'approver');
        locked.push(session.id);
      } catch {
        // Skip sessions that fail to lock (e.g. concurrent modification)
      }
    }
  }

  return locked;
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
 * Advance: open → in_progress → under_review (one step per call, or multiple steps until gate).
 * Gate at IN_PROGRESS → UNDER_REVIEW: requires all readiness checks (computeReadiness).
 * Certification is a separate API (certify); lock is separate (lockCloseSession).
 * Returns 422-style result (success: false + blockers) when not ready to advance to under_review.
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

  if (session.status === 'under_review' || session.status === 'certified' || session.status === 'subsequent_events_review' || session.status === 'locked') {
    return {
      success: true,
      session,
      statusBefore: session.status,
      statusAfter: session.status,
      actionTaken: 'none',
      result: emptyResult,
      blockers: [],
    };
  }

  try {
    const current = await withTransaction(pool, async (client) => {
      const locked = await repo.getCloseSessionByIdForUpdate(client, input.tenantId, input.closeSessionId);
      if (!locked) throw new CloseSessionError('Close session not found', 'NOT_FOUND');
      let currentSession = locked;
      const next = nextStatusTowardUnderReview(currentSession.status);
      if (!next) return currentSession;
      if (next === 'under_review') {
        const readiness = await computeReadiness(pool, input.tenantId, currentSession);
        if (!readiness.ready && readiness.hardBlockers.length > 0) {
          throw new AdvanceBlockedError(mapHardBlockersToBlockers(readiness.hardBlockers), currentSession);
        }
      }
      currentSession = await updateStatus(client, input.tenantId, input.closeSessionId, next, input.certifiedBy ?? 'advance-api');
      if (next === 'in_progress') {
        try {
          const { initializeReconciliations } = await import('./period_reconciliation_service.js');
          await initializeReconciliations(
            client as unknown as Pool,
            input.tenantId,
            input.closeSessionId,
            currentSession.entityId
          );
        } catch (initErr) {
          console.warn('[advance] initializeReconciliations failed (non-fatal):', (initErr as Error).message);
          // Non-fatal: session still advances to in_progress even if recon init fails
        }
      }
      return currentSession;
    });

    return {
      success: true,
      session: current,
      statusBefore: session.status,
      statusAfter: current.status,
      actionTaken: current.status !== session.status ? 'advanced' : 'none',
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
