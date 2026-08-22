import { createHash, randomUUID } from 'crypto';
import type { Pool } from 'pg';
import * as orchestratorRepository from '../db/repositories/close_orchestrator_repository.js';
import * as runbookRepository from '../db/repositories/close_runbook_repository.js';
import * as memoryRepository from '../db/repositories/accounting_memory_repository.js';
import { recordMemoryApplication } from './accounting_memory_service.js';
import { enqueueJobWithId } from './job_service.js';
import { getSession } from './close_session_service.js';
import { recordMaterialEvent } from './audit_service.js';
import type {
  CloseOrchestratorEventType,
  CloseOrchestratorReconcilePayload,
  CloseOrchestratorView,
  CloseRecoveryFailureClass,
} from '../types/close_orchestrator.js';

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_STEPS = 25;
const ELIGIBLE_CORRECTION_RECOVERY_CAPABILITIES = new Set(['journal_entry_review']);

export function classifyCloseRecoveryFailure(error: string): {
  failureClass: CloseRecoveryFailureClass;
  autoRecoverable: boolean;
  reason: string;
} {
  const normalized = error.toLowerCase();
  if (/ambiguous|unknown posting outcome|external receipt.*missing|sent.*no response/.test(normalized)) {
    return {
      failureClass: 'ambiguous_external_write',
      autoRecoverable: false,
      reason: 'An external write may have occurred; the ERP receipt must be reconciled before another attempt.',
    };
  }
  if (/rate.?limit|timeout|timed out|econnreset|econnrefused|temporary|temporarily unavailable|503|502|network/.test(normalized)) {
    return {
      failureClass: 'transient_operational',
      autoRecoverable: true,
      reason: 'The failure is operational and can be retried without changing accounting data.',
    };
  }
  if (/missing|not found|no applicable|no .*population|source.*required|evidence.*required|not initialized|unmapped/.test(normalized)) {
    return {
      failureClass: 'missing_input',
      autoRecoverable: false,
      reason: 'Required accounting input or evidence is missing and requires remediation.',
    };
  }
  if (/variance|imbalance|out of balance|classification|mapping|accounting|journal entr|reconciliation/.test(normalized)) {
    return {
      failureClass: 'accounting_exception',
      autoRecoverable: false,
      reason: 'The failure may change an accounting conclusion and requires human judgment.',
    };
  }
  if (/blocked|control|gate|approval|required review/.test(normalized)) {
    return {
      failureClass: 'control_failure',
      autoRecoverable: false,
      reason: 'A deterministic control did not pass and cannot be bypassed automatically.',
    };
  }
  return {
    failureClass: 'human_correction_required',
    autoRecoverable: false,
    reason: 'The failure is not safely classifiable as operational, so the Close Supervisor must review it.',
  };
}

export function closeOrchestratorJobId(payload: CloseOrchestratorReconcilePayload): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      version: 1,
      tenantId: payload.tenantId,
      closeSessionId: payload.closeSessionId,
      trigger: payload.trigger,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      parentEventId: payload.parentEventId ?? null,
      occurrenceToken: payload.occurrenceToken ?? null,
      depth: payload.depth ?? 0,
    }))
    .digest('hex');
  return `close-orchestrator-${digest}`;
}

export async function enqueueCloseOrchestratorReconcile(
  payload: CloseOrchestratorReconcilePayload
): Promise<{ id: string; inserted: boolean }> {
  return enqueueJobWithId(closeOrchestratorJobId(payload), {
    type: 'close_orchestrator_reconcile',
    payload: payload as unknown as Record<string, unknown>,
    maxAttempts: 3,
  });
}

export async function ensureCloseOrchestratorRun(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
) {
  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) throw new Error(`Close session ${closeSessionId} not found`);
  if (session.standard.toUpperCase() !== 'ASPE') {
    throw new Error('The governed Close Orchestrator currently supports Canadian ASPE sessions only.');
  }
  return orchestratorRepository.ensureRun(pool, {
    id: randomUUID(),
    tenantId,
    entityId: session.entityId,
    closeSessionId,
    maxDepth: DEFAULT_MAX_DEPTH,
    maxSteps: DEFAULT_MAX_STEPS,
  });
}

