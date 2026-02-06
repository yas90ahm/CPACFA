/**
 * Close session service unit tests: create, overlap, status transitions.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import {
  createSession,
  getSession,
  listSessions,
  updateStatus,
  certifyCloseSession,
  getAllowedTransitions,
  CloseSessionError,
} from '../../src/services/close_session_service.js';
import * as repo from '../../src/db/repositories/close_session_repository.js';
import * as readiness from '../../src/services/close_checklist_readiness_service.js';
import * as segregation from '../../src/services/segregation_service.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';
import * as adjustedTb from '../../src/services/adjusted_trial_balance_service.js';
import * as certifiedStatements from '../../src/services/certified_statements_service.js';
import * as ledgerSnapshot from '../../src/services/ledger_snapshot_service.js';

const mockPool = {} as Pool;

const sampleSession = {
  id: 'sess-1',
  tenantId: 't1',
  entityId: 'e1',
  periodStart: '2025-01-01',
  periodEnd: '2025-01-31',
  basis: 'accrual' as const,
  standard: 'GAAP',
  status: 'draft' as const,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('Close session — getAllowedTransitions', () => {
  it('draft can only go to in_progress', () => {
    expect(getAllowedTransitions('draft')).toEqual(['in_progress']);
  });
  it('in_progress can go to draft or ready_for_review', () => {
    expect(getAllowedTransitions('in_progress')).toEqual(['draft', 'ready_for_review']);
  });
  it('ready_for_review can go to in_progress or finalized', () => {
    expect(getAllowedTransitions('ready_for_review')).toEqual(['in_progress', 'finalized']);
  });
  it('finalized can go to ready_for_review or locked', () => {
    expect(getAllowedTransitions('finalized')).toEqual(['ready_for_review', 'locked']);
  });
  it('locked can only go to certified', () => {
    expect(getAllowedTransitions('locked')).toEqual(['certified']);
  });
  it('certified has no allowed transitions', () => {
    expect(getAllowedTransitions('certified')).toEqual([]);
  });
});

describe('Close session — createSession', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('creates session with defaults (accrual, GAAP, draft)', async () => {
    jest.spyOn(repo, 'hasOverlappingSession').mockResolvedValue(false);
    jest.spyOn(repo, 'insertCloseSession').mockResolvedValue({ ...sampleSession });
    const result = await createSession(mockPool, {
      tenantId: 't1',
      entityId: 'e1',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
    });
    expect(result).toEqual(sampleSession);
    expect(repo.hasOverlappingSession).toHaveBeenCalledWith(
      mockPool,
      't1',
      'e1',
      '2025-01-01',
      '2025-01-31'
    );
    expect(repo.insertCloseSession).toHaveBeenCalled();
  });

  it('throws VALIDATION for invalid basis', async () => {
    jest.spyOn(repo, 'hasOverlappingSession').mockResolvedValue(false);
    await expect(
      createSession(mockPool, {
        tenantId: 't1',
        entityId: 'e1',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        basis: 'invalid' as 'cash',
      })
    ).rejects.toThrow(CloseSessionError);
    await expect(
      createSession(mockPool, {
        tenantId: 't1',
        entityId: 'e1',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        basis: 'invalid' as 'cash',
      })
    ).rejects.toMatchObject({ code: 'VALIDATION', message: 'basis must be cash or accrual' });
  });

  it('throws OVERLAP when overlapping session exists', async () => {
    jest.spyOn(repo, 'hasOverlappingSession').mockResolvedValue(true);
    await expect(
      createSession(mockPool, {
        tenantId: 't1',
        entityId: 'e1',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
      })
    ).rejects.toThrow(CloseSessionError);
    await expect(
      createSession(mockPool, {
        tenantId: 't1',
        entityId: 'e1',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
      })
    ).rejects.toMatchObject({ code: 'OVERLAP' });
  });
});

describe('Close session — updateStatus', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('allows draft -> in_progress', async () => {
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue({ ...sampleSession, status: 'draft' });
    jest.spyOn(repo, 'updateCloseSessionStatus').mockResolvedValue({
      ...sampleSession,
      status: 'in_progress',
      updatedAt: '2025-01-02T00:00:00Z',
    });
    const result = await updateStatus(mockPool, 't1', 'sess-1', 'in_progress');
    expect(result.status).toBe('in_progress');
  });

  it('rejects draft -> finalized (invalid transition)', async () => {
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue({ ...sampleSession, status: 'draft' });
    const updateSpy = jest.spyOn(repo, 'updateCloseSessionStatus');
    await expect(updateStatus(mockPool, 't1', 'sess-1', 'finalized')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      message: expect.stringMatching(/draft.*finalized|Transition.*not allowed/),
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('allows locked -> certified via certifyCloseSession (not updateStatus)', async () => {
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue({ ...sampleSession, status: 'locked' });
    await expect(updateStatus(mockPool, 't1', 'sess-1', 'finalized')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });

  it('throws NOT_FOUND when session does not exist', async () => {
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(null);
    await expect(updateStatus(mockPool, 't1', 'nonexistent', 'in_progress')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('Close session — getSession and listSessions', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('getSession returns null when not found', async () => {
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(null);
    const result = await getSession(mockPool, 't1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('listSessions returns array from repo', async () => {
    jest.spyOn(repo, 'listCloseSessions').mockResolvedValue([sampleSession]);
    const result = await listSessions(mockPool, { tenantId: 't1' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleSession);
  });
});

describe('Close session — certifyCloseSession', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('cannot certify unless session is locked', async () => {
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue({
      ...sampleSession,
      status: 'ready_for_review',
    });
    const updateCertSpy = jest.spyOn(repo, 'updateCertification');
    await expect(
      certifyCloseSession(
        mockPool,
        {
          tenantId: 't1',
          closeSessionId: 'sess-1',
          certifiedBy: 'approver@test.com',
        },
        'approver'
      )
    ).rejects.toMatchObject({ code: 'NOT_LOCKED' });
    expect(updateCertSpy).not.toHaveBeenCalled();
  });

  it('cannot certify when hardBlockers present', async () => {
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue({
      ...sampleSession,
      status: 'locked',
    });
    jest.spyOn(readiness, 'computeReadiness').mockResolvedValue({
      ready: false,
      hardBlockers: ['Required checklist items not complete'],
      softWarnings: [],
      checklistComplete: false,
      cashRecComplete: true,
      noCriticalIssues: true,
      materialJesApproved: true,
      integrityChecksPass: true,
    });
    await expect(
      certifyCloseSession(
        mockPool,
        {
          tenantId: 't1',
          closeSessionId: 'sess-1',
          certifiedBy: 'approver@test.com',
        },
        'approver'
      )
    ).rejects.toMatchObject({ code: 'HARD_BLOCKERS' });
  });

  it('cannot certify with preparer role (requires approver)', async () => {
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue({
      ...sampleSession,
      status: 'locked',
    });
    jest.spyOn(readiness, 'computeReadiness').mockResolvedValue({
      ready: true,
      hardBlockers: [],
      softWarnings: [],
      checklistComplete: true,
      cashRecComplete: true,
      noCriticalIssues: true,
      materialJesApproved: true,
      integrityChecksPass: true,
    });
    await expect(
      certifyCloseSession(
        mockPool,
        {
          tenantId: 't1',
          closeSessionId: 'sess-1',
          certifiedBy: 'preparer@test.com',
        },
        'preparer'
      )
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE' });
  });

  it('certifies when locked, no hard blockers, approver role', async () => {
    const lockedSession = { ...sampleSession, status: 'locked' as const };
    const certifiedSession = {
      ...lockedSession,
      status: 'certified' as const,
      certifiedBy: 'approver@test.com',
      certifiedAt: '2025-01-02T12:00:00Z',
      certificationMemo: 'Signed off',
      certifiedSnapshotId: 'snap-1',
      updatedAt: '2025-01-02T12:00:00Z',
    };
    jest.spyOn(repo, 'getCloseSessionById')
      .mockResolvedValueOnce(lockedSession)
      .mockResolvedValueOnce(certifiedSession);
    jest.spyOn(readiness, 'computeReadiness').mockResolvedValue({
      ready: true,
      hardBlockers: [],
      softWarnings: [],
      checklistComplete: true,
      cashRecComplete: true,
      noCriticalIssues: true,
      materialJesApproved: true,
      integrityChecksPass: true,
    });
    jest.spyOn(adjustedTb, 'getAdjustedTrialBalance').mockResolvedValue([
      { accountName: 'Cash', debit: 1000, credit: 0 },
      { accountName: 'Retained Earnings', debit: 0, credit: 1000 },
    ]);
    jest.spyOn(certifiedStatements, 'buildCertifiedStatementsFromSnapshot').mockReturnValue({} as never);
    jest.spyOn(ledgerSnapshot, 'createSnapshotFromTrialBalanceAndEntries').mockResolvedValue({
      id: 'snap-1',
      tenantId: 't1',
      periodLabel: '2025-01',
      closeSessionId: 'sess-1',
    } as never);
    jest.spyOn(repo, 'updateCertification').mockResolvedValue(certifiedSession);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    const result = await certifyCloseSession(
      mockPool,
      {
        tenantId: 't1',
        closeSessionId: 'sess-1',
        certifiedBy: 'approver@test.com',
        memo: 'Signed off',
      },
      'approver'
    );
    expect(result.status).toBe('certified');
    expect(result.certifiedBy).toBe('approver@test.com');
    expect(repo.updateCertification).toHaveBeenCalledWith(
      mockPool,
      't1',
      'sess-1',
      'approver@test.com',
      expect.any(String),
      'Signed off',
      'snap-1'
    );
    expect(auditLedger.recordMaterialEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        eventType: 'certify_close',
        tenantId: 't1',
        deterministicFlagSnapshot: expect.objectContaining({
          closeSessionId: 'sess-1',
          certifiedBy: 'approver@test.com',
          certifiedSnapshotId: 'snap-1',
        }),
      })
    );
  });
});
