/**
 * Job handlers: ingestion_pipeline, agentic_cleanup, statement_generation.
 * Used by the worker to execute claimed jobs.
 */

import type { JobHandlerContext } from '../types/job.js';
import { getTenantPool } from '../db/index.js';
import { runAllFetchersAndIngest } from './ingestion_fetchers.js';
import { generateStatements as generateStatementPackage } from './statement_package_service.js';

/** Run ingestion pipeline for a tenant (fetch email/drive, run ingestion agent, dedup). */
export async function handleIngestionPipeline(ctx: JobHandlerContext): Promise<void> {
  const tenantId = typeof ctx.job.payload?.tenantId === 'string' ? ctx.job.payload.tenantId : undefined;
  await runAllFetchersAndIngest(tenantId);
}

/**
 * Agentic cleanup/classification for a context (tenant/session/document).
 * Placeholder: wire to agenticLedgerToTrialBalance or classifyIngestionAgentic when needed.
 */
export async function handleAgenticCleanup(_ctx: JobHandlerContext): Promise<void> {
  const tenantId = _ctx.job.payload?.tenantId as string | undefined;
  const sessionId = _ctx.job.payload?.sessionId as string | undefined;
  if (!tenantId) return;
  // TODO: load session/document and run agentic cleanup (e.g. agenticLedgerToTrialBalance, classifyIngestionAgentic)
  if (sessionId) {
    // Placeholder: no-op until we have runAgenticCleanupForSession(tenantId, sessionId)
  }
}

/** Generate statement package for a close session (adjusted TB → BS/P&L). */
export async function handleStatementGeneration(ctx: JobHandlerContext): Promise<void> {
  const tenantId = ctx.job.payload?.tenantId as string | undefined;
  const closeSessionId = ctx.job.payload?.closeSessionId as string | undefined;
  if (!tenantId || !closeSessionId) {
    throw new Error('statement_generation job requires payload.tenantId and payload.closeSessionId');
  }
  const pool = await getTenantPool(tenantId);
  await generateStatementPackage(pool, tenantId, closeSessionId);
}

export const JOB_HANDLERS: Record<
  string,
  (ctx: JobHandlerContext) => Promise<void>
> = {
  ingestion_pipeline: handleIngestionPipeline,
  agentic_cleanup: handleAgenticCleanup,
  statement_generation: handleStatementGeneration,
};
