/**
 * Durable job queue service used by close scheduling, runbook task execution,
 * statement generation, ERP writeback, and other background workflows.
 * Jobs live in the control database and are claimed by job_worker.
 */

import { randomUUID } from 'crypto';
import { getControlPool, isDbConfigured } from '../db/index.js';
import * as repo from '../db/repositories/job_repository.js';
import type { JobType } from '../types/job.js';

export interface EnqueueJobInput {
  type: JobType;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  runAt?: string;
  maxAttempts?: number;
}

/**
 * Enqueue a job. Generates id if not provided. If idempotencyKey is set and
 * a completed job already exists with that key, returns that job id (no insert).
 */
export async function enqueueJob(input: EnqueueJobInput): Promise<{ id: string; inserted: boolean }> {
  if (!isDbConfigured()) {
    throw new Error('DATABASE_URL is not set; cannot enqueue job');
  }
  const pool = getControlPool();
  const id = randomUUID();
  return repo.enqueue(pool, {
    id,
    type: input.type,
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey,
    runAt: input.runAt,
    maxAttempts: input.maxAttempts,
  });
}

/**
 * Enqueue with a custom id (e.g. for idempotent scheduling). Still respects idempotencyKey
 * for duplicate detection against completed jobs.
 */
export async function enqueueJobWithId(
  id: string,
  input: EnqueueJobInput
): Promise<{ id: string; inserted: boolean }> {
  if (!isDbConfigured()) {
    throw new Error('DATABASE_URL is not set; cannot enqueue job');
  }
  const pool = getControlPool();
  return repo.enqueue(pool, {
    id,
    type: input.type,
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey,
    runAt: input.runAt,
    maxAttempts: input.maxAttempts,
  });
}
