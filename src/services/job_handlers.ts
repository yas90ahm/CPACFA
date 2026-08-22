/** Durable worker handlers for governed close, deterministic controls, and ERP writeback. */

import type { JobHandlerContext } from '../types/job.js';
import {
  createTenantScopedPool,
  getTenantPool,
  getTenantPoolWithMigrations,
} from '../db/index.js';
import { generateStatements as generateStatementPackage } from './statement_package_service.js';
import { runResolutionAgent } from '../ai/resolution_agent.js';
import type { FinancialEventPacket } from '../events/financial_event_emitter.js';
import { log } from '../lib/logger.js';
import { runInBoundaryScope } from '../lib/ai_boundary.js';
import { handleGateCheckJob } from './gate_event_service.js';
import { executeApprovedErpWriteback } from './journal_entry_erp_writeback_service.js';
import {
  startConfiguredCloseCycle,
  type CloseCycleKickoffPayload,
} from './close_cycle_orchestrator_service.js';
import { executeRunbookTask } from './runbook_execution_service.js';
import {
  enqueueCloseOrchestratorReconcile,
  reconcileCloseOrchestrator,
} from './close_orchestrator_service.js';
import type { CloseOrchestratorReconcilePayload } from '../types/close_orchestrator.js';
import * as journalRepository from '../db/repositories/journal_entry_repository.js';
import * as writebackRepository from '../db/repositories/journal_entry_erp_writeback_repository.js';

async function getScopedTenantPoolForJob(tenantId: string) {
  const pool = await getTenantPoolWithMigrations(tenantId);
  return createTenantScopedPool(pool, tenantId);
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
    const errMsg = `Resolution agent failed: ${result.errors?.join('; ') ?? 'unknown error'}`;
    log('error', errMsg, {
      eventType: packet.eventType,
      attempts: result.attempts,
      errors: result.errors,
    });
    throw new Error(errMsg);
  }
}

/**
 * Open a configured Canadian close, refresh its ERP trial balance, initialize
 * the ASPE control profile, and dispatch the framework-neutral close workers.
 */
export async function handleCloseCycleKickoff(ctx: JobHandlerContext): Promise<void> {
  const payload = ctx.job.payload ?? {};
  await startConfiguredCloseCycle({
    tenantId: typeof payload.tenantId === 'string' ? payload.tenantId : '',
    entityId: typeof payload.entityId === 'string' ? payload.entityId : '',
    connectionId: typeof payload.connectionId === 'string' ? payload.connectionId : '',
    periodLabel: typeof payload.periodLabel === 'string' ? payload.periodLabel : '',
    profileId: typeof payload.profileId === 'string' ? payload.profileId : '',
    frequency: payload.frequency as CloseCycleKickoffPayload['frequency'],
  });
}

/** Execute one task from an immutable approved runbook snapshot. */
export async function handleRunbookTaskExecute(ctx: JobHandlerContext): Promise<void> {
  const tenantId = typeof ctx.job.payload?.tenantId === 'string' ? ctx.job.payload.tenantId : '';
  const taskExecutionId = typeof ctx.job.payload?.taskExecutionId === 'string'
    ? ctx.job.payload.taskExecutionId
    : '';
  if (!tenantId || !taskExecutionId) {
    throw new Error('runbook_task_execute job requires tenantId and taskExecutionId');
  }
  const pool = await getScopedTenantPoolForJob(tenantId);
  await runInBoundaryScope(async () => {
    await executeRunbookTask(pool, tenantId, taskExecutionId);
  });
}

