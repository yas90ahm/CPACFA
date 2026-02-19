/**
 * Unit tests for unified issue service (tenant_close_issues) lifecycle:
 * create → assign → start → resolve → verify; waive (warning only); reopen; blocking gate.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as issueService from '../../src/services/issue_service.js';
import * as repo from '../../src/db/repositories/close_issue_repository.js';
/** @type {import('pg').Pool} */
const mockPool = {};

function baseIssue(overrides = {}) {
  return {
    issueId: 'issue-1',
    tenantId: 't1',
    periodId: 'period-1',
    entityId: 'e1',
    issueType: 'unmapped_account',
    severity: 'blocking',
    category: 'ingestion',
    status: 'detected',
    title: 'Unmapped account',
    description: 'Account 1000 has no mapping',
    affectedAccounts: ['1000'],
    affectedAmount: null,
    sourceCheck: 'detectUnmappedAccounts',
    sourceDetails: {},
    assignedTo: null,
    assignedAt: null,
    assignedBy: null,
    resolutionType: null,
    resolutionDescription: null,
    resolutionAjeId: null,
    resolutionReconId: null,
    resolutionMappingChange: null,
    resolvedBy: null,
    resolvedAt: null,
    verifiedBy: null,
    verifiedAt: null,
    verificationMethod: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Issue service — createIssue', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('creates issue in detected status', async () => {
    const created = baseIssue({ status: 'detected' });
    jest.spyOn(repo, 'insertCloseIssue').mockResolvedValue(created);
    jest.spyOn(repo, 'appendIssueHistory').mockResolvedValue(undefined);
    const result = await issueService.createIssue(mockPool, {
      tenantId: 't1',
      periodId: 'period-1',
      entityId: 'e1',
      issueType: 'unmapped_account',
      severity: 'blocking',
      category: 'ingestion',
      title: 'Unmapped account',
      description: 'Account 1000 has no mapping',
      affectedAccounts: ['1000'],
    });
    expect(result.status).toBe('detected');
    expect(repo.insertCloseIssue).toHaveBeenCalled();
    expect(repo.appendIssueHistory).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      'detected',
      'detected',
      'system',
      'Issue created'
    );
  });
});

describe('Issue service — full lifecycle', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('assign → start → resolve → verify records each transition', async () => {
    const detected = baseIssue({ status: 'detected' });
    const assigned = baseIssue({ status: 'assigned', assignedTo: 'u1', assignedAt: 'now', assignedBy: 'u0' });
    const inProgress = baseIssue({ status: 'in_progress' });
    const resolved = baseIssue({
      status: 'resolved',
      resolutionType: 'mapping_corrected',
      resolutionDescription: 'Mapped to cash',
      resolvedBy: 'u1',
      resolvedAt: 'now',
    });
    const verified = baseIssue({
      status: 'verified',
      verifiedBy: 'system',
      verifiedAt: 'now',
      verificationMethod: 'automatic_recheck',
    });

    jest.spyOn(repo, 'getCloseIssueById')
      .mockResolvedValueOnce(detected)
      .mockResolvedValueOnce(assigned)
      .mockResolvedValueOnce(inProgress)
      .mockResolvedValueOnce(resolved)
      .mockResolvedValueOnce(resolved);
    jest.spyOn(repo, 'updateIssueStatus')
      .mockResolvedValueOnce(assigned)
      .mockResolvedValueOnce(inProgress)
      .mockResolvedValueOnce(resolved)
      .mockResolvedValueOnce(verified);
    jest.spyOn(repo, 'appendIssueHistory').mockResolvedValue(undefined);

    const a = await issueService.assignIssue(mockPool, 't1', 'issue-1', 'u1', 'u0');
    expect(a.status).toBe('assigned');

    const b = await issueService.startProgress(mockPool, 't1', 'issue-1', 'u1');
    expect(b.status).toBe('in_progress');

    const c = await issueService.resolveIssue(mockPool, 't1', 'issue-1', {
      resolutionType: 'mapping_corrected',
      resolutionDescription: 'Mapped to cash',
      resolvedBy: 'u1',
    });
    expect(c.status).toBe('resolved');

    const d = await issueService.verifyIssue(mockPool, 't1', 'issue-1', 'system', 'automatic_recheck');
    expect(d.status).toBe('verified');

    expect(repo.appendIssueHistory).toHaveBeenCalledTimes(4);
  });
});

