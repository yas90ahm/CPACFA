/**
 * Close State Machine Tests
 *
 * Verifies the complete state machine:
 * OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED
 *
 * Including: transition gates, rejection, reopen, and terminal lock.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import {
  updateStatus,
  certifyCloseSession,
  advanceSession,
  getAllowedTransitions,
  canAdvanceToUnderReview,
  canCertify,
  canLock,
  canReopen,
  reopenCloseSession,
  lockCloseSession,
  CloseSessionError,
} from '../../src/services/close_session_service.js';
import * as repo from '../../src/db/repositories/close_session_repository.js';
import * as readiness from '../../src/services/close_checklist_readiness_service.js';
import * as transaction from '../../src/db/transaction.js';
import * as adjustedTb from '../../src/services/adjusted_trial_balance_service.js';
import * as certifiedStatements from '../../src/services/certified_statements_service.js';
import * as ledgerSnapshot from '../../src/services/ledger_snapshot_service.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';
import * as issueService from '../../src/services/issue_service.js';
import * as evidencePolicy from '../../src/services/evidence_policy_service.js';

const mockPool = {} as Pool;

function createMockClient(lockRows: { id: string; status: string }[] = [{ id: 'sess-1', status: 'under_review' }]) {
  return {
    query: jest.fn().mockImplementation(() => Promise.resolve({ rows: lockRows })),
  };
}

const baseSession = {
  id: 'sess-1',
  tenantId: 't1',
  entityId: 'e1',
  periodStart: '2025-01-01',
  periodEnd: '2025-01-31',
  basis: 'accrual' as const,
  standard: 'GAAP',
  status: 'open' as const,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('Close State Machine — allowed transitions', () => {
  it('open can only go to in_progress', () => {
    expect(getAllowedTransitions('open')).toEqual(['in_progress']);
  });
  it('in_progress can only go to under_review', () => {
    expect(getAllowedTransitions('in_progress')).toEqual(['under_review']);
  });
  it('under_review can only go to in_progress (certified via certifyCloseSession)', () => {
    expect(getAllowedTransitions('under_review')).toEqual(['in_progress']);
  });
  it('certified can go to in_progress or locked', () => {
    expect(getAllowedTransitions('certified')).toEqual(['in_progress', 'locked']);
  });
  it('locked has no allowed transitions (terminal)', () => {
    expect(getAllowedTransitions('locked')).toEqual([]);
  });
});

describe('Close State Machine — cannot skip states', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('OPEN → UNDER_REVIEW is rejected (must go through IN_PROGRESS)', async () => {
    jest.spyOn(repo, 'getCloseSessionByIdForUpdate').mockResolvedValue({ ...baseSession, status: 'open' });
    await expect(updateStatus(mockPool, 't1', 'sess-1', 'under_review')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      message: expect.stringMatching(/open.*under_review|Transition.*not allowed/),
    });
  });

  it('IN_PROGRESS → CERTIFIED is rejected (certify only from under_review)', async () => {
    jest.spyOn(repo, 'getCloseSessionByIdForUpdate').mockResolvedValue({ ...baseSession, status: 'in_progress' });
    await expect(updateStatus(mockPool, 't1', 'sess-1', 'certified')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });
});

describe('Close State Machine — gate enforcement IN_PROGRESS → UNDER_REVIEW', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(transaction, 'withTransaction').mockImplementation(async (_p, fn) => fn(createMockClient([{ id: 'sess-1', status: 'in_progress' }]) as never));
  });

  it('blocked when readiness has hard blockers; returns specific missing items', async () => {
    const session = { ...baseSession, status: 'in_progress' as const };
    jest.spyOn(repo, 'getCloseSessionByIdForUpdate').mockResolvedValue(session);
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(session);
    jest.spyOn(readiness, 'computeReadiness').mockResolvedValue({
      ready: false,
      hardBlockers: ['Reconciliations incomplete', 'TB not validated'],
      softWarnings: [],
      checklistComplete: false,
      cashRecComplete: false,
      noCriticalIssues: false,
      materialJesApproved: false,
      integrityChecksPass: false,
      jeTotal: 0,
    });
    const res = await advanceSession(mockPool, {
      tenantId: 't1',
      closeSessionId: 'sess-1',
      actorRole: 'approver',
    });
    expect(res.success).toBe(false);
    expect(res.actionTaken).toBe('none');
    expect(res.statusAfter).toBe('in_progress');
    expect(Array.isArray(res.blockers)).toBe(true);
    expect(res.blockers.length).toBeGreaterThan(0);
    expect(res.blockers.some((b) => b.message?.includes('Reconciliations') || b.message?.includes('TB'))).toBe(true);
  });
});

describe('Close State Machine — UNDER_REVIEW → CERTIFIED blocked when validation fails', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(transaction, 'withTransaction').mockImplementation(async (_p, fn) => fn(createMockClient([{ id: 'sess-1', status: 'under_review' }]) as never));
    jest.spyOn(evidencePolicy, 'checkEvidencePolicyForCertification').mockResolvedValue({ hardBlockers: [], softWarnings: [] });
  });

  it('certification rejected when hard blockers present', async () => {
    const session = { ...baseSession, status: 'under_review' as const };
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(session);
    jest.spyOn(readiness, 'computeReadiness').mockResolvedValue({
      ready: false,
      hardBlockers: ['Integrity check failed: A ≠ L+E'],
      softWarnings: [],
      checklistComplete: true,
      cashRecComplete: true,
      noCriticalIssues: true,
      materialJesApproved: true,
      integrityChecksPass: false,
      jeTotal: 0,
    });
    await expect(
      certifyCloseSession(
        mockPool,
        { tenantId: 't1', closeSessionId: 'sess-1', certifiedBy: 'approver@test.com' },
        'approver'
      )
    ).rejects.toMatchObject({ code: 'HARD_BLOCKERS' });
  });
});

describe('Close State Machine — UNDER_REVIEW → IN_PROGRESS (rejection)', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('rejection transition is allowed (under_review → in_progress)', async () => {
    jest.spyOn(repo, 'getCloseSessionByIdForUpdate').mockResolvedValue({ ...baseSession, status: 'under_review' });
    jest.spyOn(repo, 'updateCloseSessionStatus').mockResolvedValue({ ...baseSession, status: 'in_progress' });
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    const updated = await updateStatus(mockPool, 't1', 'sess-1', 'in_progress');
    expect(updated.status).toBe('in_progress');
  });
});

describe('Close State Machine — reopen (CERTIFIED → IN_PROGRESS)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(transaction, 'withTransaction').mockImplementation(async (_p, fn) => fn(createMockClient([{ id: 'sess-1', status: 'certified' }]) as never));
  });

  it('reopen requires reason (non-empty, min length)', async () => {
    const session = { ...baseSession, status: 'certified' as const };
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(session);
    await expect(
      reopenCloseSession(mockPool, 'sess-1', 't1', 'user@test.com', '', 'approver')
    ).rejects.toMatchObject({ code: 'REOPEN_REASON_REQUIRED' });
    await expect(
      reopenCloseSession(mockPool, 'sess-1', 't1', 'user@test.com', 'short', 'approver')
    ).rejects.toMatchObject({ code: 'REOPEN_REASON_REQUIRED' });
  });

  it('reopen requires authority (approver role)', async () => {
    const session = { ...baseSession, status: 'certified' as const };
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(session);
    await expect(
      reopenCloseSession(mockPool, 'sess-1', 't1', 'user@test.com', 'Valid reopen reason for audit trail.', 'preparer')
    ).rejects.toMatchObject({ code: 'REOPEN_UNAUTHORIZED' });
  });

  it('reopen succeeds with reason and authority; status becomes in_progress', async () => {
    const session = { ...baseSession, status: 'certified' as const, certifiedAt: '2025-01-15T12:00:00Z' };
    const reopened = { ...baseSession, status: 'in_progress' as const, reopenedAt: new Date().toISOString(), reopenedBy: 'user@test.com', reopenReason: 'Correction required.' };
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(session);
    jest.spyOn(repo, 'updateReopen').mockResolvedValue(reopened);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    jest.spyOn(issueService, 'createIssue').mockResolvedValue({} as never);
    const result = await reopenCloseSession(
      mockPool,
      'sess-1',
      't1',
      'user@test.com',
      'Correction required after review.',
      'approver'
    );
    expect(result.status).toBe('in_progress');
  });
});

describe('Close State Machine — lock is permanent', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('CERTIFIED → LOCKED via lockCloseSession', async () => {
    const session = { ...baseSession, status: 'certified' as const, certifiedAt: '2025-01-15T12:00:00Z' };
    const locked = { ...baseSession, status: 'locked' as const };
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(session);
    jest.spyOn(transaction, 'withTransaction').mockImplementation(async (_p, fn) => fn(createMockClient() as never));
    jest.spyOn(repo, 'updateCloseSessionStatus').mockResolvedValue(locked);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    const result = await lockCloseSession(mockPool, 'sess-1', 't1');
    expect(result.status).toBe('locked');
  });

  it('cannot reopen LOCKED session', async () => {
    const session = { ...baseSession, status: 'locked' as const };
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(session);
    await expect(
      reopenCloseSession(mockPool, 'sess-1', 't1', 'user@test.com', 'Valid reason for reopen.', 'approver')
    ).rejects.toMatchObject({ code: 'REOPEN_FORBIDDEN_LOCKED' });
  });

  it('all transitions from LOCKED are rejected', async () => {
    jest.spyOn(repo, 'getCloseSessionByIdForUpdate').mockResolvedValue({ ...baseSession, status: 'locked' });
    await expect(updateStatus(mockPool, 't1', 'sess-1', 'in_progress')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(updateStatus(mockPool, 't1', 'sess-1', 'certified')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

describe('Close State Machine — gate helpers', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('canLock returns true only for certified', () => {
    expect(canLock({ ...baseSession, status: 'open' })).toBe(false);
    expect(canLock({ ...baseSession, status: 'in_progress' })).toBe(false);
    expect(canLock({ ...baseSession, status: 'under_review' })).toBe(false);
    expect(canLock({ ...baseSession, status: 'certified' })).toBe(true);
    expect(canLock({ ...baseSession, status: 'locked' })).toBe(false);
  });

  it('canReopen: locked → not allowed; certified + reason + authority → allowed', () => {
    const certSession = { ...baseSession, status: 'certified' as const };
    const lockedSession = { ...baseSession, status: 'locked' as const };
    expect(canReopen(lockedSession, 'Reason', true).allowed).toBe(false);
    expect(canReopen(certSession, '', true).allowed).toBe(false);
    expect(canReopen(certSession, 'Short', true).allowed).toBe(false);
    expect(canReopen(certSession, 'Valid reopen reason here.', false).allowed).toBe(false);
    expect(canReopen(certSession, 'Valid reopen reason here.', true).allowed).toBe(true);
  });
});

describe('Close State Machine — re-validation at certification', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(evidencePolicy, 'checkEvidencePolicyForCertification').mockResolvedValue({ hardBlockers: [], softWarnings: [] });
  });

  it('canCertify re-validates (uses computeReadiness, not cached)', async () => {
    const session = { ...baseSession, status: 'under_review' as const };
    const computeSpy = jest.spyOn(readiness, 'computeReadiness')
      .mockResolvedValueOnce({ ready: true, hardBlockers: [], softWarnings: [], checklistComplete: true, cashRecComplete: true, noCriticalIssues: true, materialJesApproved: true, integrityChecksPass: true, jeTotal: 0 })
      .mockResolvedValueOnce({ ready: false, hardBlockers: ['TB invalid'], softWarnings: [], checklistComplete: true, cashRecComplete: true, noCriticalIssues: true, materialJesApproved: true, integrityChecksPass: false, jeTotal: 0 });
    const first = await canCertify(mockPool, 't1', session);
    expect(first.allowed).toBe(true);
    const second = await canCertify(mockPool, 't1', session);
    expect(second.allowed).toBe(false);
    expect(second.missing).toContain('TB invalid');
    expect(computeSpy).toHaveBeenCalledTimes(2);
  });
});