/** Reconcile one bounded Close Orchestrator trigger. */
export async function handleCloseOrchestratorReconcile(ctx: JobHandlerContext): Promise<void> {
  const raw = ctx.job.payload;
  const triggers: CloseOrchestratorReconcilePayload['trigger'][] = [
    'close_started',
    'human_correction',
    'journal_entry_changed',
    'task_blocked',
    'task_failed',
  ];
  const sourceTypes: CloseOrchestratorReconcilePayload['sourceType'][] = [
    'close_session',
    'journal_entry',
    'runbook_task',
    'memory',
    'job',
  ];
  const tenantId = typeof raw?.tenantId === 'string' ? raw.tenantId.trim() : '';
  const closeSessionId = typeof raw?.closeSessionId === 'string' ? raw.closeSessionId.trim() : '';
  const sourceId = typeof raw?.sourceId === 'string' ? raw.sourceId.trim() : '';
  const trigger = typeof raw?.trigger === 'string' && triggers.includes(
    raw.trigger as CloseOrchestratorReconcilePayload['trigger']
  ) ? raw.trigger as CloseOrchestratorReconcilePayload['trigger'] : undefined;
  const sourceType = typeof raw?.sourceType === 'string' && sourceTypes.includes(
    raw.sourceType as CloseOrchestratorReconcilePayload['sourceType']
  ) ? raw.sourceType as CloseOrchestratorReconcilePayload['sourceType'] : undefined;
  const depth = raw?.depth;
  if (
    !tenantId ||
    !closeSessionId ||
    !trigger ||
    !sourceType ||
    !sourceId ||
    (depth !== undefined && (!Number.isInteger(depth) || Number(depth) < 0 || Number(depth) > 100))
  ) {
    throw new Error(
      'close_orchestrator_reconcile job requires tenantId, closeSessionId, trigger, sourceType, and sourceId'
    );
  }
  const optionalString = (key: string): string | undefined => {
    const value = raw?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  const payload: CloseOrchestratorReconcilePayload = {
    tenantId,
    closeSessionId,
    trigger,
    sourceType,
    sourceId,
    ...(depth !== undefined ? { depth: Number(depth) } : {}),
    ...(optionalString('parentEventId') ? { parentEventId: optionalString('parentEventId') } : {}),
    ...(optionalString('occurrenceToken') ? { occurrenceToken: optionalString('occurrenceToken') } : {}),
    ...(optionalString('memoryId') ? { memoryId: optionalString('memoryId') } : {}),
    ...(optionalString('taskExecutionId') ? { taskExecutionId: optionalString('taskExecutionId') } : {}),
    ...(optionalString('error') ? { error: optionalString('error')?.slice(0, 4_000) } : {}),
  };
  const pool = await getScopedTenantPoolForJob(payload.tenantId);
  await reconcileCloseOrchestrator(pool, payload);
}

/** Post only a persisted, independently approved JE through the ERP gateway. */
export async function handleErpJournalEntryWriteback(ctx: JobHandlerContext): Promise<void> {
  const tenantId = typeof ctx.job.payload?.tenantId === 'string' ? ctx.job.payload.tenantId : '';
  const journalEntryId = typeof ctx.job.payload?.journalEntryId === 'string'
    ? ctx.job.payload.journalEntryId
    : '';
  if (!tenantId || !journalEntryId) {
    throw new Error('erp_je_writeback job requires tenantId and journalEntryId');
  }
  const pool = await getScopedTenantPoolForJob(tenantId);
  try {
    const writeback = await executeApprovedErpWriteback(pool, tenantId, journalEntryId);
    log('info', 'Approved journal entry ERP writeback processed', {
      tenantId,
      journalEntryId,
      status: writeback.status,
      externalId: writeback.externalId,
    });
  } finally {
    // Any conclusive or terminal external result changes close readiness. Queue
    // the deterministic JE control, but never mask or retry the ERP decision.
    const [journalEntry, writeback] = await Promise.all([
      journalRepository.getJournalEntryById(pool, journalEntryId, tenantId),
      writebackRepository.getWriteback(pool, tenantId, journalEntryId),
    ]).catch(() => [null, null] as const);
    if (journalEntry && writeback) {
      await enqueueCloseOrchestratorReconcile({
        tenantId,
        closeSessionId: journalEntry.closeSessionId,
        trigger: 'journal_entry_changed',
        sourceType: 'journal_entry',
        sourceId: journalEntry.id,
        occurrenceToken: `writeback:${writeback.status}:${writeback.updatedAt}`,
      }).catch(() => undefined);
    }
  }
}

export const JOB_HANDLERS: Record<
  string,
  (ctx: JobHandlerContext) => Promise<void>
> = {
  statement_generation: handleStatementGeneration,
  resolution_agent: handleResolutionAgent,
  gate_check: handleGateCheckJob,
  close_cycle_kickoff: handleCloseCycleKickoff,
  close_orchestrator_reconcile: handleCloseOrchestratorReconcile,
  runbook_task_execute: handleRunbookTaskExecute,
  erp_je_writeback: handleErpJournalEntryWriteback,
};
