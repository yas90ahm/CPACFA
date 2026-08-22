import type { Pool, PoolClient } from 'pg';
import type {
  CloseRunbook,
  CompiledCloseRunbook,
  CompiledRunbookTask,
  RunbookExecution,
  RunbookExecutionStatus,
  RunbookSourceFormat,
  RunbookTaskExecution,
  RunbookTaskExecutionStatus,
} from '../../types/close_runbook.js';
import type { CloseFrequency } from '../../types/accounting_close_profile.js';

type Queryable = Pool | PoolClient;

interface RunbookRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  name: string;
  version: number | string;
  framework: 'ASPE';
  frequency: CloseFrequency;
  profile_id: string;
  source_filename: string;
  source_format: RunbookSourceFormat;
  source_mime_type: string;
  source_sha256: string;
  source_size_bytes: number | string;
  source_row_count: number | string;
  compiled_plan: unknown;
  status: 'draft' | 'approved' | 'archived';
  is_active: boolean;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  supersedes_runbook_id: string | null;
}

const RUNBOOK_COLUMNS = `
  id, tenant_id, entity_id, name, version, framework, frequency, profile_id,
  source_filename, source_format, source_mime_type, source_sha256,
  source_size_bytes, source_row_count, compiled_plan, status, is_active,
  created_by, created_at, approved_by, approved_at, supersedes_runbook_id
`;

function toRunbook(row: RunbookRow): CloseRunbook {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    name: row.name,
    version: Number(row.version),
    framework: row.framework,
    frequency: row.frequency,
    profileId: row.profile_id,
    sourceFilename: row.source_filename,
    sourceFormat: row.source_format,
    sourceMimeType: row.source_mime_type,
    sourceSha256: row.source_sha256,
    sourceSizeBytes: Number(row.source_size_bytes),
    sourceRowCount: Number(row.source_row_count),
    compiledPlan: row.compiled_plan as CompiledCloseRunbook,
    status: row.status,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    supersedesRunbookId: row.supersedes_runbook_id ?? undefined,
  };
}

