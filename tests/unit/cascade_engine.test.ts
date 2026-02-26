/**
 * Cascade Engine Tests
 *
 * Verifies that mutations trigger correct downstream updates
 * and that the cascade is complete, correct, and bounded.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import {
  executeCascade,
  CascadeTriggerType,
} from '../../src/services/cascade_engine.js';
import * as sessionRepo from '../../src/db/repositories/close_session_repository.js';
import * as stmtRepo from '../../src/db/repositories/statement_package_repository.js';
import * as reconRepo from '../../src/db/repositories/period_reconciliation_repository.js';
import * as periodRecon from '../../src/services/period_reconciliation_service.js';
import * as readinessService from '../../src/services/close_checklist_readiness_service.js';
import * as issueAutoRes from '../../src/services/issue_auto_resolution_service.js';

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

const baseTrigger = {
  type: CascadeTriggerType.AJE_POSTED,
  period_id: 'sess-1',
  entity_id: 'e1',
  triggered_by: 'user-1',
  affected_accounts: ['1000', '4000'],
  details: { aje_id: 'je-1' },
};

describe('Cascade Engine — AJE posting triggers full cascade', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(periodRecon, 'refreshGLBalances').mockResolvedValue({ updated: 2, reverted: [] });
    jest.spyOn(stmtRepo, 'getMaxVersionByCloseSessionId').mockResolvedValue(1);
    jest.spyOn(sessionRepo, 'setStatementsStaleSince').mockResolvedValue(undefined);
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
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([]);
    jest.spyOn(issueAutoRes, 'runCascade').mockResolvedValue({
      issues_auto_verified: [],
      new_issues_created: [],
    });
  });

  it('returns cascade result with adjusted TB recalculated, recons refreshed, statements invalidated', async () => {
    const result = await executeCascade(mockPool, 't1', baseTrigger);
    expect(result.adjusted_tb_recalculated).toBe(true);
    expect(result.recon_balances_refreshed).toBe(2);
    expect(result.statements_invalidated).toBe(true);
    expect(result.validation_results).toBeDefined();
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('runs validation checks (computeReadiness)', async () => {
    const result = await executeCascade(mockPool, 't1', baseTrigger);
    expect(readinessService.computeReadiness).toHaveBeenCalledWith(
      mockPool,
      't1',
      baseSession
    );
    expect(result.validation_results.all_hard_passing).toBe(true);
  });

  it('calls HITL runCascade', async () => {
    await executeCascade(mockPool, 't1', baseTrigger);
    expect(issueAutoRes.runCascade).toHaveBeenCalled();
  });
});

describe('Cascade Engine — cascade does NOT regenerate statements', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(periodRecon, 'refreshGLBalances').mockResolvedValue({ updated: 0, reverted: [] });
    jest.spyOn(stmtRepo, 'getMaxVersionByCloseSessionId').mockResolvedValue(1);
    jest.spyOn(sessionRepo, 'setStatementsStaleSince').mockResolvedValue(undefined);
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
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([]);
    jest.spyOn(issueAutoRes, 'runCascade').mockResolvedValue({
      issues_auto_verified: [],
      new_issues_created: [],
    });
  });

  it('invalidates statements (setStatementsStaleSince) but does not regenerate', async () => {
    await executeCascade(mockPool, 't1', baseTrigger);
    expect(sessionRepo.setStatementsStaleSince).toHaveBeenCalled();
  });
});

describe('Cascade Engine — recon_completed trigger', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(periodRecon, 'refreshGLBalances').mockResolvedValue({ updated: 0, reverted: [] });
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
    jest.spyOn(issueAutoRes, 'runCascade').mockResolvedValue({
      issues_auto_verified: ['iss-1'],
      new_issues_created: [],
    });
  });

  it('does NOT recalc TB or invalidate statements for recon_completed', async () => {
    const trigger = {
      ...baseTrigger,
      type: CascadeTriggerType.RECON_COMPLETED,
      affected_accounts: ['1000'],
    };
    const result = await executeCascade(mockPool, 't1', trigger);
    expect(result.adjusted_tb_recalculated).toBe(false);
    expect(result.statements_invalidated).toBe(false);
    expect(periodRecon.refreshGLBalances).not.toHaveBeenCalled();
  });
});

describe('Cascade Engine — recursion guard', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
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
    jest.spyOn(issueAutoRes, 'runCascade').mockResolvedValue({
      issues_auto_verified: [],
      new_issues_created: [],
    });
  });

  it('returns empty result at depth 3 without calling downstream', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await executeCascade(mockPool, 't1', baseTrigger, 3);
    expect(result.adjusted_tb_recalculated).toBe(false);
    expect(result.recon_balances_refreshed).toBe(0);
    expect(result.duration_ms).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/depth limit reached/)
    );
    consoleSpy.mockRestore();
  });
});

describe('Cascade Engine — unknown session returns empty result', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(null);
    const refreshSpy = jest.spyOn(periodRecon, 'refreshGLBalances');
    refreshSpy.mockResolvedValue({ updated: 0, reverted: [] });
  });

  it('returns empty result when session not found', async () => {
    const result = await executeCascade(mockPool, 't1', baseTrigger);
    expect(result.adjusted_tb_recalculated).toBe(false);
    expect(result.recon_balances_refreshed).toBe(0);
    expect(result.statements_invalidated).toBe(false);
    expect(periodRecon.refreshGLBalances).not.toHaveBeenCalled();
  });
});

describe('Cascade Engine — TB_REINGESTED triggers full cascade', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(sessionRepo, 'getCloseSessionById').mockResolvedValue(baseSession);
    jest.spyOn(periodRecon, 'refreshGLBalances').mockResolvedValue({ updated: 5, reverted: [] });
    jest.spyOn(stmtRepo, 'getMaxVersionByCloseSessionId').mockResolvedValue(2);
    jest.spyOn(sessionRepo, 'setStatementsStaleSince').mockResolvedValue(undefined);
    jest.spyOn(readinessService, 'computeReadiness').mockResolvedValue({
      ready: false,
      hardBlockers: ['Checklist incomplete'],
      softWarnings: [],
      checklistComplete: false,
      cashRecComplete: true,
      noCriticalIssues: true,
      materialJesApproved: true,
      integrityChecksPass: true,
    });
    jest.spyOn(reconRepo, 'listPeriodReconciliationsByPeriod').mockResolvedValue([]);
    jest.spyOn(issueAutoRes, 'runCascade').mockResolvedValue({
      issues_auto_verified: [],
      new_issues_created: ['iss-new'],
    });
  });

  it('affects TB: recalculates, refreshes recons, invalidates statements', async () => {
    const trigger = {
      ...baseTrigger,
      type: CascadeTriggerType.TB_REINGESTED,
      affected_accounts: [],
    };
    const result = await executeCascade(mockPool, 't1', trigger);
    expect(result.adjusted_tb_recalculated).toBe(true);
    expect(result.recon_balances_refreshed).toBe(5);
    expect(result.statements_invalidated).toBe(true);
    expect(result.issues_created).toContain('iss-new');
  });
});
