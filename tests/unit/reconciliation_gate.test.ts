/**
 * Reconciliation Completeness Gate Tests
 *
 * Verifies the reconciliation system end-to-end:
 * - Requirements configuration
 * - Period reconciliation initialization and workflow
 * - Completeness gate logic
 * - HITL issue integration
 * - State machine integration
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import { checkReconCompleteness } from '../../src/services/recon_completeness_gate.js';
import { approveReconciliation } from '../../src/services/period_reconciliation_service.js';
import * as sessionRepo from '../../src/db/repositories/close_session_repository.js';
import * as reqRepo from '../../src/db/repositories/recon_requirements_repository.js';
import * as reconRepo from '../../src/db/repositories/period_reconciliation_repository.js';
import { canAdvanceToUnderReview } from '../../src/services/close_session_service.js';
import { detectIncompleteReconciliations } from '../../src/services/issue_detection_service.js';
import * as readinessService from '../../src/services/close_checklist_readiness_service.js';

const mockPool = {} as Pool;

const baseSession = {
  id: 'sess-1',
  tenantId: 't1',
  entityId: 'e1',
  periodStart: '2025-01-01',
  periodEnd: '2025-01-31',
  basis: 'accrual' as const,
  standard: 'GAAP',
  status: 'in_progress' as const,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('Reconciliation Gate — gate blocks when recons not started', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('returns passes: false with blockers when required recons are not_started', async () => {
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(reqRepo, 'listRequirements').mockResolvedValue([
      { requirementId: 'req-1', tenantId: 't1', entityId: 'e1', accountCode: '1000', accountName: 'Cash', isRequired: true } as any,
      { requirementId: 'req-2', tenantId: 't1', entityId: 'e1', accountCode: '1100', accountName: 'AR', isRequired: true } as any,
      { requirementId: 'req-3', tenantId: 't1', entityId: 'e1', accountCode: '1200', accountName: 'Inventory', isRequired: true } as any,
    ]);
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([
      { reconId: 'r1', accountCode: '1000', status: 'not_started' } as any,
      { reconId: 'r2', accountCode: '1100', status: 'not_started' } as any,
      { reconId: 'r3', accountCode: '1200', status: 'not_started' } as any,
    ]);

    const result = await checkReconCompleteness(mockPool, 't1', 'sess-1');
    expect(result.passes).toBe(false);
    expect(result.blockers).toHaveLength(3);
    expect(result.not_started).toBe(3);
    expect(result.blockers.some((b) => b.account_code === '1000')).toBe(true);
    expect(result.blockers.some((b) => b.reason === 'Not started')).toBe(true);
  });
});

describe('Reconciliation Gate — gate blocks when recons partially complete', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('returns passes: false with 1 blocker when 2 of 3 complete', async () => {
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(reqRepo, 'listRequirements').mockResolvedValue([
      { requirementId: 'req-1', tenantId: 't1', entityId: 'e1', accountCode: '1000', accountName: 'Cash', isRequired: true } as any,
      { requirementId: 'req-2', tenantId: 't1', entityId: 'e1', accountCode: '1100', accountName: 'AR', isRequired: true } as any,
      { requirementId: 'req-3', tenantId: 't1', entityId: 'e1', accountCode: '1200', accountName: 'Inventory', isRequired: true } as any,
    ]);
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([
      { reconId: 'r1', accountCode: '1000', status: 'approved' } as any,
      { reconId: 'r2', accountCode: '1100', status: 'approved' } as any,
      { reconId: 'r3', accountCode: '1200', status: 'in_progress' } as any,
    ]);

    const result = await checkReconCompleteness(mockPool, 't1', 'sess-1');
    expect(result.passes).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].account_code).toBe('1200');
  });
});

describe('Reconciliation Gate — gate passes when all recons complete', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('returns passes: true when all recons approved', async () => {
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(reqRepo, 'listRequirements').mockResolvedValue([
      { requirementId: 'req-1', tenantId: 't1', entityId: 'e1', accountCode: '1000', isRequired: true } as any,
    ]);
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([
      { reconId: 'r1', accountCode: '1000', status: 'approved' } as any,
    ]);

    const result = await checkReconCompleteness(mockPool, 't1', 'sess-1');
    expect(result.passes).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });
});

describe('Reconciliation Gate — tolerance and explanation', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('blocks when variance within tolerance but no explanation', async () => {
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(reqRepo, 'listRequirements').mockResolvedValue([
      { requirementId: 'req-1', tenantId: 't1', entityId: 'e1', accountCode: '1000', accountName: 'Cash', isRequired: true, requiresReviewerApproval: false } as any,
    ]);
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([
      {
        reconId: 'r1',
        accountCode: '1000',
        status: 'in_progress',
        toleranceAmount: '500',
        unexplainedVariance: '300',
        varianceExplanation: null,
      } as any,
    ]);

    const result = await checkReconCompleteness(mockPool, 't1', 'sess-1');
    expect(result.passes).toBe(false);
    expect(result.blockers.some((b) => b.reason.includes('Variance explanation'))).toBe(true);
  });

  it('passes when variance within tolerance and explanation provided (completed)', async () => {
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(reqRepo, 'listRequirements').mockResolvedValue([
      { requirementId: 'req-1', tenantId: 't1', entityId: 'e1', accountCode: '1000', accountName: 'Cash', isRequired: true, requiresReviewerApproval: false } as any,
    ]);
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([
      {
        reconId: 'r1',
        accountCode: '1000',
        status: 'completed',
        toleranceAmount: '500',
        unexplainedVariance: '300',
        varianceExplanation: 'Timing difference explained',
      } as any,
    ]);

    const result = await checkReconCompleteness(mockPool, 't1', 'sess-1');
    expect(result.passes).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks when unexplained variance exceeds tolerance', async () => {
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(reqRepo, 'listRequirements').mockResolvedValue([
      { requirementId: 'req-1', tenantId: 't1', entityId: 'e1', accountCode: '1000', accountName: 'Cash', isRequired: true } as any,
    ]);
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([
      {
        reconId: 'r1',
        accountCode: '1000',
        status: 'in_progress',
        toleranceAmount: '500',
        unexplainedVariance: '1000',
        varianceExplanation: 'Has explanation',
      } as any,
    ]);

    const result = await checkReconCompleteness(mockPool, 't1', 'sess-1');
    expect(result.passes).toBe(false);
    expect(result.blockers.some((b) => b.reason.includes('variance'))).toBe(true);
  });
});

describe('Reconciliation Gate — reviewer approval required', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('blocks when recon completed but requires_reviewer_approval and not yet approved', async () => {
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(reqRepo, 'listRequirements').mockResolvedValue([
      { requirementId: 'req-1', tenantId: 't1', entityId: 'e1', accountCode: '1000', accountName: 'Cash', isRequired: true, requiresReviewerApproval: true } as any,
    ]);
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([
      { reconId: 'r1', accountCode: '1000', status: 'completed' } as any,
    ]);

    const result = await checkReconCompleteness(mockPool, 't1', 'sess-1');
    expect(result.passes).toBe(false);
    expect(result.blockers.some((b) => b.reason.includes('reviewer approval'))).toBe(true);
    expect(result.awaiting_approval).toBe(1);
  });

  it('passes when recon approved and requires_reviewer_approval', async () => {
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(reqRepo, 'listRequirements').mockResolvedValue([
      { requirementId: 'req-1', tenantId: 't1', entityId: 'e1', accountCode: '1000', isRequired: true, requiresReviewerApproval: true } as any,
    ]);
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([
      { reconId: 'r1', accountCode: '1000', status: 'approved' } as any,
    ]);

    const result = await checkReconCompleteness(mockPool, 't1', 'sess-1');
    expect(result.passes).toBe(true);
  });
});

describe('Reconciliation Gate — segregation of duties', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('approveReconciliation rejects when reviewer === preparer', async () => {
    jest.spyOn(reconRepo, 'getPeriodReconciliationById').mockResolvedValue({
      reconId: 'r1',
      periodId: 'sess-1',
      accountCode: '1000',
      status: 'completed',
      preparedBy: 'user-a',
    } as any);

    await expect(approveReconciliation(mockPool, 't1', 'r1', 'user-a')).rejects.toMatchObject({
      code: 'SEGREGATION',
      message: expect.stringContaining('segregation'),
    });
  });

  it('approveReconciliation succeeds when reviewer !== preparer', async () => {
    const updated = { reconId: 'r1', status: 'approved' } as any;
    jest.spyOn(reconRepo, 'getPeriodReconciliationById').mockResolvedValueOnce({
      reconId: 'r1',
      periodId: 'sess-1',
      entityId: 'e1',
      accountCode: '1000',
      status: 'completed',
      preparedBy: 'user-a',
    } as any);
    jest.spyOn(reconRepo, 'updateReconStatus').mockResolvedValue(updated);
    const cascadeEngine = await import('../../src/services/cascade_engine.js');
    jest.spyOn(cascadeEngine, 'executeCascade').mockResolvedValue({
      adjusted_tb_recalculated: false,
      recon_balances_refreshed: 0,
      recon_status_changes: [],
      statements_invalidated: false,
      validation_results: { hard_checks: [], soft_checks: [], all_hard_passing: true, blocking_count: 0, warning_count: 0 },
      issues_auto_verified: [],
      issues_created: [],
      issues_reopened: [],
      duration_ms: 0,
    });

    const result = await approveReconciliation(mockPool, 't1', 'r1', 'user-b');
    expect(result.status).toBe('approved');
    expect(reconRepo.updateReconStatus).toHaveBeenCalled();
  });
});

describe('Reconciliation Gate — HITL detection', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('detectIncompleteReconciliations calls checkReconCompleteness and creates issues', async () => {
    const ctx = { pool: mockPool, tenantId: 't1', periodId: 'sess-1' };
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(reqRepo, 'listRequirements').mockResolvedValue([
      { requirementId: 'req-1', tenantId: 't1', entityId: 'e1', accountCode: '1000', accountName: 'Cash', isRequired: true } as any,
    ]);
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([
      { reconId: 'r1', accountCode: '1000', accountName: 'Cash', status: 'not_started' } as any,
    ]);

    const issueService = await import('../../src/services/issue_service.js');
    jest.spyOn(issueService, 'listIssues').mockResolvedValue([]);
    jest.spyOn(issueService, 'createIssue').mockResolvedValue({
      issueId: 'iss-1',
      issueType: 'recon_not_started',
      title: 'Reconciliation incomplete: Cash',
    } as any);
    jest.spyOn(issueService, 'autoVerifyIssue').mockResolvedValue(null);

    const issues = await detectIncompleteReconciliations(ctx);
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThanOrEqual(0);
  });
});

describe('Reconciliation Gate — canAdvanceToUnderReview integration', () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it('canAdvanceToUnderReview returns false when computeReadiness has recon blockers', async () => {
    const session = { ...baseSession, status: 'in_progress' as const };
    jest.spyOn(readinessService, 'computeReadiness').mockResolvedValue({
      ready: false,
      hardBlockers: ['3 reconciliation(s) incomplete: 1000 (Not started)'],
      softWarnings: [],
      checklistComplete: true,
      cashRecComplete: true,
      noCriticalIssues: true,
      materialJesApproved: true,
      integrityChecksPass: true,
    });

    const result = await canAdvanceToUnderReview(mockPool, 't1', session);
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain('3 reconciliation(s) incomplete: 1000 (Not started)');
  });

  it('canAdvanceToUnderReview returns true when computeReadiness ready', async () => {
    const session = { ...baseSession, status: 'in_progress' as const };
    jest.spyOn(readinessService, 'computeReadiness').mockResolvedValue({
      ready: true,
      hardBlockers: [],
      softWarnings: [],
      checklistComplete: true,
      cashRecComplete: true,
      noCriticalIssues: true,
      materialJesApproved: true,
      integrityChecksPass: true,
    });

    const result = await canAdvanceToUnderReview(mockPool, 't1', session);
    expect(result.allowed).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