export async function nextRunbookVersion(
  client: PoolClient,
  tenantId: string,
  entityId: string,
  name: string
): Promise<number> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${tenantId}:${entityId}:${name}`]);
  const result = await client.query<{ version: string }>(
    `SELECT COALESCE(MAX(version), 0)::text AS version
     FROM close_runbooks
     WHERE tenant_id = $1 AND entity_id = $2 AND name = $3`,
    [tenantId, entityId, name]
  );
  return Number(result.rows[0]?.version ?? 0) + 1;
}

export async function insertDraftRunbook(
  client: PoolClient,
  input: {
    id: string;
    tenantId: string;
    entityId: string;
    name: string;
    version: number;
    frequency: CloseFrequency;
    profileId: string;
    sourceFilename: string;
    sourceFormat: RunbookSourceFormat;
    sourceMimeType: string;
    sourceSha256: string;
    sourceContent: Buffer;
    sourceRowCount: number;
    compiledPlan: CompiledCloseRunbook;
    createdBy: string;
    supersedesRunbookId?: string;
  }
): Promise<CloseRunbook> {
  const result = await client.query<RunbookRow>(
    `INSERT INTO close_runbooks (
       id, tenant_id, entity_id, name, version, framework, frequency, profile_id,
       source_filename, source_format, source_mime_type, source_sha256,
       source_content, source_size_bytes, source_row_count, compiled_plan,
       status, is_active, created_by, supersedes_runbook_id
     ) VALUES (
       $1, $2, $3, $4, $5, 'ASPE', $6, $7,
       $8, $9, $10, $11, $12, $13, $14, $15::jsonb,
       'draft', FALSE, $16, $17
     )
     RETURNING ${RUNBOOK_COLUMNS}`,
    [
      input.id,
      input.tenantId,
      input.entityId,
      input.name,
      input.version,
      input.frequency,
      input.profileId,
      input.sourceFilename,
      input.sourceFormat,
      input.sourceMimeType,
      input.sourceSha256,
      input.sourceContent,
      input.sourceContent.byteLength,
      input.sourceRowCount,
      JSON.stringify(input.compiledPlan),
      input.createdBy,
      input.supersedesRunbookId ?? null,
    ]
  );
  return toRunbook(result.rows[0]!);
}

export async function getRunbook(
  pool: Queryable,
  tenantId: string,
  runbookId: string
): Promise<CloseRunbook | null> {
  const result = await pool.query<RunbookRow>(
    `SELECT ${RUNBOOK_COLUMNS} FROM close_runbooks WHERE tenant_id = $1 AND id = $2`,
    [tenantId, runbookId]
  );
  return result.rows[0] ? toRunbook(result.rows[0]) : null;
}

export async function listRunbooks(
  pool: Queryable,
  tenantId: string,
  filters?: { entityId?: string; frequency?: CloseFrequency }
): Promise<CloseRunbook[]> {
  const conditions = ['tenant_id = $1'];
  const values: unknown[] = [tenantId];
  if (filters?.entityId) {
    values.push(filters.entityId);
    conditions.push(`entity_id = $${values.length}`);
  }
  if (filters?.frequency) {
    values.push(filters.frequency);
    conditions.push(`frequency = $${values.length}`);
  }
  const result = await pool.query<RunbookRow>(
    `SELECT ${RUNBOOK_COLUMNS}
     FROM close_runbooks
     WHERE ${conditions.join(' AND ')}
     ORDER BY is_active DESC, created_at DESC`,
    values
  );
  return result.rows.map(toRunbook);
}

export async function getActiveRunbook(
  pool: Queryable,
  tenantId: string,
  entityId: string,
  frequency: CloseFrequency
): Promise<CloseRunbook | null> {
  const result = await pool.query<RunbookRow>(
    `SELECT ${RUNBOOK_COLUMNS}
     FROM close_runbooks
     WHERE tenant_id = $1 AND entity_id = $2 AND framework = 'ASPE'
       AND frequency = $3 AND status = 'approved' AND is_active = TRUE
     LIMIT 1`,
    [tenantId, entityId, frequency]
  );
  return result.rows[0] ? toRunbook(result.rows[0]) : null;
}

export async function activateRunbook(
  client: PoolClient,
  tenantId: string,
  runbookId: string,
  approvedBy: string
): Promise<CloseRunbook | null> {
  const candidate = await getRunbook(client, tenantId, runbookId);
  if (!candidate) return null;
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `${tenantId}:${candidate.entityId}:${candidate.framework}:${candidate.frequency}:active-runbook`,
  ]);
  await client.query(
    `UPDATE close_runbooks
     SET is_active = FALSE, status = 'archived'
     WHERE tenant_id = $1 AND entity_id = $2 AND framework = $3
       AND frequency = $4 AND id <> $5 AND is_active = TRUE`,
    [tenantId, candidate.entityId, candidate.framework, candidate.frequency, runbookId]
  );
  const result = await client.query<RunbookRow>(
    `UPDATE close_runbooks
     SET status = 'approved', is_active = TRUE, approved_by = $3, approved_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND status = 'draft'
     RETURNING ${RUNBOOK_COLUMNS}`,
    [tenantId, runbookId, approvedBy]
  );
  return result.rows[0] ? toRunbook(result.rows[0]) : null;
}

interface ExecutionRow {
  id: string;
  tenant_id: string;
  runbook_id: string;
  close_session_id: string;
  status: RunbookExecutionStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function toExecution(row: ExecutionRow): RunbookExecution {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    runbookId: row.runbook_id,
    closeSessionId: row.close_session_id,
    status: row.status,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface TaskExecutionRow {
  id: string;
  tenant_id: string;
  execution_id: string;
  close_session_id: string;
  task_code: string;
  task_snapshot: unknown;
  status: RunbookTaskExecutionStatus;
  result: unknown;
  blocked_reason: string | null;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const TASK_EXECUTION_COLUMNS = `
  id, tenant_id, execution_id, close_session_id, task_code, task_snapshot,
  status, result, blocked_reason, assigned_to, started_at, completed_at,
  created_at, updated_at
`;

function toTaskExecution(row: TaskExecutionRow): RunbookTaskExecution {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    executionId: row.execution_id,
    closeSessionId: row.close_session_id,
    taskCode: row.task_code,
    taskSnapshot: row.task_snapshot as CompiledRunbookTask,
    status: row.status,
    result: row.result && typeof row.result === 'object' ? row.result as Record<string, unknown> : undefined,
    blockedReason: row.blocked_reason ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getExecutionBySession(
  pool: Queryable,
  tenantId: string,
  closeSessionId: string
): Promise<RunbookExecution | null> {
  const result = await pool.query<ExecutionRow>(
    `SELECT id, tenant_id, runbook_id, close_session_id, status,
            started_at, completed_at, created_at, updated_at
     FROM close_runbook_executions
     WHERE tenant_id = $1 AND close_session_id = $2`,
    [tenantId, closeSessionId]
  );
  return result.rows[0] ? toExecution(result.rows[0]) : null;
}

export async function getExecution(
  pool: Queryable,
  tenantId: string,
  executionId: string
): Promise<RunbookExecution | null> {
  const result = await pool.query<ExecutionRow>(
    `SELECT id, tenant_id, runbook_id, close_session_id, status,
            started_at, completed_at, created_at, updated_at
     FROM close_runbook_executions
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, executionId]
  );
  return result.rows[0] ? toExecution(result.rows[0]) : null;
}

