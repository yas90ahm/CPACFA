/**
 * Task Assignment Service — assigns close tasks to team members with deadlines.
 * Tasks can depend on other tasks and are linked to gates.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';

export type TaskType = 'mapping' | 'reconciliation' | 'journal_entry' | 'evidence_upload'
  | 'variance_explanation' | 'statement_review' | 'checklist_item' | 'custom';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export interface CloseTask {
  id: string;
  tenantId: string;
  closeSessionId: string;
  entityId: string | null;
  taskType: TaskType;
  title: string;
  description: string | null;
  relatedObjectType: string | null;
  relatedObjectId: string | null;
  assignedTo: string | null;
  assignedBy: string | null;
  assignedAt: string | null;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: string | null;
  completedBy: string | null;
  priority: TaskPriority;
  dependsOn: string[];
  gateId: string | null;
  createdAt: string;
}

export async function createTask(
  pool: Pool,
  tenantId: string,
  input: {
    closeSessionId: string;
    entityId?: string;
    taskType: TaskType;
    title: string;
    description?: string;
    relatedObjectType?: string;
    relatedObjectId?: string;
    assignedTo?: string;
    assignedBy?: string;
    dueDate?: string;
    priority?: TaskPriority;
    dependsOn?: string[];
    gateId?: string;
  }
): Promise<CloseTask> {
  const id = randomUUID();
  const r = await pool.query<Record<string, unknown>>(
    `INSERT INTO tenant_close_tasks (id, tenant_id, close_session_id, entity_id,
       task_type, title, description, related_object_type, related_object_id,
       assigned_to, assigned_by, assigned_at, due_date, priority, depends_on, gate_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::date, $14, $15::uuid[], $16)
     RETURNING *`,
    [id, tenantId, input.closeSessionId, input.entityId ?? null,
     input.taskType, input.title, input.description ?? null,
     input.relatedObjectType ?? null, input.relatedObjectId ?? null,
     input.assignedTo ?? null, input.assignedBy ?? null,
     input.assignedTo ? new Date().toISOString() : null,
     input.dueDate ?? null, input.priority ?? 'normal',
     input.dependsOn?.length ? input.dependsOn : null, input.gateId ?? null]
  );
  return mapRow(r.rows[0]);
}

export async function assignTask(
  pool: Pool, tenantId: string, taskId: string, assignedTo: string, assignedBy: string
): Promise<CloseTask | null> {
  const r = await pool.query<Record<string, unknown>>(
    `UPDATE tenant_close_tasks SET assigned_to = $3, assigned_by = $4, assigned_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $1 RETURNING *`,
    [tenantId, taskId, assignedTo, assignedBy]
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function completeTask(
  pool: Pool, tenantId: string, taskId: string, completedBy: string
): Promise<CloseTask | null> {
  const r = await pool.query<Record<string, unknown>>(
    `UPDATE tenant_close_tasks SET status = 'completed', completed_at = NOW(), completed_by = $3, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $1 AND status IN ('pending', 'in_progress')
     RETURNING *`,
    [tenantId, taskId, completedBy]
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function startTask(pool: Pool, tenantId: string, taskId: string): Promise<CloseTask | null> {
  const r = await pool.query<Record<string, unknown>>(
    `UPDATE tenant_close_tasks SET status = 'in_progress', updated_at = NOW()
     WHERE id = $2 AND tenant_id = $1 AND status = 'pending' RETURNING *`,
    [tenantId, taskId]
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

export async function listTasks(
  pool: Pool, tenantId: string, closeSessionId: string,
  opts?: { status?: TaskStatus; assignedTo?: string; gateId?: string }
): Promise<CloseTask[]> {
  let sql = 'SELECT * FROM tenant_close_tasks WHERE tenant_id = $1 AND close_session_id = $2';
  const params: unknown[] = [tenantId, closeSessionId];
  if (opts?.status) { params.push(opts.status); sql += ` AND status = $${params.length}`; }
  if (opts?.assignedTo) { params.push(opts.assignedTo); sql += ` AND assigned_to = $${params.length}`; }
  if (opts?.gateId) { params.push(opts.gateId); sql += ` AND gate_id = $${params.length}`; }
  sql += ' ORDER BY priority DESC, due_date NULLS LAST, created_at';
  const r = await pool.query<Record<string, unknown>>(sql, params);
  return r.rows.map(mapRow);
}

export async function getTaskSummary(
  pool: Pool, tenantId: string, closeSessionId: string
): Promise<{ total: number; pending: number; inProgress: number; completed: number; blocked: number; overdue: number }> {
  const r = await pool.query<{ status: string; cnt: number }>(
    `SELECT status, COUNT(*)::int AS cnt FROM tenant_close_tasks
     WHERE tenant_id = $1 AND close_session_id = $2 GROUP BY status`,
    [tenantId, closeSessionId]
  );
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of r.rows) { counts[row.status] = row.cnt; total += row.cnt; }

  const overdueR = await pool.query<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM tenant_close_tasks
     WHERE tenant_id = $1 AND close_session_id = $2 AND status IN ('pending', 'in_progress')
       AND due_date < CURRENT_DATE`,
    [tenantId, closeSessionId]
  );

  return {
    total,
    pending: counts['pending'] ?? 0,
    inProgress: counts['in_progress'] ?? 0,
    completed: counts['completed'] ?? 0,
    blocked: counts['blocked'] ?? 0,
    overdue: overdueR.rows[0]?.cnt ?? 0,
  };
}

/** Auto-generate tasks for a close session based on required work items */
export async function generateTasksForSession(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  entityId: string
): Promise<CloseTask[]> {
  const tasks: CloseTask[] = [];

  // Check what's needed and create tasks
  const reconReqs = await pool.query<{ account_code: string; account_name: string }>(
    `SELECT account_code, COALESCE(account_name, account_code) as account_name
     FROM tenant_recon_requirements WHERE tenant_id = $1 AND entity_id = $2 AND is_required = TRUE`,
    [tenantId, entityId]
  );
  for (const req of reconReqs.rows) {
    tasks.push(await createTask(pool, tenantId, {
      closeSessionId, entityId, taskType: 'reconciliation',
      title: `Reconcile: ${req.account_name}`,
      relatedObjectType: 'account', relatedObjectId: req.account_code,
      gateId: 'recons_complete',
    }));
  }

  // Statement generation task
  tasks.push(await createTask(pool, tenantId, {
    closeSessionId, entityId, taskType: 'statement_review',
    title: 'Generate and review financial statements',
    gateId: 'statements_current',
    dependsOn: tasks.filter((t) => t.taskType === 'reconciliation').map((t) => t.id),
  }));

  return tasks;
}

function mapRow(row: Record<string, unknown>): CloseTask {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    closeSessionId: String(row.close_session_id),
    entityId: row.entity_id != null ? String(row.entity_id) : null,
    taskType: String(row.task_type) as TaskType,
    title: String(row.title),
    description: row.description != null ? String(row.description) : null,
    relatedObjectType: row.related_object_type != null ? String(row.related_object_type) : null,
    relatedObjectId: row.related_object_id != null ? String(row.related_object_id) : null,
    assignedTo: row.assigned_to != null ? String(row.assigned_to) : null,
    assignedBy: row.assigned_by != null ? String(row.assigned_by) : null,
    assignedAt: row.assigned_at != null ? String(row.assigned_at) : null,
    dueDate: row.due_date != null ? String(row.due_date).slice(0, 10) : null,
    status: String(row.status) as TaskStatus,
    completedAt: row.completed_at != null ? String(row.completed_at) : null,
    completedBy: row.completed_by != null ? String(row.completed_by) : null,
    priority: String(row.priority) as TaskPriority,
    dependsOn: Array.isArray(row.depends_on) ? row.depends_on.map(String) : [],
    gateId: row.gate_id != null ? String(row.gate_id) : null,
    createdAt: String(row.created_at),
  };
}
