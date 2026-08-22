import type { Pool, PoolClient } from 'pg';
import type {
  CloseOrchestratorEvent,
  CloseOrchestratorRun,
  CloseOrchestratorRunStatus,
  CloseRecoveryFailureClass,
  CloseRecoveryIncident,
  CloseRecoveryIncidentStatus,
} from '../../types/close_orchestrator.js';

type Queryable = Pool | PoolClient;

interface RunRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  close_session_id: string;
  status: CloseOrchestratorRunStatus;
  max_depth: number | string;
  max_steps: number | string;
  steps_used: number | string;
  memory_context_count: number | string;
  stop_reason: string | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
}

interface EventRow {
  id: string;
  tenant_id: string;
  run_id: string;
  close_session_id: string;
  parent_event_id: string | null;
  depth: number | string;
  event_type: CloseOrchestratorEvent['eventType'];
  source_type: CloseOrchestratorEvent['sourceType'] | null;
  source_id: string | null;
  decision: unknown;
  actor: string;
  created_at: string;
}

interface IncidentRow {
  id: string;
  tenant_id: string;
  run_id: string;
  close_session_id: string;
  task_execution_id: string | null;
  failure_class: CloseRecoveryFailureClass;
  status: CloseRecoveryIncidentStatus;
  auto_recoverable: boolean;
  attempt_count: number | string;
  max_attempts: number | string;
  error_fingerprint: string;
  detail: unknown;
  resolution: unknown;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

const RUN_COLUMNS = `
  id, tenant_id, entity_id, close_session_id, status, max_depth, max_steps,
  steps_used, memory_context_count, stop_reason, started_at, completed_at, updated_at
`;
const EVENT_COLUMNS = `
  id, tenant_id, run_id, close_session_id, parent_event_id, depth, event_type,
  source_type, source_id, decision, actor, created_at
`;
const INCIDENT_COLUMNS = `
  id, tenant_id, run_id, close_session_id, task_execution_id, failure_class,
  status, auto_recoverable, attempt_count, max_attempts, error_fingerprint,
  detail, resolution, created_at, updated_at, resolved_at
`;

function toRun(row: RunRow): CloseOrchestratorRun {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    closeSessionId: row.close_session_id,
    status: row.status,
    maxDepth: Number(row.max_depth),
    maxSteps: Number(row.max_steps),
    stepsUsed: Number(row.steps_used),
    memoryContextCount: Number(row.memory_context_count),
    stopReason: row.stop_reason ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

function toEvent(row: EventRow): CloseOrchestratorEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    runId: row.run_id,
    closeSessionId: row.close_session_id,
    parentEventId: row.parent_event_id ?? undefined,
    depth: Number(row.depth),
    eventType: row.event_type,
    sourceType: row.source_type ?? undefined,
    sourceId: row.source_id ?? undefined,
    decision: row.decision && typeof row.decision === 'object'
      ? row.decision as Record<string, unknown>
      : {},
    actor: row.actor,
    createdAt: row.created_at,
  };
}