export async function insertExecution(
  client: PoolClient,
  input: {
    id: string;
    tenantId: string;
    runbookId: string;
    closeSessionId: string;
  }
): Promise<RunbookExecution> {
  const result = await client.query<ExecutionRow>(
    `INSERT INTO close_runbook_executions (
       id, tenant_id, runbook_id, close_session_id, status, started_at
     ) VALUES ($1, $2, $3, $4, 'running', NOW())
     ON CONFLICT (tenant_id, close_session_id) DO UPDATE SET updated_at = NOW()
     RETURNING id, tenant_id, runbook_id, close_session_id, status,
               started_at, completed_at, created_at, updated_at`,
    [input.id, input.tenantId, input.runbookId, input.closeSessionId]
  );
  return toExecution(result.rows[0]!);
}

export async function insertTaskExecutions(
  client: PoolClient,
  input: {
    tenantId: string;
    executionId: string;
    closeSessionId: string;
    tasks: Array<{ id: string; task: CompiledRunbookTask }>;
  }
): Promise<void> {
  for (const item of input.tasks) {
    await client.query(
      `INSERT INTO close_runbook_task_executions (
         id, tenant_id, execution_id, close_session_id, task_code,
         task_snapshot, status, assigned_to
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending', $7)
       ON CONFLICT (execution_id, task_code) DO NOTHING`,
      [
        item.id,
        input.tenantId,
        input.executionId,
        input.closeSessionId,
        item.task.code,
        JSON.stringify(item.task),
        item.task.assignee ?? null,
      ]
    );
  }
}

export async function listTaskExecutions(
  pool: Queryable,
  tenantId: string,
  executionId: string
): Promise<RunbookTaskExecution[]> {
  const result = await pool.query<TaskExecutionRow>(
    `SELECT ${TASK_EXECUTION_COLUMNS}
     FROM close_runbook_task_executions
     WHERE tenant_id = $1 AND execution_id = $2
     ORDER BY created_at, task_code`,
    [tenantId, executionId]
  );
  return result.rows.map(toTaskExecution);
}

export async function getTaskExecution(
  pool: Queryable,
  tenantId: string,
  taskExecutionId: string
): Promise<RunbookTaskExecution | null> {
  const result = await pool.query<TaskExecutionRow>(
    `SELECT ${TASK_EXECUTION_COLUMNS}
     FROM close_runbook_task_executions
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, taskExecutionId]
  );
  return result.rows[0] ? toTaskExecution(result.rows[0]) : null;
}

export async function updateTaskExecution(
  pool: Queryable,
  tenantId: string,
  taskExecutionId: string,
  status: RunbookTaskExecutionStatus,
  patch?: {
    result?: Record<string, unknown>;
    blockedReason?: string | null;
    assignedTo?: string | null;
    fromStatuses?: RunbookTaskExecutionStatus[];
  }
): Promise<RunbookTaskExecution | null> {
  const result = await pool.query<TaskExecutionRow>(
    `UPDATE close_runbook_task_executions
     SET status = $3,
         result = CASE WHEN $4::jsonb IS NULL THEN result ELSE $4::jsonb END,
         blocked_reason = $5,
         assigned_to = COALESCE($6, assigned_to),
         started_at = CASE WHEN $3 = 'running' THEN COALESCE(started_at, NOW()) ELSE started_at END,
         completed_at = CASE WHEN $3 IN ('completed', 'skipped') THEN NOW() ELSE completed_at END,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
       AND ($7::text[] IS NULL OR status = ANY($7::text[]))
     RETURNING ${TASK_EXECUTION_COLUMNS}`,
    [
      tenantId,
      taskExecutionId,
      status,
      patch?.result ? JSON.stringify(patch.result) : null,
      patch?.blockedReason ?? null,
      patch?.assignedTo ?? null,
      patch?.fromStatuses ?? null,
    ]
  );
  return result.rows[0] ? toTaskExecution(result.rows[0]) : null;
}

export async function updateExecutionStatus(
  pool: Queryable,
  tenantId: string,
  executionId: string,
  status: RunbookExecutionStatus
): Promise<void> {
  await pool.query(
    `UPDATE close_runbook_executions
     SET status = $3,
         completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
       AND status IS DISTINCT FROM $3`,
    [tenantId, executionId, status]
  );
}
