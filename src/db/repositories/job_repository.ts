/**
 * Jobs table (control DB): enqueue, claim, complete, fail, dead-letter.
 */

import type { Pool } from 'pg';
import type { Job, JobStatus, JobType } from '../../types/job.js';

const COLUMNS =
  'id, type, payload, status, attempts, max_attempts, last_error, idempotency_key, created_at, locked_at, completed_at, worker_id, run_at';

function rowToJob(row: {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  attempts: string;
  max_attempts: string;
  last_error: string | null;
  idempotency_key: string | null;
  created_at: string;
  locked_at: string | null;
  completed_at: string | null;
  worker_id: string | null;
  run_at: string | null;
}): Job {
  return {
    id: row.id,
    type: row.type as JobType,
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: row.status as JobStatus,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    lastError: row.last_error,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    lockedAt: row.locked_at,
    completedAt: row.completed_at,
    workerId: row.worker_id,
    runAt: row.run_at,
  };
}

/** Enqueue a job. If idempotencyKey provided and a completed job exists with that key, returns that job id (no insert). */
export async function enqueue(
  pool: Pool,
  input: {
    id: string;
    type: JobType;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
    runAt?: string;
    maxAttempts?: number;
  }
): Promise<{ id: string; inserted: boolean }> {
  if (input.idempotencyKey) {
    const existing = await pool.query<{
      id: string;
      status: string;
    }>(
      `SELECT id, status FROM jobs WHERE idempotency_key = $1 AND status = 'completed' LIMIT 1`,
      [input.idempotencyKey]
    );
    if (existing.rows[0]) {
      return { id: existing.rows[0].id, inserted: false };
    }
  }
  await pool.query(
    `INSERT INTO jobs (id, type, payload, status, attempts, max_attempts, idempotency_key, run_at)
     VALUES ($1, $2, $3, 'pending', 0, $4, $5, $6)`,
    [
      input.id,
      input.type,
      JSON.stringify(input.payload ?? {}),
      input.maxAttempts ?? 5,
      input.idempotencyKey ?? null,
      input.runAt ?? null,
    ]
  );
  return { id: input.id, inserted: true };
}

/** Stale lock threshold: jobs locked longer than this are reclaimable (worker crash recovery). */
const LOCK_TIMEOUT_MINUTES = 5;

/** Claim next pending job, or reclaim a job locked longer than LOCK_TIMEOUT_MINUTES (stale lock recovery). Returns null if none. */
export async function claimNext(
  pool: Pool,
  workerId: string,
  options?: { pollLimit?: number; lockTimeoutMinutes?: number }
): Promise<Job | null> {
  const timeoutMinutes = options?.lockTimeoutMinutes ?? LOCK_TIMEOUT_MINUTES;
  const r = await pool.query<{
    id: string;
    type: string;
    payload: unknown;
    status: string;
    attempts: string;
    max_attempts: string;
    last_error: string | null;
    idempotency_key: string | null;
    created_at: string;
    locked_at: string | null;
    completed_at: string | null;
    worker_id: string | null;
    run_at: string | null;
  }>(
    `UPDATE jobs SET status = 'locked', locked_at = NOW(), worker_id = $1
     WHERE id = (
       SELECT id FROM jobs
       WHERE (status = 'pending' OR (status = 'locked' AND locked_at < NOW() - ($2::integer * interval '1 minute')))
         AND (run_at IS NULL OR run_at <= NOW())
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING ${COLUMNS}`,
    [workerId, timeoutMinutes]
  );
  const row = r.rows[0];
  return row ? rowToJob(row) : null;
}

export async function complete(pool: Pool, jobId: string): Promise<void> {
  await pool.query(
    `UPDATE jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [jobId]
  );
}

export async function fail(
  pool: Pool,
  jobId: string,
  error: string,
  options: { retry: boolean; nextRunAt?: string }
): Promise<void> {
  if (options.retry) {
    await pool.query(
      `UPDATE jobs SET status = 'pending', attempts = attempts + 1, last_error = $1, locked_at = NULL, worker_id = NULL, run_at = $2
       WHERE id = $3`,
      [error, options.nextRunAt ?? null, jobId]
    );
  } else {
    await pool.query(
      `UPDATE jobs SET status = 'failed', attempts = attempts + 1, last_error = $1, completed_at = NOW(), locked_at = NULL, worker_id = NULL
       WHERE id = $2`,
      [error, jobId]
    );
  }
}

export async function deadLetter(pool: Pool, jobId: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE jobs SET status = 'dead', attempts = attempts + 1, last_error = $1, completed_at = NOW(), locked_at = NULL, worker_id = NULL
     WHERE id = $2`,
    [error, jobId]
  );
}

export async function getById(pool: Pool, jobId: string): Promise<Job | null> {
  const r = await pool.query(
    `SELECT ${COLUMNS} FROM jobs WHERE id = $1`,
    [jobId]
  );
  const row = r.rows[0];
  return row ? rowToJob(row as Parameters<typeof rowToJob>[0]) : null;
}
