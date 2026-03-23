/**
 * Standalone job worker process.
 *
 * Runs the durable job worker loop WITHOUT starting the Express API server.
 * Use this when deploying in split-process mode:
 *   - API process:    JOB_WORKER_ENABLED=false npm start
 *   - Worker process: npm run worker
 *
 * Requires DATABASE_URL to be set.
 */

import 'dotenv/config';
import { isDbConfigured } from './db/index.js';
import { runWorkerLoop, requestStop } from './services/job_worker.js';

async function main(): Promise<void> {
  if (!isDbConfigured()) {
    console.error('[worker] FATAL: DATABASE_URL is not set. Cannot start job worker.');
    process.exit(1);
  }

  const pollIntervalMs = Number(process.env.JOB_WORKER_POLL_MS ?? 2000);
  const backoffBaseMs = Number(process.env.JOB_WORKER_BACKOFF_BASE_MS ?? 60_000);

  console.log(`[worker] Starting standalone job worker (poll=${pollIntervalMs}ms, backoff_base=${backoffBaseMs}ms)`);

  // Graceful shutdown on SIGTERM / SIGINT
  const shutdown = (signal: string) => {
    console.log(`[worker] Received ${signal}, shutting down gracefully...`);
    requestStop();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await runWorkerLoop({ pollIntervalMs, backoffBaseMs });

  console.log('[worker] Worker loop exited. Process will terminate.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
