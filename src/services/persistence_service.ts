/**
 * Persistence service — CRUD for tenant_hitl_staging and tenant_supervisor_sessions.
 * Replaces in-memory Maps for HITL and supervisor session state (Pause/Resume, multi-instance).
 */

import type { Pool, PoolClient } from 'pg';

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
  const got = await getStagingItem(pool, tenantId, id);
  if (!got) throw new Error('createStagingItem: insert failed');
  return got;
}

export async function getStagingItem(pool: Pool, tenantId: string, id: string): Promise<StagingItemShape | undefined> {
  const r = await pool.query(
    `SELECT id, tenant_id, proposed_action, justification, status, type, amount, payload, created_at, updated_at, approved_at, approved_by, rejected_at, rejected_reason
     FROM tenant_hitl_staging WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
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
  tenantId: string,
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
      `UPDATE tenant_hitl_staging SET status = 'approved', updated_at = $1, approved_at = $1, approved_by = $2 WHERE id = $3 AND tenant_id = $4`,
      [now, update.approvedBy ?? null, id, tenantId]
    );
  } else {
    await pool.query(
      `UPDATE tenant_hitl_staging SET status = 'rejected', updated_at = $1, rejected_at = $1, rejected_reason = $2 WHERE id = $3 AND tenant_id = $4`,
      [now, update.rejectedReason ?? null, id, tenantId]
    );
  }
  return getStagingItem(pool, tenantId, id);
}

/** Delete a staging item by id. Returns true if deleted. Tenant-scoped to prevent cross-tenant deletion. */
export async function deleteStagingItem(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM tenant_hitl_staging WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

// --- Supervisor sessions ---

/** Deterministic verification result (V1–V3b from planExecuteVerify). */
export interface ReasoningVerificationResult {
  passed: boolean;
  checks: string[];
}

/** Immutable audit entry for agent Thought or Tool step. */
export interface ReasoningLogEntry {
  stepType: 'thought' | 'tool';
  timestamp: string;
  /** For thought: the reasoning text. */
  thought?: string;
  /** For tool: name, input, result summary. */
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string | Record<string, unknown>;
  /** (A) Raw data the agent saw (e.g. trial balance slice, tool input). */
  rawDataSeen?: unknown;
  /** (B) CPA/CFA rule applied (e.g. plan from Plan-Execute-Verify). */
  ruleApplied?: string;
  /** (C) Deterministic verification result (V1–V3b). */
  verificationResult?: ReasoningVerificationResult;
}

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
  /** Append-only reasoning log (Thought + Tool steps with rawDataSeen, ruleApplied, verificationResult). */
  reasoningLogs?: ReasoningLogEntry[];
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
  const got = await getSession(pool, tenantId, id);
  if (!got) throw new Error('createSession: insert failed');
  return got;
}

export async function getSession(pool: Pool, tenantId: string, sessionId: string): Promise<SupervisorSessionRow | undefined> {
  const r = await pool.query(
    `SELECT id, tenant_id, user_id, mode, status, pipeline_input_snapshot, last_step, last_result_summary, message_history, COALESCE(reasoning_logs, '[]'::jsonb) AS reasoning_logs, created_at, updated_at, completed_at
     FROM tenant_supervisor_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
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
    reasoning_logs?: unknown;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  } | undefined;
  if (!row) return undefined;
  const reasoningLogs = Array.isArray(row.reasoning_logs)
    ? (row.reasoning_logs as ReasoningLogEntry[])
    : typeof row.reasoning_logs === 'object' && row.reasoning_logs !== null && Array.isArray((row.reasoning_logs as { length?: number }).length)
      ? (row.reasoning_logs as ReasoningLogEntry[])
      : [];
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
    reasoningLogs: reasoningLogs.length ? reasoningLogs : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
  };
}

export async function updateSession(
  pool: Pool,
  tenantId: string,
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
  values.push(sessionId, tenantId);
  await pool.query(
    `UPDATE tenant_supervisor_sessions SET ${updates.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1}`,
    values
  );
  return getSession(pool, tenantId, sessionId);
}

export interface ListSessionsOptions {
  status?: SupervisorSessionRow['status'];
  limit?: number;
}