function eventTypeForTrigger(trigger: CloseOrchestratorReconcilePayload['trigger']): CloseOrchestratorEventType {
  return trigger;
}

function failureFingerprint(
  taskExecutionId: string | undefined,
  failureClass: CloseRecoveryFailureClass,
  error: string
): string {
  const normalized = error.toLowerCase().replace(/\b[0-9a-f]{8,}\b/g, '[id]').replace(/\d+/g, '#');
  return createHash('sha256')
    .update(`${taskExecutionId ?? 'no-task'}:${failureClass}:${normalized}`)
    .digest('hex');
}

async function markHumanRequired(
  pool: Pool,
  input: {
    tenantId: string;
    runId: string;
    closeSessionId: string;
    parentEventId: string;
    depth: number;
    sourceType: CloseOrchestratorReconcilePayload['sourceType'];
    sourceId: string;
    reason: string;
  }
): Promise<void> {
  await orchestratorRepository.insertEvent(pool, {
    id: randomUUID(),
    tenantId: input.tenantId,
    runId: input.runId,
    closeSessionId: input.closeSessionId,
    parentEventId: input.parentEventId,
    depth: input.depth,
    eventType: 'human_required',
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    decision: {
      action: 'stop_for_close_supervisor',
      reason: input.reason,
      accountingDataChanged: false,
    },
    actor: 'system:close-orchestrator',
  });
  await orchestratorRepository.updateRunStatus(
    pool,
    input.tenantId,
    input.runId,
    'waiting_human',
    input.reason
  );
}

async function applyCloseStartMemoryContext(
  pool: Pool,
  input: {
    tenantId: string;
    entityId: string;
    closeSessionId: string;
    periodLabel: string;
    runId: string;
    parentEventId: string;
    depth: number;
  }
): Promise<number> {
  const memories = await memoryRepository.listApprovedMemoriesForPeriod(
    pool,
    input.tenantId,
    input.entityId,
    input.periodLabel
  );
  const existingApplications = await memoryRepository.listApplications(
    pool,
    input.tenantId,
    input.closeSessionId
  );
  const existingMemoryIds = new Set(
    existingApplications
      .filter((application) => application.targetType === 'close_session' && application.outcome === 'context_supplied')
      .map((application) => application.memoryId)
  );
  const newMemories = memories.filter((memory) => !existingMemoryIds.has(memory.id));
  for (const memory of newMemories) {
    await recordMemoryApplication(pool, {
      tenantId: input.tenantId,
      entityId: input.entityId,
      closeSessionId: input.closeSessionId,
      memoryId: memory.id,
      targetType: 'close_session',
      targetId: input.closeSessionId,
      outcome: 'context_supplied',
      similarity: 1,
      detail: {
        reason: "The entity's approved correction memory was loaded at close start.",
        reusableAmountsLoaded: false,
      },
      appliedBy: 'system:close-orchestrator',
    });
  }
  await orchestratorRepository.incrementMemoryContext(
    pool,
    input.tenantId,
    input.runId,
    newMemories.length
  );
  if (newMemories.length > 0) {
    await orchestratorRepository.insertEvent(pool, {
      id: randomUUID(),
      tenantId: input.tenantId,
      runId: input.runId,
      closeSessionId: input.closeSessionId,
      parentEventId: input.parentEventId,
      depth: input.depth,
      eventType: 'memory_applied',
      sourceType: 'close_session',
      sourceId: input.closeSessionId,
      decision: {
        approvedMemoryCount: newMemories.length,
        memoryIds: newMemories.map((memory) => memory.id),
        reusableAmountsLoaded: false,
        currentPeriodEvidenceStillRequired: true,
      },
      actor: 'system:close-orchestrator',
    });
  }
  return newMemories.length;
}

