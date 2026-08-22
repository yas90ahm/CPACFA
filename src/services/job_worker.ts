/**
 * Durable job worker: polls jobs, locks, executes handlers, retries with backoff, dead-letters after max_attempts.
 */

import { hostname } from 'os';
import { getControlPool, isDbConfigured } from '../db/index.js';
import * as repo from '../db/repositories/job_repository.js';
import { JOB_HANDLERS } from './job_handlers.js';
import type { Job } from '../types/job.js';
import { log } from '../lib/logger.js';
import { scanConfiguredCloseCycles } from './close_cycle_scheduler.js';
import { scanPendingErpWritebacks } from './erp_writeback_scheduler.js';
import { enqueueCloseOrchestratorReconcile } from './close_orchestrator_service.js';

const DEFAULT_POLL_MS = 2000;
const DEFAULT_BACKOFF_BASE_MS = 60_000;
const DEFAULT_CLOSE_CYCLE_SCAN_MS = 60_000;

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
  closeCycleSchedulerEnabled?: boolean;
  closeCycleScanIntervalMs?: number;
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
  const closeCycleSchedulerEnabled = options.closeCycleSchedulerEnabled ?? true;
  const closeCycleScanMs = Math.max(
    pollMs,
    options.closeCycleScanIntervalMs ?? DEFAULT_CLOSE_CYCLE_SCAN_MS
  );
  const wid = workerId();
  stopRequested = false;
  let nextCloseCycleScanAt = 0;

  if (!isDbConfigured()) {
    log('warn', 'Job worker: DATABASE_URL not set; worker not starting.');
    return;
  }

  const pool = getControlPool();
  log('info', 'Job worker started', { worker_id: wid, poll_ms: pollMs });

  while (!stopRequested) {
    try {
      if (closeCycleSchedulerEnabled && Date.now() >= nextCloseCycleScanAt) {
        // Move the cursor before scanning so a failed scan cannot hot-loop.
        nextCloseCycleScanAt = Date.now() + closeCycleScanMs;
        const scan = await scanConfiguredCloseCycles();
        const writebackScan = await scanPendingErpWritebacks();
        if (scan.jobsInserted > 0 || scan.errors.length > 0) {
          log('info', 'Close-cycle scheduler scan completed', {
            tenants_scanned: scan.tenantsScanned,
            jobs_inserted: scan.jobsInserted,
            jobs_already_queued: scan.jobsAlreadyQueued,
            cursors_advanced: scan.cursorsAdvanced,
            errors: scan.errors.length,
          });
        }
        if (writebackScan.jobsInserted > 0 || writebackScan.errors.length > 0) {
          log('info', 'ERP writeback dispatcher scan completed', {
            tenants_scanned: writebackScan.tenantsScanned,
            pending_found: writebackScan.pendingFound,
            jobs_inserted: writebackScan.jobsInserted,
            jobs_already_queued: writebackScan.jobsAlreadyQueued,
            errors: writebackScan.errors.length,
          });
        }
      }
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
      if (job.type === 'runbook_task_execute') {
        const tenantId = typeof job.payload?.tenantId === 'string' ? job.payload.tenantId : '';
        const closeSessionId = typeof job.payload?.closeSessionId === 'string'
          ? job.payload.closeSessionId
          : '';
        const taskExecutionId = typeof job.payload?.taskExecutionId === 'string'
          ? job.payload.taskExecutionId
          : '';
        const orchestratorDepth = typeof job.payload?.orchestratorDepth === 'number'
          && Number.isInteger(job.payload.orchestratorDepth)
          && job.payload.orchestratorDepth >= 0
          ? job.payload.orchestratorDepth
          : 0;
        if (tenantId && closeSessionId && taskExecutionId) {
          try {
            await enqueueCloseOrchestratorReconcile({
              tenantId,
              closeSessionId,
              trigger: 'task_failed',
              sourceType: 'job',
              sourceId: job.id,
              occurrenceToken: job.id,
              taskExecutionId,
              depth: orchestratorDepth,
              error: message,
            });
          } catch (orchestratorError) {
            log('error', 'Failed to notify Close Orchestrator about a dead-lettered task', {
              tenantId,
              closeSessionId,
              taskExecutionId,
              error: orchestratorError instanceof Error
                ? orchestratorError.message
                : String(orchestratorError),
            });
          }
        }
      }
    } else {
      const runAt = nextRunAt(nextAttempts, backoffBaseMs);
      await repo.fail(pool, job.id, message, { retry: true, nextRunAt: runAt });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
