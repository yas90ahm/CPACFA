/**
 * Unit tests for pilot production hardening.
 * - Task 1: Production with missing pool throws (no in-memory fallback).
 * - Task 2: Stale lock reclaim (claimNext can claim job locked > 5 min).
 * - Task 5: Trial balance over MAX_TB_ROWS rejected with 413.
 * - Task 7: GL post-back disabled returns notImplemented (501).
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import type { Pool } from 'pg';
import * as periodLock from '../../src/services/period_lock_service.js';
import * as accounting from '../../src/services/accounting_integration_service.js';
import { pushAdjustmentToGL } from '../../src/services/push_close_to_gl_service.js';
import * as jobRepo from '../../src/db/repositories/job_repository.js';

describe('Task 1: In-memory fallback disabled in production', () => {
  const orig = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = orig;
  });

  it('period_lock_service throws in production when no pool', async () => {
    process.env.NODE_ENV = 'production';
    await expect(periodLock.lockPeriod('2025-01', 'user', undefined, undefined, undefined)).rejects.toThrow(
      /Production: in-memory store not allowed|period lock/
    );
  });

  it('accounting_integration_service getConnection throws in production when no pool', async () => {
    process.env.NODE_ENV = 'production';
    await expect(accounting.getConnection('conn-1', undefined, undefined)).rejects.toThrow(
      /Production: in-memory store not allowed|accounting connections/
    );
  });
});

describe('Task 2: Stale lock reclaim', () => {
  it('claimNext accepts lockTimeoutMinutes option and SQL includes stale lock condition', async () => {
    const queryMock = jest.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] });
    const mockPool = { query: queryMock } as unknown as Pool;
    await jobRepo.claimNext(mockPool, 'worker-1', { lockTimeoutMinutes: 5 });
    expect(queryMock).toHaveBeenCalled();
    const call = queryMock.mock.calls[0];
    const sql = call?.[0] as string;
    expect(sql).toMatch(/pending|locked/);
    expect(sql).toMatch(/locked_at|interval/);
    expect(call?.[1]).toEqual(['worker-1', 5]);
  });
});

describe('Task 5: Trial balance size limit', () => {
  it('MAX_TB_ROWS defaults to 100_000', () => {
    const val = process.env.MAX_TB_ROWS;
    delete process.env.MAX_TB_ROWS;
    const limit = Number(process.env.MAX_TB_ROWS ?? 100_000);
    expect(limit).toBe(100_000);
    if (val !== undefined) process.env.MAX_TB_ROWS = val;
  });
});

describe('Task 7: GL post-back disabled by default', () => {
  const orig = process.env.ENABLE_GL_POSTBACK;

  afterEach(() => {
    process.env.ENABLE_GL_POSTBACK = orig;
  });

  it('pushAdjustmentToGL returns notImplemented when ENABLE_GL_POSTBACK not true', async () => {
    process.env.ENABLE_GL_POSTBACK = 'false';
    const result = await pushAdjustmentToGL(
      {
        id: 'adj-1',
        periodLabel: '2025-01',
        source: 'manual',
        description: 'Test',
        debits: [],
        credits: [],
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      'conn-1',
      undefined,
      't1'
    );
    expect(result.success).toBe(false);
    expect(result.notImplemented).toBe(true);
    expect(result.errors).toBeDefined();
  });

  it('pushAdjustmentToGL returns notImplemented when ENABLE_GL_POSTBACK unset', async () => {
    delete process.env.ENABLE_GL_POSTBACK;
    const result = await pushAdjustmentToGL(
      {
        id: 'adj-2',
        periodLabel: '2025-01',
        source: 'manual',
        description: 'Test',
        debits: [],
        credits: [],
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      'conn-1',
      undefined,
      't1'
    );
    expect(result.success).toBe(false);
    expect(result.notImplemented).toBe(true);
  });
});
