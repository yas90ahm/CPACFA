/**
 * Background ingestion scheduler (poll fetchers on interval).
 * Uses a control-DB distributed lock so only one API instance runs the job per interval.
 */

import { hostname } from 'os';
import { getControlPool, isDbConfigured } from '../db/index.js';
import { runAllFetchersAndIngest } from './ingestion_fetchers.js';
import { listTenantIds } from './integration_store.js';

const LOCK_JOB_ID = 'ingestion_scheduler';

let timer: NodeJS.Timeout | null = null;

/** Try to acquire the scheduler lock. Returns true if we acquired it, false if another instance holds it or lock not expired. */
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
    for (const tenantId of tenants) {
      await runAllFetchersAndIngest(tenantId);
    }
  }, intervalMs);
}

export function stopIngestionScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
