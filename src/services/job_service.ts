/**
 * STATUS: UNWIRED — This service compiles but is not imported by any active route.
 * It exists as potential future functionality.
 * Last verified: 2026-02-25
 * To activate: Create a route file that imports this service and register it in server.ts
 */

/**
 * Job queue service: enqueue with id generation and idempotency.
 * Uses control DB jobs table; workers poll via job_repository.
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