describe('Issue service — waiveIssue', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('rejects waive for blocking severity', async () => {
    jest.spyOn(repo, 'getCloseIssueById').mockResolvedValue(baseIssue({ severity: 'blocking', status: 'detected' }));
    await expect(
      issueService.waiveIssue(mockPool, 't1', 'issue-1', 'We accept the risk', 'u1')
    ).rejects.toMatchObject({ code: 'CANNOT_WAIVE' });
  });

  it('allows waive for warning with justification', async () => {
    const waived = baseIssue({ severity: 'warning', status: 'waived' });
    jest.spyOn(repo, 'getCloseIssueById').mockResolvedValue(baseIssue({ severity: 'warning', status: 'detected' }));
    jest.spyOn(repo, 'updateIssueStatus').mockResolvedValue(waived);
    jest.spyOn(repo, 'appendIssueHistory').mockResolvedValue(undefined);
    const result = await issueService.waiveIssue(mockPool, 't1', 'issue-1', 'Accepted with justification', 'u1');
    expect(result.status).toBe('waived');
  });
});

describe('Issue service — reopenIssue', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('reopens from resolved to in_progress', async () => {
    const resolved = baseIssue({ status: 'resolved' });
    const inProgress = baseIssue({ status: 'in_progress' });
    jest.spyOn(repo, 'getCloseIssueById').mockResolvedValue(resolved);
    jest.spyOn(repo, 'updateIssueStatus').mockResolvedValue(inProgress);
    jest.spyOn(repo, 'appendIssueHistory').mockResolvedValue(undefined);
    const result = await issueService.reopenIssue(mockPool, 't1', 'issue-1', 'Fix did not hold', 'u1');
    expect(result.status).toBe('in_progress');
    expect(repo.appendIssueHistory).toHaveBeenCalledWith(
      mockPool,
      'issue-1',
      'resolved',
      'in_progress',
      'u1',
      'Fix did not hold'
    );
  });
});

describe('Issue service — getBlockingIssuesForPeriod', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('returns only open critical/blocking issues', async () => {
    const blockingOpen = baseIssue({ issueId: 'b1', severity: 'blocking', status: 'detected' });
    const criticalOpen = baseIssue({ issueId: 'c1', severity: 'critical', status: 'in_progress' });
    const blockingVerified = baseIssue({ issueId: 'b2', severity: 'blocking', status: 'verified' });
    jest.spyOn(repo, 'listCloseIssues').mockResolvedValue([blockingOpen, criticalOpen, blockingVerified]);
    const result = await issueService.getBlockingIssuesForPeriod(mockPool, 'period-1', 't1');
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.issueId)).toContain('b1');
    expect(result.map((i) => i.issueId)).toContain('c1');
    expect(result.map((i) => i.issueId)).not.toContain('b2');
  });
});

describe('Issue service — getIssueSummaryForPeriod', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('returns counts by severity and status', async () => {
    const issues = [
      baseIssue({ severity: 'blocking', status: 'detected' }),
      baseIssue({ issueId: '2', severity: 'blocking', status: 'resolved' }),
      baseIssue({ issueId: '3', severity: 'warning', status: 'waived' }),
    ];
    jest.spyOn(repo, 'listCloseIssues').mockResolvedValue(issues);
    const summary = await issueService.getIssueSummaryForPeriod(mockPool, 'period-1', 't1');
    expect(summary.blocking).toBeDefined();
    expect(summary.warning).toBeDefined();
    expect(summary.critical).toBeDefined();
    expect(summary.info).toBeDefined();
  });
});

describe('Issue service — getIssueHistory', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('returns history entries for issue', async () => {
    const entries = [
      { historyId: 'h1', issueId: 'issue-1', fromStatus: 'detected', toStatus: 'detected', changedBy: 'system', changedAt: '2025-01-01T00:00:00Z', comment: 'Issue created' },
      { historyId: 'h2', issueId: 'issue-1', fromStatus: 'detected', toStatus: 'assigned', changedBy: 'u0', changedAt: '2025-01-02T00:00:00Z', comment: null },
    ];
    jest.spyOn(repo, 'getIssueHistory').mockResolvedValue(entries);
    const result = await issueService.getIssueHistory(mockPool, 'issue-1');
    expect(result).toHaveLength(2);
    expect(result[0].fromStatus).toBe('detected');
    expect(result[0].toStatus).toBe('detected');
    expect(result[1].toStatus).toBe('assigned');
  });
});

describe('Issue service — NOT_FOUND', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('assignIssue throws NOT_FOUND when issue missing', async () => {
    jest.spyOn(repo, 'getCloseIssueById').mockResolvedValue(null);
    await expect(issueService.assignIssue(mockPool, 't1', 'missing', 'u1', 'u0')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