export async function reconcileCloseOrchestrator(
  pool: Pool,
  payload: CloseOrchestratorReconcilePayload
): Promise<void> {
  if (!payload.tenantId || !payload.closeSessionId || !payload.sourceId) {
    throw new Error('Close Orchestrator requires tenantId, closeSessionId, sourceId, and trigger.');
  }
  const session = await getSession(pool, payload.tenantId, payload.closeSessionId);
  if (!session) throw new Error(`Close session ${payload.closeSessionId} not found`);
  const run = await ensureCloseOrchestratorRun(pool, payload.tenantId, payload.closeSessionId);
  if (session.status !== 'in_progress') {
    await orchestratorRepository.updateRunStatus(
      pool,
      payload.tenantId,
      run.id,
      'completed',
      `Close session is ${session.status}; recursive work is frozen.`
    );
    return;
  }

  const depth = payload.depth ?? 0;
  if (depth > run.maxDepth) {
    await orchestratorRepository.updateRunStatus(
      pool,
      payload.tenantId,
      run.id,
      'stopped',
      `Maximum recursion depth ${run.maxDepth} reached.`
    );
    await orchestratorRepository.insertEvent(pool, {
      id: randomUUID(),
      tenantId: payload.tenantId,
      runId: run.id,
      closeSessionId: payload.closeSessionId,
      parentEventId: payload.parentEventId,
      depth: run.maxDepth,
      eventType: 'budget_stopped',
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      decision: { maxDepth: run.maxDepth, requestedDepth: depth },
      actor: 'system:close-orchestrator',
    });
    return;
  }

  const reserved = await orchestratorRepository.reserveStep(pool, payload.tenantId, run.id);
  if (!reserved) {
    await orchestratorRepository.updateRunStatus(
      pool,
      payload.tenantId,
      run.id,
      'stopped',
      `Maximum orchestration step budget ${run.maxSteps} reached.`
    );
    await orchestratorRepository.insertEvent(pool, {
      id: randomUUID(),
      tenantId: payload.tenantId,
      runId: run.id,
      closeSessionId: payload.closeSessionId,
      parentEventId: payload.parentEventId,
      depth: Math.min(depth, run.maxDepth),
      eventType: 'budget_stopped',
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      decision: { maxSteps: run.maxSteps, stepsUsed: run.stepsUsed },
      actor: 'system:close-orchestrator',
    });
    return;
  }

  const rootEvent = await orchestratorRepository.insertEvent(pool, {
    id: randomUUID(),
    tenantId: payload.tenantId,
    runId: run.id,
    closeSessionId: payload.closeSessionId,
    parentEventId: payload.parentEventId,
    depth,
    eventType: eventTypeForTrigger(payload.trigger),
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    decision: {
      trigger: payload.trigger,
      memoryId: payload.memoryId,
      taskExecutionId: payload.taskExecutionId,
      accountingDataChangedByAgent: false,
    },
    actor: payload.trigger === 'human_correction'
      ? 'system:close-supervisor-feedback-loop'
      : 'system:close-orchestrator',
  });

  if (payload.trigger === 'close_started') {
    await applyCloseStartMemoryContext(pool, {
      tenantId: payload.tenantId,
      entityId: session.entityId,
      closeSessionId: payload.closeSessionId,
      periodLabel: session.periodEnd.slice(0, 7),
      runId: run.id,
      parentEventId: rootEvent.id,
      depth: Math.min(depth + 1, run.maxDepth),
    });
    await orchestratorRepository.updateRunStatus(pool, payload.tenantId, run.id, 'active');
    return;
  }

  if (payload.trigger === 'task_blocked' || payload.trigger === 'task_failed') {
    const error = payload.error?.trim() || 'Runbook task did not complete.';
    const classification = classifyCloseRecoveryFailure(error);
    const incident = await orchestratorRepository.upsertIncident(pool, {
      id: randomUUID(),
      tenantId: payload.tenantId,
      runId: run.id,
      closeSessionId: payload.closeSessionId,
      taskExecutionId: payload.taskExecutionId,
      failureClass: classification.failureClass,
      status: classification.autoRecoverable && payload.trigger === 'task_failed'
        ? 'open'
        : 'human_required',
      autoRecoverable: classification.autoRecoverable && payload.trigger === 'task_failed',
      maxAttempts: classification.autoRecoverable ? 2 : 0,
      errorFingerprint: failureFingerprint(payload.taskExecutionId, classification.failureClass, error),
      detail: { error, classificationReason: classification.reason, trigger: payload.trigger },
    });

    if (
      payload.trigger === 'task_failed' &&
      classification.autoRecoverable &&
      payload.taskExecutionId &&
      depth < run.maxDepth &&
      incident.attemptCount < incident.maxAttempts
    ) {
      const task = await runbookRepository.getTaskExecution(
        pool,
        payload.tenantId,
        payload.taskExecutionId
      );
      if (task?.status === 'failed') {
        const reset = await runbookRepository.updateTaskExecution(
          pool,
          payload.tenantId,
          task.id,
          'pending',
          { blockedReason: null, fromStatuses: ['failed'] }
        );
        const updatedIncident = await orchestratorRepository.updateIncident(
          pool,
          payload.tenantId,
          incident.id,
          { status: 'retry_scheduled', incrementAttempt: true }
        );
        if (reset && updatedIncident) {
          await orchestratorRepository.insertEvent(pool, {
            id: randomUUID(),
            tenantId: payload.tenantId,
            runId: run.id,
            closeSessionId: payload.closeSessionId,
            parentEventId: rootEvent.id,
            depth: depth + 1,
            eventType: 'recovery_scheduled',
            sourceType: 'runbook_task',
            sourceId: task.id,
            decision: {
              action: 'retry_registered_capability',
              attempt: updatedIncident.attemptCount,
              maxAttempts: updatedIncident.maxAttempts,
              permissionsExpanded: false,
              accountingDataChanged: false,
            },
            actor: 'system:close-orchestrator',
          });
          const { dispatchReadyRunbookTasks } = await import('./runbook_execution_service.js');
          await dispatchReadyRunbookTasks(pool, payload.tenantId, task.executionId, {
            orchestratorDepth: depth + 1,
          });
          await orchestratorRepository.updateRunStatus(pool, payload.tenantId, run.id, 'active');
          return;
        }
      }
    }
    if (incident.status !== 'human_required') {
      await orchestratorRepository.updateIncident(
        pool,
        payload.tenantId,
        incident.id,
        {
          status: 'human_required',
          resolution: {
            reason: classification.reason,
            automaticRecoveryExhausted: classification.autoRecoverable,
          },
        }
      );
    }
    await markHumanRequired(pool, {
      tenantId: payload.tenantId,
      runId: run.id,
      closeSessionId: payload.closeSessionId,
      parentEventId: rootEvent.id,
      depth: Math.min(depth + 1, run.maxDepth),
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      reason: classification.reason,
    });
    return;
  }

  const execution = await runbookRepository.getExecutionBySession(
    pool,
    payload.tenantId,
    payload.closeSessionId
  );
  if (!execution) {
    await orchestratorRepository.updateRunStatus(pool, payload.tenantId, run.id, 'active');
    return;
  }
  const tasks = await runbookRepository.listTaskExecutions(pool, payload.tenantId, execution.id);
  const recoverableTasks = tasks.filter((task) =>
    ['blocked', 'failed', 'waiting_human'].includes(task.status) &&
    ELIGIBLE_CORRECTION_RECOVERY_CAPABILITIES.has(task.taskSnapshot.capability)
  );
  let recovered = 0;
  for (const task of recoverableTasks.slice(0, 3)) {
    const reset = await runbookRepository.updateTaskExecution(
      pool,
      payload.tenantId,
      task.id,
      'pending',
      { blockedReason: null, fromStatuses: ['blocked', 'failed', 'waiting_human'] }
    );
    if (!reset) continue;
    recovered += 1;
    await orchestratorRepository.insertEvent(pool, {
      id: randomUUID(),
      tenantId: payload.tenantId,
      runId: run.id,
      closeSessionId: payload.closeSessionId,
      parentEventId: rootEvent.id,
      depth: Math.min(depth + 1, run.maxDepth),
      eventType: 'recovery_scheduled',
      sourceType: 'runbook_task',
      sourceId: task.id,
      decision: {
        action: payload.trigger === 'human_correction'
          ? 'rerun_after_close_supervisor_correction'
          : 'rerun_after_journal_entry_status_change',
        triggeringMemoryId: payload.memoryId,
        capability: task.taskSnapshot.capability,
        permissionsExpanded: false,
        accountingDataChanged: false,
      },
      actor: 'system:close-orchestrator',
    });
  }
  let supplementalControlOutcome: 'completed' | 'waiting_human' | 'blocked' | undefined;
  if (recovered > 0) {
    const { dispatchReadyRunbookTasks } = await import('./runbook_execution_service.js');
    await dispatchReadyRunbookTasks(pool, payload.tenantId, execution.id, {
      orchestratorDepth: Math.min(depth + 1, run.maxDepth),
    });
    await orchestratorRepository.updateRunStatus(pool, payload.tenantId, run.id, 'active');
  } else {
    // Completed task outcomes are immutable. If accounting data changes after a
    // reviewer completed the task, append a supplemental deterministic control
    // result instead of reopening or overwriting the original workpaper.
    const completedJournalReview = tasks.find((task) =>
      task.status === 'completed' &&
      ELIGIBLE_CORRECTION_RECOVERY_CAPABILITIES.has(task.taskSnapshot.capability)
    );
    if (completedJournalReview) {
      const { executeRunbookCapability } = await import('./runbook_capability_registry.js');
      const outcome = await executeRunbookCapability({
        pool,
        tenantId: payload.tenantId,
        closeSessionId: payload.closeSessionId,
        periodLabel: session.periodEnd.slice(0, 7),
        task: completedJournalReview.taskSnapshot,
      });
      supplementalControlOutcome = outcome.status;
      const unresolvedJournalEntries = Array.isArray(outcome.result.unresolvedJournalEntries)
        ? outcome.result.unresolvedJournalEntries.length
        : undefined;
      const memoryConflicts = Array.isArray(outcome.result.memoryConflicts)
        ? outcome.result.memoryConflicts.length
        : undefined;
      const unresolvedErpWritebacks = Array.isArray(outcome.result.unresolvedErpWritebacks)
        ? outcome.result.unresolvedErpWritebacks.length
        : undefined;
      await orchestratorRepository.insertEvent(pool, {
        id: randomUUID(),
        tenantId: payload.tenantId,
        runId: run.id,
        closeSessionId: payload.closeSessionId,
        parentEventId: rootEvent.id,
        depth: Math.min(depth + 1, run.maxDepth),
        eventType: outcome.status === 'completed' ? 'recovery_completed' : 'human_required',
        sourceType: 'runbook_task',
        sourceId: completedJournalReview.id,
        decision: {
          action: outcome.status === 'completed'
            ? 'supplemental_immutable_control_recheck_passed'
            : 'supplemental_immutable_control_recheck_requires_human',
          outcome: outcome.status,
          blockedReason: outcome.blockedReason,
          unresolvedJournalEntries,
          memoryConflicts,
          unresolvedErpWritebacks,
          originalCompletedTaskPreserved: true,
          accountingDataChanged: false,
        },
        actor: 'system:close-orchestrator',
      });
      await orchestratorRepository.updateRunStatus(
        pool,
        payload.tenantId,
        run.id,
        outcome.status === 'completed' ? 'active' : 'waiting_human',
        outcome.status === 'completed'
          ? undefined
          : outcome.blockedReason ?? 'The supplemental journal-entry control requires review.'
      );
    } else {
      await orchestratorRepository.updateRunStatus(pool, payload.tenantId, run.id, 'active');
    }
  }
  await recordMaterialEvent(pool, {
    tenantId: payload.tenantId,
    periodLabel: session.periodEnd.slice(0, 7),
    eventType: 'close_orchestrator_event',
    deterministicFlagSnapshot: {
      event: payload.trigger === 'human_correction'
        ? 'human_correction_recheck'
        : 'journal_entry_status_recheck',
      closeSessionId: payload.closeSessionId,
      memoryId: payload.memoryId,
      tasksRequeued: recovered,
      supplementalControlOutcome,
      accountingDataChangedByOrchestrator: false,
    },
    createdBy: 'system:close-orchestrator',
  });
}

