/**
 * Persistence service — CRUD for tenant_hitl_staging and tenant_supervisor_sessions.
 * Replaces in-memory Maps for HITL and supervisor session state (Pause/Resume, multi-instance).
 */

import type { Pool } from 'pg';

/** Shape matching hitl_orchestrator.StagingItem to avoid circular import. */
export interface StagingItemShape {
  id: string;
  proposedAction: string;
  justification: string;
  status: StagingStatus;
  type: string;
  amount?: number;
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedReason?: string;
}

export type StagingStatus = 'pending' | 'approved' | 'rejected';
export type StagingItemType = 'journal_entry' | 'policy_change' | 'adjustment' | 'flag_override' | 'other';

function nextStagingId(): string {
  return `hitl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nextSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// --- HITL staging ---

export interface CreateStagingItemParams {
  proposedAction: string;
  justification: string;
  type?: StagingItemType;
  amount?: number;
  payload?: Record<string, unknown>;
}

function rowToStagingItem(r: {
  id: string;
  tenant_id: string;
  proposed_action: string;
  justification: string;
  status: string;
  type: string;
  amount: number | null;
  payload: unknown;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
}): StagingItemShape {
  return {
    id: r.id,
    proposedAction: r.proposed_action,
    justification: r.justification,
    status: r.status as StagingItemShape['status'],
    type: r.type,
    amount: r.amount ?? undefined,
    payload: (r.payload as Record<string, unknown>) ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    approvedAt: r.approved_at ?? undefined,
    approvedBy: r.approved_by ?? undefined,
    rejectedAt: r.rejected_at ?? undefined,
    rejectedReason: r.rejected_reason ?? undefined,
  };
}

export async function createStagingItem(
  pool: Pool,
  tenantId: string,
  params: CreateStagingItemParams
): Promise<StagingItemShape> {
  const id = nextStagingId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tenant_hitl_staging (
      id, tenant_id, proposed_action, justification, status, type, amount, payload, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $8)`,
    [
      id,
      tenantId,
      params.proposedAction,
      params.justification,
      params.type ?? 'other',
      params.amount ?? null,
      params.payload ? JSON.stringify(params.payload) : null,
      now,
    ]
  );
  const got = await getStagingItem(pool, id);
  if (!got) throw new Error('createStagingItem: insert failed');
  return got;
}

export async function getStagingItem(pool: Pool, id: string): Promise<StagingItemShape | undefined> {
  const r = await pool.query(
    `SELECT id, tenant_id, proposed_action, justification, status, type, amount, payload, created_at, updated_at, approved_at, approved_by, rejected_at, rejected_reason
     FROM tenant_hitl_staging WHERE id = $1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return undefined;
  return rowToStagingItem(row as Parameters<typeof rowToStagingItem>[0]);
}

export async function listStagingItems(
  pool: Pool,
  tenantId: string,
  options?: { status?: StagingStatus; limit?: number }
): Promise<StagingItemShape[]> {
  let query = `SELECT id, tenant_id, proposed_action, justification, status, type, amount, payload, created_at, updated_at, approved_at, approved_by, rejected_at, rejected_reason
               FROM tenant_hitl_staging WHERE tenant_id = $1`;
  const args: unknown[] = [tenantId];
  if (options?.status) {
    args.push(options.status);
    query += ` AND status = $${args.length}`;
  }
  query += ' ORDER BY created_at DESC';
  const limit = options?.limit ?? 100;
  args.push(limit);
  query += ` LIMIT $${args.length}`;
  const r = await pool.query(query, args);
  return r.rows.map((row) => rowToStagingItem(row as Parameters<typeof rowToStagingItem>[0]));
}

export async function updateStagingStatus(
  pool: Pool,
  id: string,
  update: {
    status: 'approved' | 'rejected';
    approvedAt?: string;
    approvedBy?: string;
    rejectedAt?: string;
    rejectedReason?: string;
  }
): Promise<StagingItemShape | undefined> {
  const now = new Date().toISOString();
  if (update.status === 'approved') {
    await pool.query(
      `UPDATE tenant_hitl_staging SET status = 'approved', updated_at = $1, approved_at = $1, approved_by = $2 WHERE id = $3`,
      [now, update.approvedBy ?? null, id]
    );
  } else {
    await pool.query(
      `UPDATE tenant_hitl_staging SET status = 'rejected', updated_at = $1, rejected_at = $1, rejected_reason = $2 WHERE id = $3`,
      [now, update.rejectedReason ?? null, id]
    );
  }
  return getStagingItem(pool, id);
}

// --- Supervisor sessions ---

export interface SupervisorSessionRow {
  id: string;
  tenantId: string;
  userId: string | null;
  mode: 'chat' | 'pipeline';
  status: 'active' | 'paused' | 'completed' | 'failed';
  pipelineInputSnapshot: unknown;
  lastStep: string | null;
  lastResultSummary: string | null;
  messageHistory: unknown;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateSessionParams {
  userId?: string;
  mode?: 'chat' | 'pipeline';
  pipelineInputSnapshot?: unknown;
}

export async function createSession(
  pool: Pool,
  tenantId: string,
  params: CreateSessionParams = {}
): Promise<SupervisorSessionRow> {
  const id = nextSessionId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tenant_supervisor_sessions (
      id, tenant_id, user_id, mode, status, pipeline_input_snapshot, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $6)`,
    [
      id,
      tenantId,
      params.userId ?? null,
      params.mode ?? 'chat',
      params.pipelineInputSnapshot != null ? JSON.stringify(params.pipelineInputSnapshot) : null,
      now,
    ]
  );
  const got = await getSession(pool, id);
  if (!got) throw new Error('createSession: insert failed');
  return got;
}

