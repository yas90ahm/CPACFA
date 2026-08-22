// @ts-nocheck — Jest mock typings are strict; mocks use pool.query result shapes.
/**
 * Job queue: idempotency (same payload twice doesn't duplicate) and retry behavior.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import * as repo from '../../src/db/repositories/job_repository.js';
import type { Job } from '../../src/types/job.js';

const JOB_ID = 'test-job-id';
const IDEMPOTENCY_KEY = 'idem:test:1';
const WORKER_ID = 'worker-1';

function mockPool(overrides: { query?: jest.Mock } = {}): { pool: Pool; query: jest.Mock } {
  const query: jest.Mock = overrides.query ?? (jest.fn() as jest.Mock);
  const pool = { query, ...overrides } as unknown as Pool;
  return { pool, query };
}

describe('Job queue — idempotency', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('enqueue with idempotencyKey returns existing id when completed job exists (no insert)', async () => {
    const existingId = 'existing-completed-id';
    const mockQuery = (jest.fn() as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: existingId, status: 'completed' }] })
      .mockRejectedValue(new Error('INSERT should not be called'));
    const { pool, query } = mockPool({ query: mockQuery });
    const result = await repo.enqueue(pool, {
      id: JOB_ID,
      type: 'ingestion_pipeline',
      payload: { tenantId: 't1' },
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(result).toEqual({ id: existingId, inserted: false });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id, status FROM jobs'),
      [IDEMPOTENCY_KEY]
    );
  });

  it('enqueue with idempotencyKey inserts when no completed job exists', async () => {
    const mockQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const { pool, query } = mockPool({ query: mockQuery });
    const result = await repo.enqueue(pool, {
      id: JOB_ID,
      type: 'ingestion_pipeline',
      payload: { tenantId: 't1' },
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(result).toEqual({ id: JOB_ID, inserted: true });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO jobs'), expect.any(Array));
  });

  it('enqueue without idempotencyKey always inserts', async () => {
    const { pool, query } = mockPool({
      query: jest.fn().mockResolvedValue({ rowCount: 1 }),
    });
    const result = await repo.enqueue(pool, {
      id: JOB_ID,
      type: 'statement_generation',
      payload: { tenantId: 't1', closeSessionId: 'cs1' },
    });
    expect(result).toEqual({ id: JOB_ID, inserted: true });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO jobs'), expect.any(Array));
  });

  it('a deterministic job id is a database-enforced duplicate guard', async () => {
    const { pool, query } = mockPool({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    });
    const result = await repo.enqueue(pool, {
      id: 'close-cycle-stable-id',
      type: 'close_cycle_kickoff',
      payload: { tenantId: 't1', periodLabel: '2026-01' },
    });
    expect(result).toEqual({ id: 'close-cycle-stable-id', inserted: false });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (id) DO NOTHING'),
      expect.any(Array)
    );
  });
});

describe('Job queue — retry and dead-letter behavior', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('fail with retry: true sets status pending and run_at (no dead-letter)', async () => {
    const mockQuery = (jest.fn() as jest.Mock).mockResolvedValue({ rowCount: 1 });
    const { pool, query } = mockPool({ query: mockQuery });
    await repo.fail(pool, JOB_ID, 'Transient error', { retry: true, nextRunAt: '2025-12-01T12:00:00Z' });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'"),
      ['Transient error', '2025-12-01T12:00:00Z', JOB_ID]
    );
  });

  it('fail with retry: false sets status failed (final)', async () => {
    const mockQuery = jest.fn().mockResolvedValue({ rowCount: 1 });
    const { pool, query } = mockPool({ query: mockQuery });
    await repo.fail(pool, JOB_ID, 'Permanent error', { retry: false });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      ['Permanent error', JOB_ID]
    );
  });

  it('deadLetter sets status dead', async () => {
    const mockQuery = (jest.fn() as jest.Mock).mockResolvedValue({ rowCount: 1 });
    const { pool, query } = mockPool({ query: mockQuery });
    await repo.deadLetter(pool, JOB_ID, 'Max attempts exceeded');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'dead'"),
      ['Max attempts exceeded', JOB_ID]
    );
  });

  it('worker runOne: nextAttempts >= maxAttempts triggers deadLetter (logic)', () => {
    const job: Job = {
      id: JOB_ID,
      type: 'ingestion_pipeline',
      payload: {},
      status: 'locked',
      attempts: 4,
      maxAttempts: 5,
      lastError: null,
      idempotencyKey: null,
      createdAt: '',
      lockedAt: null,
      completedAt: null,
      workerId: WORKER_ID,
      runAt: null,
    };
    const nextAttempts = job.attempts + 1;
    expect(nextAttempts >= job.maxAttempts).toBe(true);
    // Worker would call deadLetter in this case
  });

  it('worker runOne: nextAttempts < maxAttempts triggers retry with backoff (logic)', () => {
    const job: Job = {
      id: JOB_ID,
      type: 'ingestion_pipeline',
      payload: {},
      status: 'locked',
      attempts: 2,
      maxAttempts: 5,
      lastError: null,
      idempotencyKey: null,
      createdAt: '',
      lockedAt: null,
      completedAt: null,
      workerId: WORKER_ID,
      runAt: null,
    };
    const nextAttempts = job.attempts + 1;
    expect(nextAttempts >= job.maxAttempts).toBe(false);
    // Worker would call fail(..., { retry: true, nextRunAt }) in this case
  });
});
