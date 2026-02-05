/**
 * Background ingestion scheduler: enqueues ingestion_pipeline jobs per tenant on an interval.
 * Uses a control-DB distributed lock so only one instance enqueues per interval.
 * Workers run the actual pipeline (see job_worker + job_handlers).
 */

import { hostname } from 'os';
import { getControlPool, isDbConfigured } from '../db/index.js';
import { listTenantIds } from './integration_store.js';
import { enqueueJob } from './job_service.js';
import { log } from '../lib/logger.js';

const LOCK_JOB_ID = 'ingestion_scheduler';

let timer: NodeJS.Timeout | null = null;

/** Try to acquire the scheduler lock. Returns true if we acquired it. */
async function tryAcquireLock(intervalMs: number): Promise<boolean> {
  if (!isDbConfigured()) return true;
  const pool = getControlPool();
  const instanceId = `${hostname()}-${process.pid}`;
  const r = await pool.query(
    `UPDATE scheduler_locks
     SET instance_id = $1, acquired_at = NOW(), interval_ms = $2
     WHERE id = $3
       AND (acquired_at IS NULL OR acquired_at < NOW() - (interval_ms::text || ' milliseconds')::interval)
     RETURNING id`,
    [instanceId, intervalMs, LOCK_JOB_ID]
  );
  return r.rowCount !== null && r.rowCount > 0;
}

export function startIngestionScheduler(): void {
  const enabled = (process.env.INGESTION_SCHEDULER_ENABLED ?? 'false') === 'true';
  if (!enabled) return;
  const intervalMs = Number(process.env.INGESTION_SCHEDULER_INTERVAL_MS ?? 300000);
  if (timer) return;
  timer = setInterval(async () => {
    const acquired = await tryAcquireLock(intervalMs);
    if (!acquired) return;
    const tenants = listTenantIds();
    const slot = Math.floor(Date.now() / intervalMs);
    for (const tenantId of tenants) {
      try {
        await enqueueJob({
          type: 'ingestion_pipeline',
          payload: { tenantId },
          idempotencyKey: `ingestion:${tenantId}:${slot}`,
        });
      } catch (e) {
        log('error', 'Ingestion scheduler: failed to enqueue job for tenant', { tenantId, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }, intervalMs);
}

export function stopIngestionScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
