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
  advanceSession,
  getAllowedTransitions,
  CloseSessionError,
  periodLabelToPeriodBounds,
  ensureSessionForPeriod,
} from '../../src/services/close_session_service.js';
import * as repo from '../../src/db/repositories/close_session_repository.js';
import * as readiness from '../../src/services/close_checklist_readiness_service.js';
import * as segregation from '../../src/services/segregation_service.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';
import * as adjustedTb from '../../src/services/adjusted_trial_balance_service.js';
import * as certifiedStatements from '../../src/services/certified_statements_service.js';
import * as ledgerSnapshot from '../../src/services/ledger_snapshot_service.js';
import * as transaction from '../../src/db/transaction.js';
import * as evidencePolicy from '../../src/services/evidence_policy_service.js';

const mockPool = {} as Pool;

/** Mock client for transaction callbacks: supports query for row lock. */
function createMockClient(lockRows: { id: string; status: string }[] = [{ id: 'sess-1', status: 'under_review' }]) {
  return {
    query: jest.fn().mockImplementation(() => Promise.resolve({ rows: lockRows })),
  };
}

const sampleSession = {
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

describe('Close session — getAllowedTransitions', () => {
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

describe('Close session — createSession', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('creates session with defaults (accrual, GAAP, open)', async () => {
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
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
  });

  it('allows open -> in_progress', async () => {
    jest.spyOn(repo, 'getCloseSessionByIdForUpdate').mockResolvedValue({ ...sampleSession, status: 'open' });
    jest.spyOn(repo, 'updateCloseSessionStatus').mockResolvedValue({
      ...sampleSession,
      status: 'in_progress',
      periodEnd: '2025-01-31',
      updatedAt: '2025-01-02T00:00:00Z',
    });
    const result = await updateStatus(mockPool, 't1', 'sess-1', 'in_progress');
    expect(result.status).toBe('in_progress');
    expect(auditLedger.recordMaterialEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'close_session_transition',
        deterministicFlagSnapshot: expect.objectContaining({ from: 'open', to: 'in_progress', sessionId: 'sess-1' }),
      })
    );
  });

  it('rejects open -> certified (invalid transition)', async () => {
    jest.spyOn(repo, 'getCloseSessionByIdForUpdate').mockResolvedValue({ ...sampleSession, status: 'open' });
    const updateSpy = jest.spyOn(repo, 'updateCloseSessionStatus');
    await expect(updateStatus(mockPool, 't1', 'sess-1', 'certified')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      message: expect.stringMatching(/open.*certified|Transition.*not allowed/),
    });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('under_review -> certified only via certifyCloseSession (not updateStatus)', async () => {
    jest.spyOn(repo, 'getCloseSessionByIdForUpdate').mockResolvedValue({ ...sampleSession, status: 'under_review' });
    await expect(updateStatus(mockPool, 't1', 'sess-1', 'certified')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });

  it('throws NOT_FOUND when session does not exist', async () => {
    jest.spyOn(repo, 'getCloseSessionByIdForUpdate').mockResolvedValue(null);
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
    jest.spyOn(transaction, 'withTransaction').mockImplementation(async (_pool, fn) => fn(createMockClient() as never));
  });

  it('cannot certify unless session is under_review', async () => {
    jest.spyOn(transaction, 'withTransaction').mockImplementation(async (_pool, fn) =>
      fn(createMockClient([{ id: 'sess-1', status: 'in_progress' }]) as never)
    );
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
    ).rejects.toMatchObject({ code: 'NOT_UNDER_REVIEW' });
    expect(updateCertSpy).not.toHaveBeenCalled();
  });

  it('cannot certify when statementsStaleSince is set', async () => {
    jest.spyOn(transaction, 'withTransaction').mockImplementation(async (_pool, fn) =>
      fn(createMockClient([{ id: 'sess-1', status: 'under_review' }]) as never)
    );
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue({
      ...sampleSession,
      status: 'under_review',
      statementsStaleSince: '2025-01-15T10:00:00Z',
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
      jeTotal: 0,
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
    ).rejects.toMatchObject({ code: 'VALIDATION', message: /regenerate statements/ });
  });

  it('cannot certify when hardBlockers present', async () => {
    jest.spyOn(transaction, 'withTransaction').mockImplementation(async (_pool, fn) =>
      fn(createMockClient([{ id: 'sess-1', status: 'under_review' }]) as never)
    );
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue({
      ...sampleSession,
      status: 'under_review',
    });
    jest.spyOn(evidencePolicy, 'checkEvidencePolicyForCertification').mockResolvedValue({
      hardBlockers: [],
      softWarnings: [],
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
      jeTotal: 0,
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
      status: 'under_review',
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
      jeTotal: 0,
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

  it('certifies when under_review, no hard blockers, approver role', async () => {
    const underReviewSession = { ...sampleSession, status: 'under_review' as const };
    const certifiedSession = {
      ...underReviewSession,
      status: 'certified' as const,
      certifiedBy: 'approver@test.com',
      certifiedAt: '2025-01-02T12:00:00Z',
      certificationMemo: 'Signed off',
      certifiedSnapshotId: 'snap-1',
      updatedAt: '2025-01-02T12:00:00Z',
    };
    jest.spyOn(transaction, 'withTransaction').mockImplementation(async (_pool, fn) => {
      const mockClient = createMockClient([{ id: 'sess-1', status: 'under_review' }]);
      return fn(mockClient as never);
    });
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(underReviewSession);
    jest.spyOn(readiness, 'computeReadiness').mockResolvedValue({
      ready: true,
      hardBlockers: [],
      softWarnings: [],
      checklistComplete: true,
      cashRecComplete: true,
      noCriticalIssues: true,
      materialJesApproved: true,
      integrityChecksPass: true,
      jeTotal: 0,
    });
    jest.spyOn(adjustedTb, 'getTrialBalanceForCertification').mockResolvedValue({
      trialBalance: [
        { accountName: 'Cash', debit: 1000, credit: 0 },
        { accountName: 'Retained Earnings', debit: 0, credit: 1000 },
      ],
      source: 'adjusted',
      hasGL: false,
    });
    jest.spyOn(certifiedStatements, 'buildCertifiedStatementsFromSnapshot').mockReturnValue({
      balanceSheet: {
        totalAssets: 1000,
        totalLiabilities: 0,
        totalEquity: 1000,
        assets: [{ label: 'Cash', amount: 1000 }],
        liabilities: [],
        equity: [],
      },
      profitAndLoss: { netIncome: 0, totalRevenue: 0, totalExpenses: 0, revenue: [], expenses: [] },
      cashFlow: { endingCash: 1000, operating: [], investing: [], financing: [] },
      equityChanges: { closingEquity: 1000, changes: [{ label: 'Net Income', amount: 0 }] },
    } as never);
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
      expect.anything(),
      't1',
      'sess-1',
      'approver@test.com',
      expect.any(String),
      'Signed off',
      'snap-1',
      null
    );
    expect(auditLedger.recordMaterialEvent).toHaveBeenCalledWith(
      expect.anything(),
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

describe('Close session — periodLabelToPeriodBounds', () => {
  it('returns first and last day of month for YYYY-MM', () => {
    expect(periodLabelToPeriodBounds('2025-06')).toEqual({ periodStart: '2025-06-01', periodEnd: '2025-06-30' });
    expect(periodLabelToPeriodBounds('2025-02')).toEqual({ periodStart: '2025-02-01', periodEnd: '2025-02-28' });
    expect(periodLabelToPeriodBounds('2024-02')).toEqual({ periodStart: '2024-02-01', periodEnd: '2024-02-29' });
  });
  it('returns null for invalid format', () => {
    expect(periodLabelToPeriodBounds('')).toBeNull();
    expect(periodLabelToPeriodBounds('2025')).toBeNull();
    expect(periodLabelToPeriodBounds('2025-13')).toBeNull();
    expect(periodLabelToPeriodBounds('2025-00')).toBeNull();
  });
});

describe('Close session — ensureSessionForPeriod (getOrCreate)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns existing session when overlapping session exists (created=false)', async () => {
    const existing = { ...sampleSession, id: 'existing-id' };
    jest.spyOn(repo, 'getOverlappingSession').mockResolvedValue(existing);
    const result = await ensureSessionForPeriod(mockPool, 't1', 'e1', '2025-01');
    expect(result.session).toEqual(existing);
    expect(result.created).toBe(false);
    expect(repo.getOverlappingSession).toHaveBeenCalledWith(mockPool, 't1', 'e1', '2025-01-01', '2025-01-31');
  });

  it('creates open session when none exists (created=true)', async () => {
    jest.spyOn(repo, 'getOverlappingSession').mockResolvedValue(null);
    jest.spyOn(repo, 'hasOverlappingSession').mockResolvedValue(false);
    jest.spyOn(repo, 'insertCloseSession').mockResolvedValue({ ...sampleSession, id: 'new-id' });
    const result = await ensureSessionForPeriod(mockPool, 't1', 'e1', '2025-03');
    expect(result.created).toBe(true);
    expect(result.session.status).toBe('open');
    expect(repo.insertCloseSession).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      't1',
      'e1',
      '2025-03-01',
      '2025-03-31',
      'accrual',
      'GAAP',
      'open'
    );
  });

  it('throws VALIDATION for invalid periodLabel', async () => {
    await expect(ensureSessionForPeriod(mockPool, 't1', 'e1', 'invalid')).rejects.toThrow(CloseSessionError);
    await expect(ensureSessionForPeriod(mockPool, 't1', 'e1', 'invalid')).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('Close session — advanceSession governance (close_lock)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(transaction, 'withTransaction').mockImplementation(async (_pool, fn) => fn(createMockClient() as never));
  });

  it('advances open -> in_progress (one step per call)', async () => {
    const openSession = { ...sampleSession, status: 'open' as const };
    const inProgressSession = { ...sampleSession, status: 'in_progress' as const };

    jest.spyOn(repo, 'getCloseSessionByIdForUpdate').mockResolvedValue(openSession);
    jest.spyOn(repo, 'getCloseSessionById').mockResolvedValue(openSession);
    jest.spyOn(repo, 'updateCloseSessionStatus').mockResolvedValue(inProgressSession);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();

    const result = await advanceSession(mockPool, {
      tenantId: 't1',
      closeSessionId: 'sess-1',
      actorRole: 'approver',
    });

    expect(result.success).toBe(true);
    expect(result.actionTaken).toBe('advanced');
    expect(result.statusAfter).toBe('in_progress');
    expect(auditLedger.recordMaterialEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'close_session_transition',
        tenantId: 't1',
        deterministicFlagSnapshot: expect.objectContaining({
          sessionId: 'sess-1',
          from: 'open',
          to: 'in_progress',
        }),
      })
    );
  });
});
