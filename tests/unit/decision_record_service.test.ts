/**
 * Decision record service unit tests: record creation, append-only (immutability).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import {
  createDecisionRecord,
  getDecisionRecord,
  listDecisionRecords,
  hashInputSnapshot,
} from '../../src/services/decision_record_service.js';
import * as repo from '../../src/db/repositories/decision_record_repository.js';

const mockPool = {} as Pool;

describe('Decision record — createDecisionRecord', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a record with required fields', async () => {
    const inserted = {
      id: 'dr-1',
      closeSessionId: null,
      tenantId: 't1',
      decisionType: 'classification' as const,
      subjectRef: { entryCount: 5 },
      inputHash: null,
      inputSnapshot: null,
      outputSnapshot: null,
      confidenceScore: null,
      rationaleText: null,
      engineVersion: null,
      promptSnapshot: null,
      createdAt: '2025-01-01T00:00:00Z',
    };
    jest.spyOn(repo, 'insertDecisionRecord').mockResolvedValue(inserted as any);
    const result = await createDecisionRecord(mockPool, {
      tenantId: 't1',
      decisionType: 'classification',
      subjectRef: { entryCount: 5 },
      rationaleText: 'Deterministic classification',
      engineVersion: 'deterministic',
    });
    expect(result.tenantId).toBe('t1');
    expect(result.decisionType).toBe('classification');
    expect(result.subjectRef).toEqual({ entryCount: 5 });
    expect(repo.insertDecisionRecord).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      expect.objectContaining({
        tenantId: 't1',
        decisionType: 'classification',
        subjectRef: { entryCount: 5 },
        rationaleText: 'Deterministic classification',
        engineVersion: 'deterministic',
      })
    );
  });

  it('computes input_hash when inputSnapshot provided', async () => {
    jest.spyOn(repo, 'insertDecisionRecord').mockResolvedValue({} as any);
    await createDecisionRecord(mockPool, {
      tenantId: 't1',
      decisionType: 'coa_mapping',
      subjectRef: {},
      inputSnapshot: { accounts: [{ accountName: 'Cash' }] },
      outputSnapshot: { results: [] },
    });
    expect(repo.insertDecisionRecord).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      expect.objectContaining({
        inputHash: expect.any(String),
        inputSnapshot: { accounts: [{ accountName: 'Cash' }] },
      })
    );
  });
});

describe('Decision record — hashInputSnapshot', () => {
  it('is deterministic: same input => same hash', () => {
    const input = { a: 1, b: 2 };
    expect(hashInputSnapshot(input)).toBe(hashInputSnapshot(input));
  });

  it('produces different hashes for different input', () => {
    const h1 = hashInputSnapshot({ a: 1 });
    const h2 = hashInputSnapshot({ a: 2 });
    expect(h1).not.toBe(h2);
  });
});

describe('Decision record — append-only (immutability)', () => {
  it('repository has no update or delete — insert and list only', () => {
    const repoExports = Object.keys(repo);
    expect(repoExports).toContain('insertDecisionRecord');
    expect(repoExports).toContain('getDecisionRecordById');
    expect(repoExports).toContain('listDecisionRecords');
    expect(repoExports).not.toContain('updateDecisionRecord');
    expect(repoExports).not.toContain('deleteDecisionRecord');
  });

  it('listDecisionRecords returns records from repo', async () => {
    const records = [
      {
        id: 'dr-1',
        closeSessionId: null,
        tenantId: 't1',
        decisionType: 'classification' as const,
        subjectRef: {},
        inputHash: null,
        inputSnapshot: null,
        outputSnapshot: null,
        confidenceScore: null,
        rationaleText: null,
        engineVersion: null,
        promptSnapshot: null,
        createdAt: '',
      },
    ];
    jest.spyOn(repo, 'listDecisionRecords').mockResolvedValue(records as any);
    const result = await listDecisionRecords(mockPool, { tenantId: 't1', limit: 10 });
    expect(result).toHaveLength(1);
    expect(result[0].decisionType).toBe('classification');
  });
});
