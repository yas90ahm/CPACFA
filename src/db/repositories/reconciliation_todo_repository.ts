/**
 * Reconciliation todos per tenant — DB when pool/tenantId present.
 */

import type { Pool } from 'pg';
import type { ReconciliationTodo, ReconciliationTodoStatus } from '../../types/reconciliation_todos.js';

function rowToTodo(row: {
  id: string;
  tenant_id: string;
  gap_id: string;
  title: string;
  action: string;
  status: string;
  urgency: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}): ReconciliationTodo {
  return {
    id: row.id,
    gapId: row.gap_id,
    title: row.title,
    action: row.action,
    status: row.status as ReconciliationTodoStatus,
    urgency: row.urgency as 'high' | 'medium',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export async function create(
  pool: Pool,
  tenantId: string,
  todo: Omit<ReconciliationTodo, 'createdAt' | 'updatedAt'>
): Promise<ReconciliationTodo> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO reconciliation_todos (id, tenant_id, gap_id, title, action, status, urgency, created_at, updated_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      todo.id,
      tenantId,
      todo.gapId,
      todo.title,
      todo.action,
      todo.status,
      todo.urgency,
      now,
      now,
      todo.completedAt ?? null,
    ]
  );
  return { ...todo, createdAt: now, updatedAt: now };
}

export async function list(
  pool: Pool,
  tenantId: string,
  filters?: { status?: ReconciliationTodoStatus; limit?: number }
): Promise<ReconciliationTodo[]> {
  let sql = 'SELECT id, tenant_id, gap_id, title, action, status, urgency, created_at, updated_at, completed_at FROM reconciliation_todos WHERE tenant_id = $1';
  const params: unknown[] = [tenantId];
  if (filters?.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }
  sql += ' ORDER BY created_at DESC';
  const limit = Math.min(500, Math.max(1, filters?.limit ?? 100));
  params.push(limit);
  sql += ` LIMIT $${params.length}`;
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    gap_id: string;
    title: string;
    action: string;
    status: string;
    urgency: string;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  }>(sql, params);
  return r.rows.map(rowToTodo);
}

export async function get(pool: Pool, id: string, tenantId: string): Promise<ReconciliationTodo | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    gap_id: string;
    title: string;
    action: string;
    status: string;
    urgency: string;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  }>(
    'SELECT id, tenant_id, gap_id, title, action, status, urgency, created_at, updated_at, completed_at FROM reconciliation_todos WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  const row = r.rows[0];
  return row ? rowToTodo(row) : null;
}

export async function updateStatus(
  pool: Pool,
  id: string,
  tenantId: string,
  status: ReconciliationTodoStatus
): Promise<ReconciliationTodo | null> {
  const now = new Date().toISOString();
  const completedAt = status === 'done' ? now : null;
  await pool.query(
    'UPDATE reconciliation_todos SET status = $3, updated_at = $4, completed_at = $5 WHERE id = $1 AND tenant_id = $2',
    [id, tenantId, status, now, completedAt]
  );
  return get(pool, id, tenantId);
}

/** Existing gap_ids for tenant (to skip duplicates). */
export async function existingGapIds(pool: Pool, tenantId: string): Promise<Set<string>> {
  const r = await pool.query<{ gap_id: string }>(
    'SELECT gap_id FROM reconciliation_todos WHERE tenant_id = $1',
    [tenantId]
  );
  return new Set(r.rows.map((row) => row.gap_id));
}