export async function recordRunbookTaskRecoveryCompleted(
  pool: Pool,
  input: { tenantId: string; closeSessionId: string; taskExecutionId: string }
): Promise<void> {
  const run = await orchestratorRepository.getRunBySession(pool, input.tenantId, input.closeSessionId);
  if (!run) return;
  const resolved = await orchestratorRepository.resolveIncidentsForTask(
    pool,
    input.tenantId,
    input.closeSessionId,
    input.taskExecutionId,
    { result: 'registered capability completed after recovery', accountingDataChangedByRecovery: false }
  );
  if (resolved === 0) return;
  await orchestratorRepository.insertEvent(pool, {
    id: randomUUID(),
    tenantId: input.tenantId,
    runId: run.id,
    closeSessionId: input.closeSessionId,
    depth: 0,
    eventType: 'recovery_completed',
    sourceType: 'runbook_task',
    sourceId: input.taskExecutionId,
    decision: { incidentsResolved: resolved, accountingDataChangedByRecovery: false },
    actor: 'system:close-orchestrator',
  });
}

export async function recordRunbookTaskHumanReviewRequired(
  pool: Pool,
  input: {
    tenantId: string;
    closeSessionId: string;
    taskExecutionId: string;
    reason: string;
  }
): Promise<void> {
  const run = await orchestratorRepository.getRunBySession(pool, input.tenantId, input.closeSessionId);
  if (!run || run.status === 'stopped' || run.status === 'completed') return;
  await orchestratorRepository.insertEvent(pool, {
    id: randomUUID(),
    tenantId: input.tenantId,
    runId: run.id,
    closeSessionId: input.closeSessionId,
    depth: 0,
    eventType: 'human_required',
    sourceType: 'runbook_task',
    sourceId: input.taskExecutionId,
    decision: {
      action: 'review_registered_capability_result',
      reason: input.reason,
      accountingDataChanged: false,
    },
    actor: 'system:close-orchestrator',
  });
  await orchestratorRepository.updateRunStatus(
    pool,
    input.tenantId,
    run.id,
    'waiting_human',
    input.reason
  );
}