function toIncident(row: IncidentRow): CloseRecoveryIncident {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    runId: row.run_id,
    closeSessionId: row.close_session_id,
    taskExecutionId: row.task_execution_id ?? undefined,
    failureClass: row.failure_class,
    status: row.status,
    autoRecoverable: row.auto_recoverable,
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    errorFingerprint: row.error_fingerprint,
    detail: row.detail && typeof row.detail === 'object' ? row.detail as Record<string, unknown> : {},
    resolution: row.resolution && typeof row.resolution === 'object'
      ? row.resolution as Record<string, unknown>
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

export async function ensureRun(
  db: Queryable,
  input: {
    id: string;
    tenantId: string;
    entityId: string;
    closeSessionId: string;
    maxDepth?: number;
    maxSteps?: number;
  }
): Promise<CloseOrchestratorRun> {
  const result = await db.query<RunRow>(
    `INSERT INTO core.close_orchestrator_runs (
       id, tenant_id, entity_id, close_session_id, max_depth, max_steps
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, close_session_id)
     DO UPDATE SET updated_at = core.close_orchestrator_runs.updated_at
     RETURNING ${RUN_COLUMNS}`,
    [
      input.id,
      input.tenantId,
      input.entityId,
      input.closeSessionId,
      input.maxDepth ?? 3,
      input.maxSteps ?? 25,
    ]
  );
  return toRun(result.rows[0]!);
}

export async function getRunBySession(
  db: Queryable,
  tenantId: string,
  closeSessionId: string
): Promise<CloseOrchestratorRun | null> {
  const result = await db.query<RunRow>(
    `SELECT ${RUN_COLUMNS}
     FROM core.close_orchestrator_runs
     WHERE tenant_id = $1 AND close_session_id = $2`,
    [tenantId, closeSessionId]
  );
  return result.rows[0] ? toRun(result.rows[0]) : null;
}

export async function reserveStep(
  db: Queryable,
  tenantId: string,
  runId: string
): Promise<CloseOrchestratorRun | null> {
  const result = await db.query<RunRow>(
    `UPDATE core.close_orchestrator_runs
     SET steps_used = steps_used + 1, status = 'active', stop_reason = NULL, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
       AND status IN ('active', 'waiting_human')
       AND steps_used < max_steps
     RETURNING ${RUN_COLUMNS}`,
    [tenantId, runId]
  );
  return result.rows[0] ? toRun(result.rows[0]) : null;
}

export async function updateRunStatus(
  db: Queryable,
  tenantId: string,
  runId: string,
  status: CloseOrchestratorRunStatus,
  stopReason?: string
): Promise<CloseOrchestratorRun | null> {
  const result = await db.query<RunRow>(
    `UPDATE core.close_orchestrator_runs
     SET status = $3,
         stop_reason = $4,
         completed_at = CASE WHEN $3 IN ('completed', 'stopped') THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING ${RUN_COLUMNS}`,
    [tenantId, runId, status, stopReason ?? null]
  );
  return result.rows[0] ? toRun(result.rows[0]) : null;
}

export async function incrementMemoryContext(
  db: Queryable,
  tenantId: string,
  runId: string,
  count: number
): Promise<void> {
  if (count <= 0) return;
  await db.query(
    `UPDATE core.close_orchestrator_runs
     SET memory_context_count = memory_context_count + $3, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, runId, count]
  );
}

export async function insertEvent(
  db: Queryable,
  input: Omit<CloseOrchestratorEvent, 'createdAt'>
): Promise<CloseOrchestratorEvent> {
  const result = await db.query<EventRow>(
    `INSERT INTO core.close_orchestrator_events (
       id, tenant_id, run_id, close_session_id, parent_event_id, depth,
       event_type, source_type, source_id, decision, actor
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
     RETURNING ${EVENT_COLUMNS}`,
    [
      input.id,
      input.tenantId,
      input.runId,
      input.closeSessionId,
      input.parentEventId ?? null,
      input.depth,
      input.eventType,
      input.sourceType ?? null,
      input.sourceId ?? null,
      JSON.stringify(input.decision),
      input.actor,
    ]
  );
  return toEvent(result.rows[0]!);
}

export async function listEvents(
  db: Queryable,
  tenantId: string,
  runId: string
): Promise<CloseOrchestratorEvent[]> {
  const result = await db.query<EventRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM core.close_orchestrator_events
     WHERE tenant_id = $1 AND run_id = $2
     ORDER BY created_at, id`,
    [tenantId, runId]
  );
  return result.rows.map(toEvent);
}

export async function upsertIncident(
  db: Queryable,
  input: {
    id: string;
    tenantId: string;
    runId: string;
    closeSessionId: string;
    taskExecutionId?: string;
    failureClass: CloseRecoveryFailureClass;
    status: CloseRecoveryIncidentStatus;
    autoRecoverable: boolean;
    maxAttempts?: number;
    errorFingerprint: string;
    detail: Record<string, unknown>;
  }
): Promise<CloseRecoveryIncident> {
  const result = await db.query<IncidentRow>(
    `INSERT INTO core.close_recovery_incidents (
       id, tenant_id, run_id, close_session_id, task_execution_id,
       failure_class, status, auto_recoverable, max_attempts,
       error_fingerprint, detail
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     ON CONFLICT (tenant_id, close_session_id, error_fingerprint)
     DO UPDATE SET
       detail = EXCLUDED.detail,
       status = CASE
         WHEN core.close_recovery_incidents.status = 'resolved' THEN EXCLUDED.status
         ELSE core.close_recovery_incidents.status
       END,
       attempt_count = CASE
         WHEN core.close_recovery_incidents.status = 'resolved' THEN 0
         ELSE core.close_recovery_incidents.attempt_count
       END,
       resolution = CASE
         WHEN core.close_recovery_incidents.status = 'resolved' THEN NULL
         ELSE core.close_recovery_incidents.resolution
       END,
       resolved_at = CASE
         WHEN core.close_recovery_incidents.status = 'resolved' THEN NULL
         ELSE core.close_recovery_incidents.resolved_at
       END,
       updated_at = NOW()
     RETURNING ${INCIDENT_COLUMNS}`,
    [
      input.id,
      input.tenantId,
      input.runId,
      input.closeSessionId,
      input.taskExecutionId ?? null,
      input.failureClass,
      input.status,
      input.autoRecoverable,
      input.maxAttempts ?? 2,
      input.errorFingerprint,
      JSON.stringify(input.detail),
    ]
  );
  return toIncident(result.rows[0]!);
}

export async function updateIncident(
  db: Queryable,
  tenantId: string,
  incidentId: string,
  input: {
    status: CloseRecoveryIncidentStatus;
    incrementAttempt?: boolean;
    resolution?: Record<string, unknown>;
  }
): Promise<CloseRecoveryIncident | null> {
  const result = await db.query<IncidentRow>(
    `UPDATE core.close_recovery_incidents
     SET status = $3,
         attempt_count = attempt_count + CASE WHEN $4 THEN 1 ELSE 0 END,
         resolution = COALESCE($5::jsonb, resolution),
         resolved_at = CASE WHEN $3 = 'resolved' THEN NOW() ELSE resolved_at END,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
       AND attempt_count + CASE WHEN $4 THEN 1 ELSE 0 END <= max_attempts
     RETURNING ${INCIDENT_COLUMNS}`,
    [tenantId, incidentId, input.status, input.incrementAttempt ?? false, input.resolution ? JSON.stringify(input.resolution) : null]
  );
  return result.rows[0] ? toIncident(result.rows[0]) : null;
}

export async function listIncidents(
  db: Queryable,
  tenantId: string,
  closeSessionId: string
): Promise<CloseRecoveryIncident[]> {
  const result = await db.query<IncidentRow>(
    `SELECT ${INCIDENT_COLUMNS}
     FROM core.close_recovery_incidents
     WHERE tenant_id = $1 AND close_session_id = $2
     ORDER BY created_at DESC`,
    [tenantId, closeSessionId]
  );
  return result.rows.map(toIncident);
}

export async function resolveIncidentsForTask(
  db: Queryable,
  tenantId: string,
  closeSessionId: string,
  taskExecutionId: string,
  resolution: Record<string, unknown>
): Promise<number> {
  const result = await db.query(
    `UPDATE core.close_recovery_incidents
     SET status = 'resolved', resolution = $4::jsonb,
         resolved_at = NOW(), updated_at = NOW()
     WHERE tenant_id = $1 AND close_session_id = $2 AND task_execution_id = $3
       AND status IN ('open', 'retry_scheduled', 'human_required')`,
    [tenantId, closeSessionId, taskExecutionId, JSON.stringify(resolution)]
  );
  return result.rowCount ?? 0;
}
