/**
 * Durable job worker: polls jobs, locks, executes handlers, retries with backoff, dead-letters after max_attempts.
 */

import { hostname } from 'os';
import { getControlPool, isDbConfigured } from '../db/index.js';
import * as repo from '../db/repositories/job_repository.js';
import { JOB_HANDLERS } from './job_handlers.js';
import type { Job } from '../types/job.js';
import { log } from '../lib/logger.js';

const DEFAULT_POLL_MS = 2000;
const DEFAULT_BACKOFF_BASE_MS = 60_000;

function workerId(): string {
  return `${hostname()}-${process.pid}`;
}

/** Exponential backoff: next run at now + baseMs * 2^attempts (capped). */
function nextRunAt(attempts: number, baseMs: number = DEFAULT_BACKOFF_BASE_MS): string {
  const delayMs = Math.min(baseMs * Math.pow(2, attempts), 24 * 60 * 60 * 1000);
  return new Date(Date.now() + delayMs).toISOString();
}

export interface WorkerOptions {
  pollIntervalMs?: number;
  backoffBaseMs?: number;
}

let stopRequested = false;

export function requestStop(): void {
  stopRequested = true;
}

/**
 * Run the worker loop: claim next job, execute handler, complete/fail/dead-letter.
 * Call from a long-running process (e.g. same process as API or a dedicated worker).
 */
export async function runWorkerLoop(options: WorkerOptions = {}): Promise<void> {
  const pollMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  const backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const wid = workerId();
  stopRequested = false;

  if (!isDbConfigured()) {
    log('warn', 'Job worker: DATABASE_URL not set; worker not starting.');
    return;
  }

  const pool = getControlPool();
  log('info', 'Job worker started', { worker_id: wid, poll_ms: pollMs });

  while (!stopRequested) {
    try {
      const job = await repo.claimNext(pool, wid);
      if (job) {
        await runOne(job, pool, wid, backoffBaseMs);
      }
    } catch (err) {
      log('error', 'Job worker poll/run error', { error: err instanceof Error ? err.message : String(err) });
    }
    await sleep(pollMs);
  }
  log('info', 'Job worker stopped', { worker_id: wid });
}

async function runOne(
  job: Job,
  pool: ReturnType<typeof getControlPool>,
  wid: string,
  backoffBaseMs: number
): Promise<void> {
  const handler = JOB_HANDLERS[job.type];
  if (!handler) {
    await repo.deadLetter(pool, job.id, `Unknown job type: ${job.type}`);
    return;
  }

  try {
    await handler({ job, workerId: wid });
    await repo.complete(pool, job.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const nextAttempts = job.attempts + 1;
    if (nextAttempts >= job.maxAttempts) {
      await repo.deadLetter(pool, job.id, message);
    } else {
      const runAt = nextRunAt(nextAttempts, backoffBaseMs);
      await repo.fail(pool, job.id, message, { retry: true, nextRunAt: runAt });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
