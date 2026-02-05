/**
 * Issue item service unit tests: create, list, filter, status transitions.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import {
  createIssue,
  getIssue,
  listIssues,
  resolveIssue,
  assignIssue,
  updateIssueStatus,
  createIssueFromImportValidation,
  createIssueFromLowConfidenceClassification,
  createIssueFromIntegrityFailure,
  IssueItemError,
} from '../../src/services/issue_item_service.js';
import * as repo from '../../src/db/repositories/issue_item_repository.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';

const mockPool = {} as Pool;

const sampleIssue = {
  id: 'issue-1',
  closeSessionId: 'sess-1',
  tenantId: 't1',
  category: 'intake' as const,
  severity: 'med' as const,
  status: 'open' as const,
  title: 'Missing account',
  description: undefined,
  impactPl: undefined,
  impactBs: undefined,
  impactCash: undefined,
  currency: undefined,
  materialityEstimate: undefined,
  materialityThresholdUsed: undefined,
  confidenceScore: undefined,
  sourceRef: undefined,
  assignedTo: undefined,
  dueDate: undefined,
  createdBy: undefined,
  updatedBy: undefined,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('Issue item — createIssue', () => {
  beforeEach(() => {
  jest.restoreAllMocks();
});

  it('creates issue with required fields', async () => {
    jest.spyOn(repo, 'insertIssueItem').mockResolvedValue(sampleIssue);
    const result = await createIssue(mockPool, {
      closeSessionId: 'sess-1',
      tenantId: 't1',
      category: 'intake',
      severity: 'med',
      title: 'Missing account',
    });
    expect(result).toEqual(sampleIssue);
    expect(repo.insertIssueItem).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      expect.objectContaining({
        closeSessionId: 'sess-1',
        tenantId: 't1',
        category: 'intake',
        severity: 'med',
        status: 'open',
        title: 'Missing account',
      })
    );
  });
});

describe('Issue item — listIssues', () => {
  beforeEach(() => {
  jest.restoreAllMocks();
});

  it('lists issues with no filters', async () => {
    jest.spyOn(repo, 'listIssueItems').mockResolvedValue([sampleIssue]);
    const result = await listIssues(mockPool, { tenantId: 't1' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(sampleIssue);
    expect(repo.listIssueItems).toHaveBeenCalledWith(mockPool, { tenantId: 't1' });
  });

  it('lists issues with filters (closeSessionId, status, category)', async () => {
    jest.spyOn(repo, 'listIssueItems').mockResolvedValue([sampleIssue]);
    await listIssues(mockPool, {
      tenantId: 't1',
      closeSessionId: 'sess-1',
      status: 'open',
      category: 'intake',
    });
    expect(repo.listIssueItems).toHaveBeenCalledWith(mockPool, {
      tenantId: 't1',
      closeSessionId: 'sess-1',
      status: 'open',
      category: 'intake',
    });
  });
});

describe('Issue item — resolveIssue', () => {
  beforeEach(() => {
  jest.restoreAllMocks();
});

  it('resolves issue to resolved', async () => {
    jest.spyOn(repo, 'getIssueItemById').mockResolvedValue(sampleIssue);
    jest.spyOn(repo, 'updateIssueStatus').mockResolvedValue({
      ...sampleIssue,
      status: 'resolved',
      updatedAt: '2025-01-02T00:00:00Z',
    });
    jest.spyOn(closeSessionRepo, 'getCloseSessionById').mockResolvedValue({ periodEnd: '2025-01-31' } as never);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    const result = await resolveIssue(mockPool, 't1', 'issue-1', 'resolved', 'user-1');
    expect(result.status).toBe('resolved');
  });

  it('resolves issue to wont_fix', async () => {
    jest.spyOn(repo, 'getIssueItemById').mockResolvedValue(sampleIssue);
    jest.spyOn(repo, 'updateIssueStatus').mockResolvedValue({
      ...sampleIssue,
      status: 'wont_fix',
      updatedAt: '2025-01-02T00:00:00Z',
    });
    jest.spyOn(closeSessionRepo, 'getCloseSessionById').mockResolvedValue({ periodEnd: '2025-01-31' } as never);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    const result = await resolveIssue(mockPool, 't1', 'issue-1', 'wont_fix');
    expect(result.status).toBe('wont_fix');
  });

  it('throws INVALID_STATUS when issue already resolved', async () => {
    jest.spyOn(repo, 'getIssueItemById').mockResolvedValue({ ...sampleIssue, status: 'resolved' });
    await expect(resolveIssue(mockPool, 't1', 'issue-1', 'resolved')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      message: expect.stringMatching(/already in terminal/),
    });
  });

  it('throws NOT_FOUND when issue does not exist', async () => {
    jest.spyOn(repo, 'getIssueItemById').mockResolvedValue(null);
    await expect(resolveIssue(mockPool, 't1', 'nonexistent', 'resolved')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('Issue item — assignIssue', () => {
  beforeEach(() => {
  jest.restoreAllMocks();
});

  it('assigns issue to user with due date', async () => {
    jest.spyOn(repo, 'updateIssueAssignment').mockResolvedValue({
      ...sampleIssue,
      assignedTo: 'user@example.com',
      dueDate: '2025-02-01',
      updatedAt: '2025-01-02T00:00:00Z',
    });
    const result = await assignIssue(mockPool, 't1', 'issue-1', 'user@example.com', '2025-02-01', 'admin');
    expect(result.assignedTo).toBe('user@example.com');
    expect(result.dueDate).toBe('2025-02-01');
  });

  it('throws NOT_FOUND when issue does not exist', async () => {
    jest.spyOn(repo, 'updateIssueAssignment').mockResolvedValue(null);
    await expect(assignIssue(mockPool, 't1', 'nonexistent', 'user@example.com')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('Issue item — updateIssueStatus', () => {
  beforeEach(() => {
  jest.restoreAllMocks();
});

  it('updates status to in_progress', async () => {
    jest.spyOn(repo, 'getIssueItemById').mockResolvedValue(sampleIssue);
    jest.spyOn(repo, 'updateIssueStatus').mockResolvedValue({
      ...sampleIssue,
      status: 'in_progress',
      updatedAt: '2025-01-02T00:00:00Z',
    });
    jest.spyOn(closeSessionRepo, 'getCloseSessionById').mockResolvedValue({ periodEnd: '2025-01-31' } as never);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    const result = await updateIssueStatus(mockPool, 't1', 'issue-1', 'in_progress');
    expect(result.status).toBe('in_progress');
  });

  it('throws INVALID_STATUS when issue already resolved', async () => {
    jest.spyOn(repo, 'getIssueItemById').mockResolvedValue({ ...sampleIssue, status: 'resolved' });
    await expect(updateIssueStatus(mockPool, 't1', 'issue-1', 'in_progress')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
  });
});

describe('Issue item — helper createIssueFromImportValidation', () => {
  beforeEach(() => {
  jest.restoreAllMocks();
});

  it('creates intake issue with title and optional description', async () => {
    jest.spyOn(repo, 'insertIssueItem').mockResolvedValue({
      ...sampleIssue,
      category: 'intake',
      title: 'Invalid column',
      description: 'Column X missing',
    });
    const result = await createIssueFromImportValidation(
      { pool: mockPool, tenantId: 't1', closeSessionId: 'sess-1' },
      { title: 'Invalid column', description: 'Column X missing', severity: 'high' }
    );
    expect(result.title).toBe('Invalid column');
    expect(repo.insertIssueItem).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      expect.objectContaining({
        category: 'intake',
        severity: 'high',
        title: 'Invalid column',
        description: 'Column X missing',
      })
    );
  });
});

describe('Issue item — helper createIssueFromLowConfidenceClassification', () => {
  beforeEach(() => {
  jest.restoreAllMocks();
});

  it('creates classification issue with confidence and sourceRef', async () => {
    jest.spyOn(repo, 'insertIssueItem').mockResolvedValue({
      ...sampleIssue,
      category: 'classification',
      confidenceScore: 0.4,
      sourceRef: { accountName: 'Misc Receivables', suggestedType: 'ASSET' },
    });
    const result = await createIssueFromLowConfidenceClassification(
      { pool: mockPool, tenantId: 't1', closeSessionId: 'sess-1' },
      {
        title: 'Low confidence: Misc Receivables',
        confidenceScore: 0.4,
        accountName: 'Misc Receivables',
        suggestedType: 'ASSET',
      }
    );
    expect(result.confidenceScore).toBe(0.4);
    expect(repo.insertIssueItem).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      expect.objectContaining({
        category: 'classification',
        confidenceScore: 0.4,
        sourceRef: expect.objectContaining({ accountName: 'Misc Receivables', suggestedType: 'ASSET' }),
      })
    );
  });
});

describe('Issue item — helper createIssueFromIntegrityFailure', () => {
  beforeEach(() => {
  jest.restoreAllMocks();
});

  it('creates posting/export_blocker issue with impact and materiality', async () => {
    jest.spyOn(repo, 'insertIssueItem').mockResolvedValue({
      ...sampleIssue,
      category: 'export_blocker',
      severity: 'critical',
      impactPl: 1000,
      materialityEstimate: 500,
    });
    const result = await createIssueFromIntegrityFailure(
      { pool: mockPool, tenantId: 't1', closeSessionId: 'sess-1' },
      {
        title: 'Covenant breach',
        category: 'export_blocker',
        severity: 'critical',
        impactPl: 1000,
        materialityEstimate: 500,
      }
    );
    expect(result.category).toBe('export_blocker');
    expect(repo.insertIssueItem).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      expect.objectContaining({
        category: 'export_blocker',
        severity: 'critical',
        impactPl: 1000,
        materialityEstimate: 500,
      })
    );
  });
});
