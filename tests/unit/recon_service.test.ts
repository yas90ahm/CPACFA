/**
 * Reconciliation state machine — unit tests: create run, ingest items, propose/confirm/reject matches,
 * mark timing difference, signoff, unmatched items, emit issues above materiality.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import {
  createReconRun,
  ingestReconItems,
  proposeMatches,
  confirmMatchGroup,
  rejectMatchGroup,
  markTimingDifference,
  signOffReconRun,
  getReconRun,
  listReconRunsByCloseSession,
  listReconItemsByRunId,
  listReconMatchGroupsByRunId,
  getUnmatchedReconItems,
  emitIssuesForUnmatchedAboveMateriality,
  ReconError,
} from '../../src/services/recon_service.js';
import * as repo from '../../src/db/repositories/recon_repository.js';
import * as issueService from '../../src/services/issue_item_service.js';
import * as triageService from '../../src/services/triage_service.js';

const mockPool = {} as Pool;

const sampleRun = {
  id: 'run-1',
  closeSessionId: 'sess-1',
  type: 'bank' as const,
  createdAt: '2025-01-01T00:00:00Z',
  status: 'draft' as const,
};

const sampleItem = {
  id: 'item-1',
  reconRunId: 'run-1',
  source: 'bank' as const,
  amount: 100,
  itemDate: '2025-01-15',
  description: 'Deposit',
  ref: { bankTxId: 'tx-1' },
  createdAt: '2025-01-01T00:00:00Z',
};

const sampleGroup = {
  id: 'mg-1',
  reconRunId: 'run-1',
  status: 'proposed' as const,
  matchConfidence: 0.9,
  decisionRecordId: 'dr-1',
  createdAt: '2025-01-01T00:00:00Z',
};

describe('Recon service — createReconRun', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a recon run with closeSessionId and type', async () => {
    jest.spyOn(repo, 'insertReconRun').mockResolvedValue({ ...sampleRun });
    const result = await createReconRun(mockPool, 'sess-1', 'bank');
    expect(result.closeSessionId).toBe('sess-1');
    expect(result.type).toBe('bank');
    expect(repo.insertReconRun).toHaveBeenCalledWith(mockPool, expect.any(String), 'sess-1', 'bank', 'draft');
  });
});

describe('Recon service — ingestReconItems', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('throws NOT_FOUND when run does not exist', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue(null);
    await expect(
      ingestReconItems(mockPool, 'run-missing', [{ source: 'bank', amount: 100 }])
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Recon run not found' });
  });

  it('ingests items and updates run status to in_progress', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue({ ...sampleRun });
    jest.spyOn(repo, 'insertReconItem').mockResolvedValue({ ...sampleItem });
    jest.spyOn(repo, 'updateReconRunStatus').mockResolvedValue(true);
    const result = await ingestReconItems(mockPool, 'run-1', [
      { source: 'bank', amount: 100, itemDate: '2025-01-15', description: 'Deposit', ref: { bankTxId: 'tx-1' } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(100);
    expect(repo.updateReconRunStatus).toHaveBeenCalledWith(mockPool, 'run-1', 'in_progress');
  });
});

describe('Recon service — proposeMatches', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('throws NOT_FOUND when run does not exist', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue(null);
    await expect(
      proposeMatches(mockPool, 'run-missing', { reconItemIds: ['item-1'] })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws VALIDATION when reconItemIds is empty', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue({ ...sampleRun });
    await expect(
      proposeMatches(mockPool, 'run-1', { reconItemIds: [] })
    ).rejects.toMatchObject({ code: 'VALIDATION', message: 'At least one recon item required' });
  });

  it('creates match group and links items', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue({ ...sampleRun });
    jest.spyOn(repo, 'insertReconMatchGroup').mockResolvedValue({ ...sampleGroup });
    jest.spyOn(repo, 'insertReconMatchGroupItem').mockResolvedValue();
    jest.spyOn(repo, 'getReconMatchGroupById').mockResolvedValue({ ...sampleGroup });
    const result = await proposeMatches(mockPool, 'run-1', {
      reconItemIds: ['item-1', 'item-2'],
      matchConfidence: 0.9,
      decisionRecordId: 'dr-1',
    });
    expect(result.status).toBe('proposed');
    expect(repo.insertReconMatchGroupItem).toHaveBeenCalledTimes(2);
  });
});

describe('Recon service — confirmMatchGroup', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('throws NOT_FOUND when group does not exist', async () => {
    jest.spyOn(repo, 'getReconMatchGroupById').mockResolvedValue(null);
    await expect(confirmMatchGroup(mockPool, 'mg-missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws VALIDATION when group is not proposed', async () => {
    jest.spyOn(repo, 'getReconMatchGroupById').mockResolvedValue({ ...sampleGroup, status: 'confirmed' });
    await expect(confirmMatchGroup(mockPool, 'mg-1')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Only proposed groups can be confirmed',
    });
  });

  it('updates group status to confirmed', async () => {
    jest.spyOn(repo, 'getReconMatchGroupById')
      .mockResolvedValueOnce({ ...sampleGroup })
      .mockResolvedValueOnce({ ...sampleGroup, status: 'confirmed' });
    jest.spyOn(repo, 'updateReconMatchGroupStatus').mockResolvedValue(true);
    const result = await confirmMatchGroup(mockPool, 'mg-1');
    expect(result.status).toBe('confirmed');
    expect(repo.updateReconMatchGroupStatus).toHaveBeenCalledWith(mockPool, 'mg-1', 'confirmed');
  });
});

describe('Recon service — rejectMatchGroup', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('updates group status to rejected', async () => {
    jest.spyOn(repo, 'getReconMatchGroupById')
      .mockResolvedValueOnce({ ...sampleGroup })
      .mockResolvedValueOnce({ ...sampleGroup, status: 'rejected' });
    jest.spyOn(repo, 'updateReconMatchGroupStatus').mockResolvedValue(true);
    const result = await rejectMatchGroup(mockPool, 'mg-1');
    expect(result.status).toBe('rejected');
  });
});

describe('Recon service — markTimingDifference', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('throws NOT_FOUND when run does not exist', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue(null);
    await expect(
      markTimingDifference(mockPool, 'run-missing', 'Deposit in transit')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('creates recon exception with reason and optional linkedIssueId', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue({ ...sampleRun });
    jest.spyOn(repo, 'insertReconException').mockResolvedValue({
      id: 'ex-1',
      reconRunId: 'run-1',
      reason: 'Deposit in transit',
      status: 'open',
      linkedIssueId: undefined,
      createdAt: '2025-01-01T00:00:00Z',
    });
    const result = await markTimingDifference(mockPool, 'run-1', 'Deposit in transit', 'issue-1');
    expect(result.reason).toBe('Deposit in transit');
    expect(repo.insertReconException).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      'run-1',
      expect.objectContaining({ reason: 'Deposit in transit', linkedIssueId: 'issue-1' })
    );
  });
});

describe('Recon service — signOffReconRun', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('throws NOT_FOUND when run does not exist', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue(null);
    await expect(signOffReconRun(mockPool, 'run-missing', 'user-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('upserts signoff and updates run status to signed_off', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue({ ...sampleRun });
    jest.spyOn(repo, 'upsertReconSignoff').mockResolvedValue({
      reconRunId: 'run-1',
      signedBy: 'user-1',
      signedAt: '2025-01-01T00:00:00Z',
      notes: 'All clear',
    });
    jest.spyOn(repo, 'updateReconRunStatus').mockResolvedValue(true);
    const result = await signOffReconRun(mockPool, 'run-1', 'user-1', 'All clear');
    expect(result.signedBy).toBe('user-1');
    expect(repo.updateReconRunStatus).toHaveBeenCalledWith(mockPool, 'run-1', 'signed_off');
  });
});

describe('Recon service — getUnmatchedReconItems', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns items not in any proposed or confirmed match group', async () => {
    const item1 = { ...sampleItem, id: 'item-1' };
    const item2 = { ...sampleItem, id: 'item-2', amount: 200 };
    jest.spyOn(repo, 'listReconItemsByRunId').mockResolvedValue([item1, item2]);
    jest.spyOn(repo, 'listReconMatchGroupsByRunId').mockResolvedValue([
      { ...sampleGroup, id: 'mg-1', status: 'proposed' },
    ]);
    jest.spyOn(repo, 'listReconMatchGroupItemIds').mockResolvedValue(['item-1']);
    const result = await getUnmatchedReconItems(mockPool, 'run-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('item-2');
  });
});

describe('Recon service — emitIssuesForUnmatchedAboveMateriality', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('throws NOT_FOUND when run does not exist', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue(null);
    await expect(
      emitIssuesForUnmatchedAboveMateriality(mockPool, {
        reconRunId: 'run-missing',
        closeSessionId: 'sess-1',
        tenantId: 't1',
        materialityThreshold: 50,
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('emits issues only for unmatched items above materiality threshold', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue({ ...sampleRun });
    jest.spyOn(repo, 'listReconItemsByRunId').mockResolvedValue([
      { ...sampleItem, id: 'item-1', amount: 100 },
      { ...sampleItem, id: 'item-2', amount: 30 },
    ]);
    jest.spyOn(repo, 'listReconMatchGroupsByRunId').mockResolvedValue([]);
    jest.spyOn(repo, 'listReconMatchGroupItemIds').mockResolvedValue([]);
    jest.spyOn(triageService, 'getLatestTriage').mockResolvedValue(null);
    const createdIssue = {
      id: 'issue-1',
      closeSessionId: 'sess-1',
      tenantId: 't1',
      category: 'reconciliation',
      severity: 'critical',
      status: 'open',
      title: 'Unmatched reconciliation item above materiality',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    jest.spyOn(issueService, 'createIssue').mockResolvedValue(createdIssue as any);
    const result = await emitIssuesForUnmatchedAboveMateriality(mockPool, {
      reconRunId: 'run-1',
      closeSessionId: 'sess-1',
      tenantId: 't1',
      materialityThreshold: 50,
    });
    expect(result).toHaveLength(1);
    expect(result[0].reconItemId).toBe('item-1');
    expect(result[0].amount).toBe(100);
    expect(issueService.createIssue).toHaveBeenCalledTimes(1);
    expect(issueService.createIssue).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        category: 'reconciliation',
        severity: 'critical',
        impactCash: 100,
        materialityThresholdUsed: 50,
      })
    );
  });
});

describe('Recon service — getReconRun / listReconRunsByCloseSession', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('getReconRun returns null when not found', async () => {
    jest.spyOn(repo, 'getReconRunById').mockResolvedValue(null);
    const result = await getReconRun(mockPool, 'run-missing');
    expect(result).toBeNull();
  });

  it('listReconRunsByCloseSession returns runs', async () => {
    jest.spyOn(repo, 'listReconRunsByCloseSession').mockResolvedValue([{ ...sampleRun }]);
    const result = await listReconRunsByCloseSession(mockPool, 'sess-1', 'bank');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('bank');
  });
});

describe('Recon service — listReconItemsByRunId / listReconMatchGroupsByRunId', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('listReconItemsByRunId returns items', async () => {
    jest.spyOn(repo, 'listReconItemsByRunId').mockResolvedValue([{ ...sampleItem }]);
    const result = await listReconItemsByRunId(mockPool, 'run-1');
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(100);
  });

  it('listReconMatchGroupsByRunId returns match groups', async () => {
    jest.spyOn(repo, 'listReconMatchGroupsByRunId').mockResolvedValue([{ ...sampleGroup }]);
    const result = await listReconMatchGroupsByRunId(mockPool, 'run-1');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('proposed');
  });
});