/** List sessions for a tenant, most recent first. */
export async function listSessions(
  pool: Pool,
  tenantId: string,
  options?: ListSessionsOptions
): Promise<SupervisorSessionRow[]> {
  let query = `SELECT id, tenant_id, user_id, mode, status, pipeline_input_snapshot, last_step, last_result_summary, message_history, COALESCE(reasoning_logs, '[]'::jsonb) AS reasoning_logs, created_at, updated_at, completed_at
               FROM tenant_supervisor_sessions WHERE tenant_id = $1`;
  const args: unknown[] = [tenantId];
  if (options?.status) {
    args.push(options.status);
    query += ` AND status = $${args.length}`;
  }
  query += ' ORDER BY updated_at DESC';
  const limit = options?.limit ?? 50;
  args.push(limit);
  query += ` LIMIT $${args.length}`;
  const r = await pool.query(query, args);
  type SessionRow = {
    id: string;
    tenant_id: string;
    user_id: string | null;
    mode: string;
    status: string;
    pipeline_input_snapshot: unknown;
    last_step: string | null;
    last_result_summary: string | null;
    message_history: unknown;
    reasoning_logs?: unknown;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  };
  return r.rows.map((row) => {
    const rr = row as SessionRow;
    const reasoningLogs = Array.isArray(rr.reasoning_logs) ? (rr.reasoning_logs as ReasoningLogEntry[]) : [];
    return {
      id: rr.id,
      tenantId: rr.tenant_id,
      userId: rr.user_id ?? null,
      mode: rr.mode as 'chat' | 'pipeline',
      status: rr.status as SupervisorSessionRow['status'],
      pipelineInputSnapshot: rr.pipeline_input_snapshot,
      lastStep: rr.last_step ?? null,
      lastResultSummary: rr.last_result_summary ?? null,
      messageHistory: rr.message_history,
      reasoningLogs: reasoningLogs.length ? reasoningLogs : undefined,
      createdAt: rr.created_at,
      updatedAt: rr.updated_at,
      completedAt: rr.completed_at ?? null,
    };
  });
}

/** Delete a session by id. If tenantId is provided, only deletes when tenant_id matches. Returns true if deleted. */
export async function deleteSession(
  pool: Pool,
  sessionId: string,
  tenantId?: string
): Promise<boolean> {
  const r = tenantId
    ? await pool.query(`DELETE FROM tenant_supervisor_sessions WHERE id = $1 AND tenant_id = $2`, [sessionId, tenantId])
    : await pool.query(`DELETE FROM tenant_supervisor_sessions WHERE id = $1`, [sessionId]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Stored in message_history (JSONB) for resume-after-restart.
 * provider identifies the LLM (anthropic | openai | mistral); messages are provider-specific format.
 */
export interface PersistedMessageHistory {
  provider: string;
  messages: unknown[];
}

export function isPersistedMessageHistory(x: unknown): x is PersistedMessageHistory {
  return (
    typeof x === 'object' &&
    x !== null &&
    'provider' in x &&
    'messages' in x &&
    Array.isArray((x as PersistedMessageHistory).messages)
  );
}

// --- Session snapshot (validated trial balance / pipeline input) ---

/**
 * Snapshot shape stored in pipeline_input_snapshot (JSONB).
 * raw_rows: validated trial balance from ingest/upload.
 * statements: output from a prior build (has balanceSheet, profitAndLoss, trialBalance.entries).
 */
export type SessionSnapshot =
  | { type: 'raw_rows'; rawRows: Array<{ accountName?: string; debit?: number; credit?: number; accountCode?: string }> }
  | { type: 'statements'; output: { trialBalance?: { entries?: Array<{ accountName?: string; debit?: number; credit?: number; accountCode?: string }> }; balanceSheet?: unknown; profitAndLoss?: unknown } };

/**
 * Save (or overwrite) the pipeline_input_snapshot for an existing session.
 * Session must exist and tenant_id must match (ensures tenant isolation).
 */
export async function saveSessionSnapshot(
  pool: Pool,
  tenantId: string,
  sessionId: string,
  snapshot: SessionSnapshot
): Promise<void> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE tenant_supervisor_sessions SET pipeline_input_snapshot = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4`,
    [JSON.stringify(snapshot), now, sessionId, tenantId]
  );
  if (r.rowCount === 0) {
    throw new Error(`saveSessionSnapshot: session not found or tenant mismatch (sessionId=${sessionId}, tenantId=${tenantId})`);
  }
}

/**
 * Append one reasoning log entry to tenant_supervisor_sessions.reasoning_logs (immutable audit trail).
 * Session must exist and tenant_id must match.
 */
export async function appendReasoningLog(
  pool: Pool,
  tenantId: string,
  sessionId: string,
  entry: ReasoningLogEntry
): Promise<void> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE tenant_supervisor_sessions
     SET reasoning_logs = COALESCE(reasoning_logs, '[]'::jsonb) || $1::jsonb, updated_at = $2
     WHERE id = $3 AND tenant_id = $4`,
    [JSON.stringify([{ ...entry, timestamp: entry.timestamp || now }]), now, sessionId, tenantId]
  );
  if (r.rowCount === 0) {
    throw new Error(`appendReasoningLog: session not found or tenant mismatch (sessionId=${sessionId}, tenantId=${tenantId})`);
  }
}

/**
 * Same as appendReasoningLog but uses a dedicated client so the write commits independently.
 * Use when the main flow may throw (e.g. 422); ensures the log is committed before any error propagates.
 */