export async function recordRunbookTaskHumanReviewCompleted(
  pool: Pool,
  input: {
    tenantId: string;
    closeSessionId: string;
    taskExecutionId: string;
    actor: string;
  }
): Promise<void> {
  const run = await orchestratorRepository.getRunBySession(pool, input.tenantId, input.closeSessionId);
  if (!run || run.status === 'stopped' || run.status === 'completed') return;
  const execution = await runbookRepository.getExecutionBySession(
    pool,
    input.tenantId,
    input.closeSessionId
  );
  const tasks = execution
    ? await runbookRepository.listTaskExecutions(pool, input.tenantId, execution.id)
    : [];
  const stillWaiting = tasks.some((task) =>
    ['waiting_human', 'blocked', 'failed'].includes(task.status)
  );
  await orchestratorRepository.insertEvent(pool, {
    id: randomUUID(),
    tenantId: input.tenantId,
    runId: run.id,
    closeSessionId: input.closeSessionId,
    depth: 0,
    eventType: 'recovery_completed',
    sourceType: 'runbook_task',
    sourceId: input.taskExecutionId,
    decision: {
      action: 'human_review_completed',
      reviewedBy: input.actor,
      otherHumanStopsRemain: stillWaiting,
      accountingDataChanged: false,
    },
    actor: input.actor,
  });
  await orchestratorRepository.updateRunStatus(
    pool,
    input.tenantId,
    run.id,
    stillWaiting ? 'waiting_human' : 'active',
    stillWaiting ? 'Other runbook tasks still require human review.' : undefined
  );
}

export async function getCloseOrchestratorView(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<CloseOrchestratorView | null> {
  const run = await orchestratorRepository.getRunBySession(pool, tenantId, closeSessionId);
  if (!run) return null;
  const [events, incidents] = await Promise.all([
    orchestratorRepository.listEvents(pool, tenantId, run.id),
    orchestratorRepository.listIncidents(pool, tenantId, closeSessionId),
  ]);
  return { run, events, incidents };
}
