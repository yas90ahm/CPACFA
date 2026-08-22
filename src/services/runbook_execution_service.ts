import { createHash, randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { withTransaction } from '../db/transaction.js';
import * as repository from '../db/repositories/close_runbook_repository.js';
import { enqueueJobWithId } from './job_service.js';
import { executeRunbookCapability } from './runbook_capability_registry.js';
import { getSession } from './close_session_service.js';
import {
  completeChecklistItem,
  getChecklistItems,
  skipChecklistItem,
} from './close_checklist_readiness_service.js';
import { isChecklistRequirementSkippable } from './canadian_aspe_close_profile.js';
import { recordAuditLogAction } from './audit_service.js';
import { draftRunbookAgentWorkpaper } from './runbook_agent_service.js';
import type { CloseFrequency } from '../types/accounting_close_profile.js';
import type { CloseRole } from '../types/close_and_controls.js';
import type {
  RunbookExecution,
  RunbookTaskExecution,
} from '../types/close_runbook.js';

export class RunbookExecutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'RUNBOOK_EXECUTION_NOT_FOUND'
      | 'RUNBOOK_TASK_NOT_FOUND'
      | 'RUNBOOK_TASK_FORBIDDEN'
      | 'RUNBOOK_TASK_NOT_SKIPPABLE'
      | 'RUNBOOK_TASK_INVALID_STATE'
  ) {
    super(message);
    this.name = 'RunbookExecutionError';
  }
}

export interface RunbookExecutionView {
  execution: RunbookExecution;
  tasks: RunbookTaskExecution[];
  summary: {
    total: number;
    completed: number;
    waitingHuman: number;
    blocked: number;
    active: number;
    pending: number;
  };
}

export function runbookTaskJobId(
  tenantId: string,
  taskExecutionId: string,
  dispatchToken = 'initial'
): string {
  const digest = createHash('sha256')
    .update(`runbook-task-execute:v1:${tenantId}:${taskExecutionId}:${dispatchToken}`)
    .digest('hex');
  return `runbook-task-${digest}`;
}

async function refreshExecutionStatus(
  pool: Pool,
  tenantId: string,
  execution: RunbookExecution,
  tasks?: RunbookTaskExecution[]
): Promise<void> {
  const current = tasks ?? await repository.listTaskExecutions(pool, tenantId, execution.id);
  if (current.length > 0 && current.every((task) => task.status === 'completed' || task.status === 'skipped')) {
    await repository.updateExecutionStatus(pool, tenantId, execution.id, 'completed');
    return;
  }
  const hasFailed = current.some((task) => task.status === 'failed');
  const hasActive = current.some((task) => ['queued', 'running'].includes(task.status));
  if (hasFailed && !hasActive) {
    await repository.updateExecutionStatus(pool, tenantId, execution.id, 'failed');
    return;
  }
  const hasBlocked = current.some((task) => task.status === 'blocked');
  if (hasBlocked && !hasActive) {
    await repository.updateExecutionStatus(pool, tenantId, execution.id, 'blocked');
    return;
  }
  await repository.updateExecutionStatus(pool, tenantId, execution.id, 'running');
}