export async function appendReasoningLogWithClient(
  client: PoolClient,
  tenantId: string,
  sessionId: string,
  entry: ReasoningLogEntry
): Promise<void> {
  const now = new Date().toISOString();
  const r = await client.query(
    `UPDATE tenant_supervisor_sessions
     SET reasoning_logs = COALESCE(reasoning_logs, '[]'::jsonb) || $1::jsonb, updated_at = $2
     WHERE id = $3 AND tenant_id = $4`,
    [JSON.stringify([{ ...entry, timestamp: entry.timestamp || now }]), now, sessionId, tenantId]
  );
  if (r.rowCount === 0) {
    throw new Error(`appendReasoningLogWithClient: session not found or tenant mismatch (sessionId=${sessionId}, tenantId=${tenantId})`);
  }
}

/**
 * Load the pipeline_input_snapshot for a session.
 * If tenantId is provided, the session's tenant_id must match (ensures tenant isolation).
 */
export async function loadSessionSnapshot(
  pool: Pool,
  sessionId: string,
  tenantId: string
): Promise<SessionSnapshot | undefined> {
  const session = await getSession(pool, tenantId, sessionId);
  if (!session) return undefined;
  const snap = session.pipelineInputSnapshot as SessionSnapshot | null | undefined;
  if (snap == null || typeof snap !== 'object' || !('type' in snap)) return undefined;
  return snap as SessionSnapshot;
}

// --- Tenant session uploads (multi-tenant, persistent file uploads for ingest) ---

function nextUploadId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface SessionUploadRow {
  id: string;
  tenantId: string;
  sessionId: string;
  filename: string;
  contentType: string | null;
  summaryText: string | null;
  metadata: Record<string, unknown> | null;
  uploadedAt: string;
}

export interface CreateSessionUploadParams {
  filename: string;
  contentType?: string | null;
  summaryText?: string | null;
  /** Use for raw rows (messy ingest), status (pending_agentic_cleanup), etc. */
  metadata?: Record<string, unknown> | null;
}

export async function createSessionUpload(
  pool: Pool,
  tenantId: string,
  sessionId: string,
  params: CreateSessionUploadParams
): Promise<SessionUploadRow> {
  const id = nextUploadId();
  await pool.query(
    `INSERT INTO tenant_session_uploads (id, tenant_id, session_id, filename, content_type, summary_text, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      tenantId,
      sessionId,
      params.filename,
      params.contentType ?? null,
      params.summaryText ?? null,
      params.metadata != null ? JSON.stringify(params.metadata) : null,
    ]
  );
  const row = await getSessionUpload(pool, tenantId, id);
  if (!row) throw new Error('createSessionUpload: insert failed');
  return row;
}

export async function getSessionUpload(pool: Pool, tenantId: string, uploadId: string): Promise<SessionUploadRow | undefined> {
  const r = await pool.query(
    `SELECT id, tenant_id, session_id, filename, content_type, summary_text, metadata, uploaded_at
     FROM tenant_session_uploads WHERE id = $1 AND tenant_id = $2`,
    [uploadId, tenantId]
  );
  const row = r.rows[0] as {
    id: string;
    tenant_id: string;
    session_id: string;
    filename: string;
    content_type: string | null;
    summary_text: string | null;
    metadata: unknown;
    uploaded_at: string;
  } | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sessionId: row.session_id,
    filename: row.filename,
    contentType: row.content_type,
    summaryText: row.summary_text,
    metadata: row.metadata != null && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : null,
    uploadedAt: row.uploaded_at,
  };
}

export async function getSessionUploadsBySession(
  pool: Pool,
  tenantId: string,
  sessionId: string
): Promise<SessionUploadRow[]> {
  const r = await pool.query(
    `SELECT id, tenant_id, session_id, filename, content_type, summary_text, metadata, uploaded_at
     FROM tenant_session_uploads WHERE tenant_id = $1 AND session_id = $2 ORDER BY uploaded_at DESC`,
    [tenantId, sessionId]
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    sessionId: row.session_id as string,
    filename: row.filename as string,
    contentType: (row.content_type as string | null) ?? null,
    summaryText: (row.summary_text as string | null) ?? null,
    metadata: row.metadata != null && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : null,
    uploadedAt: row.uploaded_at as string,
  }));
}

export async function updateSessionUploadMetadata(
  pool: Pool,
  uploadId: string,
  tenantId: string,
  metadata: Record<string, unknown>
): Promise<SessionUploadRow | undefined> {
  await pool.query(
    `UPDATE tenant_session_uploads SET metadata = $1 WHERE id = $2 AND tenant_id = $3`,
    [JSON.stringify(metadata), uploadId, tenantId]
  );
  return getSessionUpload(pool, tenantId, uploadId);
}