export async function getSession(pool: Pool, sessionId: string): Promise<SupervisorSessionRow | undefined> {
  const r = await pool.query(
    `SELECT id, tenant_id, user_id, mode, status, pipeline_input_snapshot, last_step, last_result_summary, message_history, created_at, updated_at, completed_at
     FROM tenant_supervisor_sessions WHERE id = $1`,
    [sessionId]
  );
  const row = r.rows[0] as {
    id: string;
    tenant_id: string;
    user_id: string | null;
    mode: string;
    status: string;
    pipeline_input_snapshot: unknown;
    last_step: string | null;
    last_result_summary: string | null;
    message_history: unknown;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  } | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id ?? null,
    mode: row.mode as 'chat' | 'pipeline',
    status: row.status as SupervisorSessionRow['status'],
    pipelineInputSnapshot: row.pipeline_input_snapshot,
    lastStep: row.last_step ?? null,
    lastResultSummary: row.last_result_summary ?? null,
    messageHistory: row.message_history,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
  };
}

export async function updateSession(
  pool: Pool,
  sessionId: string,
  patch: Partial<{
    status: 'active' | 'paused' | 'completed' | 'failed';
    lastStep: string;
    lastResultSummary: string;
    messageHistory: unknown;
    completedAt: string | null;
  }>
): Promise<SupervisorSessionRow | undefined> {
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = $1'];
  const values: unknown[] = [now];
  let i = 2;
  if (patch.status !== undefined) {
    updates.push(`status = $${i++}`);
    values.push(patch.status);
  }
  if (patch.lastStep !== undefined) {
    updates.push(`last_step = $${i++}`);
    values.push(patch.lastStep);
  }
  if (patch.lastResultSummary !== undefined) {
    updates.push(`last_result_summary = $${i++}`);
    values.push(patch.lastResultSummary);
  }
  if (patch.messageHistory !== undefined) {
    updates.push(`message_history = $${i++}`);
    values.push(JSON.stringify(patch.messageHistory));
  }
  if (patch.completedAt !== undefined) {
    updates.push(`completed_at = $${i++}`);
    values.push(patch.completedAt);
  }
  values.push(sessionId);
  await pool.query(
    `UPDATE tenant_supervisor_sessions SET ${updates.join(', ')} WHERE id = $${i}`,
    values
  );
  return getSession(pool, sessionId);
}