export async function instantiateApprovedRunbookForSession(
  pool: Pool,
  input: {
    tenantId: string;
    entityId: string;
    closeSessionId: string;
    frequency: CloseFrequency;
  }
): Promise<RunbookExecution | null> {
  const session = await getSession(pool, input.tenantId, input.closeSessionId);
  if (!session) {
    throw new RunbookExecutionError('Close session not found.', 'RUNBOOK_EXECUTION_NOT_FOUND');
  }
  if (
    session.entityId !== input.entityId ||
    session.status !== 'in_progress' ||
    session.standard.toUpperCase() !== 'ASPE' ||
    session.basis !== 'accrual'
  ) {
    throw new RunbookExecutionError(
      'Runbook execution requires the matching entity and an in-progress ASPE accrual-basis close.',
      'RUNBOOK_TASK_INVALID_STATE'
    );
  }
  const periodLabel = session.periodEnd.slice(0, 7);
  const existing = await repository.getExecutionBySession(pool, input.tenantId, input.closeSessionId);
  if (existing) {
    await dispatchReadyRunbookTasks(pool, input.tenantId, existing.id);
    return existing;
  }
  const created = await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${input.tenantId}:${input.closeSessionId}:runbook-execution`,
    ]);
    const concurrentExisting = await repository.getExecutionBySession(
      client,
      input.tenantId,
      input.closeSessionId
    );
    if (concurrentExisting) {
      return { execution: concurrentExisting, runbook: null, isNew: false };
    }
    const runbook = await repository.getActiveRunbook(
      client,
      input.tenantId,
      input.entityId,
      input.frequency
    );
    if (!runbook) return null;
    if (!runbook.compiledPlan.executable) {
      throw new RunbookExecutionError('The active runbook is not executable.', 'RUNBOOK_TASK_INVALID_STATE');
    }
    const created = await repository.insertExecution(client, {
      id: randomUUID(),
      tenantId: input.tenantId,
      runbookId: runbook.id,
      closeSessionId: input.closeSessionId,
    });
    await repository.insertTaskExecutions(client, {
      tenantId: input.tenantId,
      executionId: created.id,
      closeSessionId: input.closeSessionId,
      tasks: runbook.compiledPlan.tasks.map((task) => ({ id: randomUUID(), task })),
    });
    return { execution: created, runbook, isNew: true };
  });
  if (!created) return null;
  if (created.isNew && created.runbook) {
    await recordAuditLogAction(pool, input.tenantId, {
      action: 'close_runbook_execution_started',
      resource: `close_session:${input.closeSessionId}:runbook_execution:${created.execution.id}`,
      actor: 'system:close-runbook-coordinator',
      detail: `Started ${created.runbook.name} v${created.runbook.version} with ${created.runbook.compiledPlan.tasks.length} tasks`,
      entityId: input.entityId,
      periodId: input.closeSessionId,
      periodLabel,
    });
  }
  await dispatchReadyRunbookTasks(pool, input.tenantId, created.execution.id);
  return created.execution;
}

export async function dispatchReadyRunbookTasks(
  pool: Pool,
  tenantId: string,
  executionId: string,
  options: { orchestratorDepth?: number } = {}
): Promise<{ queued: number; waitingHuman: number }> {
  const tasks = await repository.listTaskExecutions(pool, tenantId, executionId);
  const byCode = new Map(tasks.map((task) => [task.taskCode, task]));
  let queued = 0;
  let waitingHuman = 0;

  for (const taskExecution of tasks) {
    if (taskExecution.status !== 'pending') continue;
    const dependenciesReady = taskExecution.taskSnapshot.dependencies.every((dependencyCode) => {
      const dependency = byCode.get(dependencyCode);
      return dependency?.status === 'completed' || dependency?.status === 'skipped';
    });
    if (!dependenciesReady) continue;

    const task = taskExecution.taskSnapshot;
    if (task.executionMode === 'human_review') {
      const transitioned = await repository.updateTaskExecution(pool, tenantId, taskExecution.id, 'waiting_human', {
        blockedReason: 'This procedure requires the assigned owner or reviewer.',
        fromStatuses: ['pending'],
      });
      if (transitioned) waitingHuman += 1;
      continue;
    }

    const queuedTask = await repository.updateTaskExecution(pool, tenantId, taskExecution.id, 'queued', {
      fromStatuses: ['pending'],
    });
    if (!queuedTask) continue;
    try {
      await enqueueJobWithId(runbookTaskJobId(tenantId, taskExecution.id, queuedTask.updatedAt), {
        type: 'runbook_task_execute',
        payload: {
          tenantId,
          executionId,
          taskExecutionId: taskExecution.id,
          closeSessionId: taskExecution.closeSessionId,
          ...(options.orchestratorDepth !== undefined
            ? { orchestratorDepth: options.orchestratorDepth }
            : {}),
        },
        // Capability failures are classified by the Close Orchestrator. The
        // generic worker must not retry accounting or control failures first.
        maxAttempts: 1,
      });
    } catch (error) {
      await repository.updateTaskExecution(pool, tenantId, taskExecution.id, 'pending', {
        blockedReason: error instanceof Error ? error.message : String(error),
        fromStatuses: ['queued'],
      });
      throw error;
    }
    queued += 1;
  }
  const execution = await repository.getExecution(pool, tenantId, executionId);
  if (execution) await refreshExecutionStatus(pool, tenantId, execution);
  return { queued, waitingHuman };
}

async function completeLinkedChecklistControl(
  pool: Pool,
  tenantId: string,
  taskExecution: RunbookTaskExecution,
  actor: string,
  notes: string
): Promise<void> {
  const controlCode = taskExecution.taskSnapshot.controlCode;
  if (!controlCode) return;
  const checklist = await getChecklistItems(pool, tenantId, taskExecution.closeSessionId);
  const item = checklist.find((candidate) => candidate.code === controlCode);
  if (item && item.status !== 'completed' && item.status !== 'skipped') {
    await completeChecklistItem(pool, tenantId, item.id, actor, notes);
  }
}

export async function executeRunbookTask(
  pool: Pool,
  tenantId: string,
  taskExecutionId: string
): Promise<RunbookTaskExecution> {
  const taskExecution = await repository.getTaskExecution(pool, tenantId, taskExecutionId);
  if (!taskExecution) {
    throw new RunbookExecutionError('Runbook task execution not found.', 'RUNBOOK_TASK_NOT_FOUND');
  }
  if (taskExecution.status === 'completed' || taskExecution.status === 'skipped') return taskExecution;
  if (!['queued', 'failed'].includes(taskExecution.status)) {
    throw new RunbookExecutionError(
      `Runbook task is ${taskExecution.status} and cannot be executed by a worker.`,
      'RUNBOOK_TASK_INVALID_STATE'
    );
  }

  const running = await repository.updateTaskExecution(pool, tenantId, taskExecution.id, 'running', {
    fromStatuses: ['queued', 'failed'],
  });
  if (!running) {
    const current = await repository.getTaskExecution(pool, tenantId, taskExecution.id);
    if (current?.status === 'completed' || current?.status === 'skipped') return current;
    throw new RunbookExecutionError(
      'Runbook task was claimed by another worker or changed state.',
      'RUNBOOK_TASK_INVALID_STATE'
    );
  }
  try {
    const session = await getSession(pool, tenantId, taskExecution.closeSessionId);
    if (!session) throw new Error(`Close session ${taskExecution.closeSessionId} not found`);
    if (session.status !== 'in_progress') {
      throw new Error(
        `Runbook task execution is frozen while the close session is ${session.status}`
      );
    }
    const periodLabel = session.periodEnd.slice(0, 7);
    const outcome = await executeRunbookCapability({
      pool,
      tenantId,
      closeSessionId: taskExecution.closeSessionId,
      periodLabel,
      task: taskExecution.taskSnapshot,
    });
    if (taskExecution.taskSnapshot.executionMode === 'agent_assisted' && outcome.status !== 'blocked') {
      const agentDraft = await draftRunbookAgentWorkpaper({
        pool,
        tenantId,
        closeSessionId: taskExecution.closeSessionId,
        taskExecutionId: taskExecution.id,
        periodLabel,
        task: taskExecution.taskSnapshot,
        deterministicResult: outcome.result,
      });
      outcome.result = {
        ...outcome.result,
        agentWorkpaper: agentDraft.ok
          ? {
              ...agentDraft.workpaper,
              callLogId: agentDraft.callLogId,
              advisoryOnly: true,
            }
          : {
              unavailable: true,
              error: agentDraft.error,
              callLogId: agentDraft.callLogId,
              advisoryOnly: true,
            },
      };
    }

    let finalStatus = outcome.status;
    let finalReason = outcome.blockedReason;
    if (outcome.status === 'completed' && taskExecution.taskSnapshot.approvalRequired) {
      finalStatus = 'waiting_human';
      finalReason = 'Agent work is complete; reviewer sign-off is required by the approved runbook.';
    }
    const updated = await repository.updateTaskExecution(pool, tenantId, taskExecution.id, finalStatus, {
      result: outcome.result,
      blockedReason: finalReason ?? null,
    });
    if (!updated) throw new Error('Runbook task result did not persist');

    try {
      const {
        enqueueCloseOrchestratorReconcile,
        recordRunbookTaskHumanReviewRequired,
        recordRunbookTaskRecoveryCompleted,
      } = await import('./close_orchestrator_service.js');
      if (finalStatus === 'blocked') {
        await enqueueCloseOrchestratorReconcile({
          tenantId,
          closeSessionId: updated.closeSessionId,
          trigger: 'task_blocked',
          sourceType: 'runbook_task',
          sourceId: updated.id,
          occurrenceToken: updated.updatedAt,
          taskExecutionId: updated.id,
          error: finalReason ?? 'Registered runbook capability returned a blocked outcome.',
        });
      } else if (finalStatus === 'completed') {
        await recordRunbookTaskRecoveryCompleted(pool, {
          tenantId,
          closeSessionId: updated.closeSessionId,
          taskExecutionId: updated.id,
        });
      } else if (finalStatus === 'waiting_human') {
        await recordRunbookTaskHumanReviewRequired(pool, {
          tenantId,
          closeSessionId: updated.closeSessionId,
          taskExecutionId: updated.id,
          reason: finalReason ?? 'A reviewer must approve the registered capability result.',
        });
      }
    } catch {
      // The accounting result is already durable. Recovery telemetry is retried
      // independently and must never roll back a completed deterministic check.
    }

    if (finalStatus === 'completed') {
      await completeLinkedChecklistControl(
        pool,
        tenantId,
        updated,
        'system:close-runbook-agent',
        `Completed by registered capability ${updated.taskSnapshot.capability}`
      );
    }
    await recordAuditLogAction(pool, tenantId, {
      action: 'close_runbook_task_executed',
      resource: `close_session:${updated.closeSessionId}:runbook_task:${updated.taskCode}`,
      actor: 'system:close-runbook-agent',
      detail: `Capability ${updated.taskSnapshot.capability} finished with status ${updated.status}`,
      entityId: session.entityId,
      periodId: updated.closeSessionId,
      periodLabel,
    });
    await dispatchReadyRunbookTasks(pool, tenantId, updated.executionId);
    return updated;
  } catch (error) {
    await repository.updateTaskExecution(pool, tenantId, taskExecution.id, 'failed', {
      blockedReason: error instanceof Error ? error.message : String(error),
      fromStatuses: ['running'],
    });
    throw error;
  }
}

export async function resolveRunbookTask(
  pool: Pool,
  input: {
    tenantId: string;
    taskExecutionId: string;
    action: 'complete' | 'skip' | 'retry';
    actor: string;
    actorRole: CloseRole;
    notes?: string;
  }
): Promise<RunbookTaskExecution> {
  const task = await repository.getTaskExecution(pool, input.tenantId, input.taskExecutionId);
  if (!task) throw new RunbookExecutionError('Runbook task execution not found.', 'RUNBOOK_TASK_NOT_FOUND');
  const session = await getSession(pool, input.tenantId, task.closeSessionId);
  if (!session) {
    throw new RunbookExecutionError('Close session not found.', 'RUNBOOK_EXECUTION_NOT_FOUND');
  }
  if (session.status !== 'in_progress') {
    throw new RunbookExecutionError(
      `Runbook task dispositions are frozen while the close session is ${session.status}.`,
      'RUNBOOK_TASK_INVALID_STATE'
    );
  }
  const periodLabel = session.periodEnd.slice(0, 7);

  if (input.action === 'retry') {
    if (!['reviewer', 'approver'].includes(input.actorRole) && task.assignedTo !== input.actor) {
      throw new RunbookExecutionError('Only the assigned owner or a reviewer may retry this task.', 'RUNBOOK_TASK_FORBIDDEN');
    }
    const updated = await repository.updateTaskExecution(pool, input.tenantId, task.id, 'pending', {
      blockedReason: null,
      fromStatuses: ['waiting_human', 'blocked', 'failed'],
    });
    if (!updated) throw new RunbookExecutionError('Runbook task update failed.', 'RUNBOOK_TASK_NOT_FOUND');
    await recordAuditLogAction(pool, input.tenantId, {
      action: 'close_runbook_task_retried',
      resource: `close_session:${task.closeSessionId}:runbook_task:${task.taskCode}`,
      actor: input.actor,
      detail: `Retry requested by ${input.actorRole}${input.notes?.trim() ? `: ${input.notes.trim()}` : ''}`,
      entityId: session.entityId,
      periodId: task.closeSessionId,
      periodLabel,
    });
    await dispatchReadyRunbookTasks(pool, input.tenantId, task.executionId);
    return (await repository.getTaskExecution(pool, input.tenantId, task.id)) ?? updated;
  }

  if (!['reviewer', 'approver'].includes(input.actorRole)) {
    throw new RunbookExecutionError('Reviewer or approver authority is required.', 'RUNBOOK_TASK_FORBIDDEN');
  }
  if (task.taskSnapshot.completionAuthority === 'approver' && input.actorRole !== 'approver') {
    throw new RunbookExecutionError('Approver authority is required for this control.', 'RUNBOOK_TASK_FORBIDDEN');
  }
  if (!['waiting_human', 'blocked', 'failed'].includes(task.status)) {
    throw new RunbookExecutionError(`Task cannot be resolved from status ${task.status}.`, 'RUNBOOK_TASK_INVALID_STATE');
  }

  if (input.action === 'skip') {
    const controlCode = task.taskSnapshot.controlCode;
    const skippable = controlCode ? isChecklistRequirementSkippable(controlCode) : input.actorRole === 'approver';
    if (!skippable || !input.notes?.trim()) {
      throw new RunbookExecutionError(
        'This task is not skippable, or a not-applicable reason was not provided.',
        'RUNBOOK_TASK_NOT_SKIPPABLE'
      );
    }
    const updated = await repository.updateTaskExecution(pool, input.tenantId, task.id, 'skipped', {
      result: { disposition: 'not_applicable', notes: input.notes, resolvedBy: input.actor },
      blockedReason: null,
      fromStatuses: ['waiting_human', 'blocked', 'failed'],
    });
    if (!updated) throw new RunbookExecutionError('Runbook task update failed.', 'RUNBOOK_TASK_NOT_FOUND');
    if (controlCode) {
      const checklist = await getChecklistItems(pool, input.tenantId, task.closeSessionId);
      const item = checklist.find((candidate) => candidate.code === controlCode);
      if (item && item.status !== 'completed' && item.status !== 'skipped') {
        await skipChecklistItem(pool, input.tenantId, item.id, input.actor, input.notes);
      }
    }
    await recordAuditLogAction(pool, input.tenantId, {
      action: 'close_runbook_task_skipped',
      resource: `close_session:${task.closeSessionId}:runbook_task:${task.taskCode}`,
      actor: input.actor,
      detail: `Not applicable disposition by ${input.actorRole}: ${input.notes.trim()}`,
      entityId: session.entityId,
      periodId: task.closeSessionId,
      periodLabel,
    });
    await dispatchReadyRunbookTasks(pool, input.tenantId, task.executionId);
    try {
      const { recordRunbookTaskHumanReviewCompleted } = await import('./close_orchestrator_service.js');
      await recordRunbookTaskHumanReviewCompleted(pool, {
        tenantId: input.tenantId,
        closeSessionId: task.closeSessionId,
        taskExecutionId: updated.id,
        actor: input.actor,
      });
    } catch {
      // The reviewer disposition is durable; orchestration telemetry is secondary.
    }
    return updated;
  }

  if (task.status !== 'waiting_human') {
    throw new RunbookExecutionError(
      'Blocked or failed checks must be remediated and retried; they cannot be manually overridden as complete.',
      'RUNBOOK_TASK_INVALID_STATE'
    );
  }
  if (!input.notes?.trim()) {
    throw new RunbookExecutionError(
      'A documented reviewer conclusion is required to complete a runbook task.',
      'RUNBOOK_TASK_INVALID_STATE'
    );
  }

  const updated = await repository.updateTaskExecution(pool, input.tenantId, task.id, 'completed', {
    result: {
      ...(task.result ?? {}),
      reviewerDisposition: 'completed',
      reviewerNotes: input.notes.trim(),
      reviewedBy: input.actor,
      reviewedAt: new Date().toISOString(),
    },
    blockedReason: null,
    fromStatuses: ['waiting_human'],
  });
  if (!updated) throw new RunbookExecutionError('Runbook task update failed.', 'RUNBOOK_TASK_NOT_FOUND');
  await completeLinkedChecklistControl(
    pool,
    input.tenantId,
    updated,
    input.actor,
    input.notes?.trim() || 'Completed through approved runbook review.'
  );
  await recordAuditLogAction(pool, input.tenantId, {
    action: 'close_runbook_task_resolved',
    resource: `close_session:${task.closeSessionId}:runbook_task:${task.taskCode}`,
    actor: input.actor,
    detail: `Marked completed by ${input.actorRole}${input.notes ? `: ${input.notes}` : ''}`,
    entityId: session.entityId,
    periodId: task.closeSessionId,
    periodLabel,
  });
  await dispatchReadyRunbookTasks(pool, input.tenantId, task.executionId);
  try {
    const { recordRunbookTaskHumanReviewCompleted } = await import('./close_orchestrator_service.js');
    await recordRunbookTaskHumanReviewCompleted(pool, {
      tenantId: input.tenantId,
      closeSessionId: task.closeSessionId,
      taskExecutionId: updated.id,
      actor: input.actor,
    });
  } catch {
    // The reviewer disposition is durable; orchestration telemetry is secondary.
  }
  return updated;
}

export async function getRunbookExecutionView(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<RunbookExecutionView | null> {
  const execution = await repository.getExecutionBySession(pool, tenantId, closeSessionId);
  if (!execution) return null;
  const tasks = await repository.listTaskExecutions(pool, tenantId, execution.id);
  return {
    execution,
    tasks,
    summary: {
      total: tasks.length,
      completed: tasks.filter((task) => task.status === 'completed' || task.status === 'skipped').length,
      waitingHuman: tasks.filter((task) => task.status === 'waiting_human').length,
      blocked: tasks.filter((task) => task.status === 'blocked' || task.status === 'failed').length,
      active: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length,
      pending: tasks.filter((task) => task.status === 'pending').length,
    },
  };
}
