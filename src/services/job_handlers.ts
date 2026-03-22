/**
 * Job handlers: ingestion_pipeline, agentic_cleanup, statement_generation.
 * Used by the worker to execute claimed jobs.
 */

import type { JobHandlerContext } from '../types/job.js';
import { getTenantPool } from '../db/index.js';
// QUARANTINED — Automated ingestion infrastructure not in MVP architecture
// import { runAllFetchersAndIngest } from './ingestion_fetchers.js';
import { generateStatements as generateStatementPackage } from './statement_package_service.js';
import { runResolutionAgent } from '../ai/resolution_agent.js';
import type { FinancialEventPacket } from '../events/financial_event_emitter.js';
import { log } from '../lib/logger.js';
import { runInBoundaryScope } from '../lib/ai_boundary.js';
import { handleGateCheckJob } from './gate_event_service.js';

// QUARANTINED — Automated ingestion pipeline not in MVP architecture
// /** Run ingestion pipeline for a tenant (fetch email/drive, run ingestion agent, dedup). */
// export async function handleIngestionPipeline(ctx: JobHandlerContext): Promise<void> {
//   const tenantId = typeof ctx.job.payload?.tenantId === 'string' ? ctx.job.payload.tenantId : undefined;
//   await runAllFetchersAndIngest(tenantId);
// }

/**
 * Agentic cleanup/classification for a context (tenant/session/document).
 * FUTURE: agenticLedgerToTrialBalance, classifyIngestionAgentic not implemented.
 * Currently a no-op; jobs complete without error.
 */
export async function handleAgenticCleanup(_ctx: JobHandlerContext): Promise<void> {
  const tenantId = _ctx.job.payload?.tenantId as string | undefined;
  if (!tenantId) return;
  // FUTURE: Load session/document and run agentic cleanup (e.g. agenticLedgerToTrialBalance, classifyIngestionAgentic)
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

/** Run resolution agent for a queued financial event. Wrapped in boundary scope for AI safety. */
export async function handleResolutionAgent(ctx: JobHandlerContext): Promise<void> {
  const tenantId = ctx.job.payload?.tenantId as string | undefined;
  const packet = ctx.job.payload?.packet as FinancialEventPacket | undefined;
  if (!tenantId && !packet?.metadata?.tenantId) {
    throw new Error('resolution_agent job requires tenantId in packet.metadata');
  }
  const tid = tenantId ?? packet!.metadata.tenantId;
  if (!packet) {
    throw new Error('resolution_agent job requires payload.packet (FinancialEventPacket)');
  }
  const pool = await getTenantPool(tid);
  const packetAny = packet as unknown as Record<string, unknown>;
  const result = await runInBoundaryScope(async () => {
    return await runResolutionAgent({
      pool,
      tenantId: tid,
      event: packet,
      eventData: (packetAny.data as Record<string, unknown>) ?? {},
    });
  });
  if (!result.ok) {
    log('warn', 'Resolution agent job completed with failures', {
      eventType: packet.eventType,
      attempts: result.attempts,
      errors: result.errors,
    });
  }
}

export const JOB_HANDLERS: Record<
  string,
  (ctx: JobHandlerContext) => Promise<void>
> = {
  // QUARANTINED — Automated ingestion pipeline not in MVP architecture
  // ingestion_pipeline: handleIngestionPipeline,
  agentic_cleanup: handleAgenticCleanup,
  statement_generation: handleStatementGeneration,
  resolution_agent: handleResolutionAgent,
  gate_check: handleGateCheckJob,
};
