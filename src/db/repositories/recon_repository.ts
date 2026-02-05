/**
 * Reconciliation state machine — DB repository (tenant-scoped pool).
 * recon_runs, recon_items, recon_match_groups, recon_match_group_items, recon_exceptions, recon_signoffs.
 */

import type { Pool } from 'pg';
import type {
  ReconRun,
  ReconItem,
  ReconMatchGroup,
  ReconMatchGroupItem,
  ReconException,
  ReconSignoff,
  ReconRunType,
  ReconRunStatus,
  ReconItemSource,
  MatchGroupStatus,
  ReconExceptionStatus,
} from '../../types/recon.js';

// --- Row mappers ---
interface ReconRunRow {
  id: string;
  close_session_id: string;
  type: string;
  created_at: string;
  status: string;
}

interface ReconItemRow {
  id: string;
  recon_run_id: string;
  source: string;
  amount: string;
  item_date: string | null;
  description: string | null;
  ref: unknown;
  created_at: string;
}

interface ReconMatchGroupRow {
  id: string;
  recon_run_id: string;
  status: string;
  match_confidence: string | null;
  decision_record_id: string | null;
  created_at: string;
}

interface ReconExceptionRow {
  id: string;
  recon_run_id: string;
  reason: string;
  status: string;
  linked_issue_id: string | null;
  created_at: string;
}

interface ReconSignoffRow {
  recon_run_id: string;
  signed_by: string;
  signed_at: string;
  notes: string | null;
}

function rowToRun(row: ReconRunRow): ReconRun {
  return {
    id: row.id,
    closeSessionId: row.close_session_id,
    type: row.type as ReconRunType,
    createdAt: row.created_at,
    status: row.status as ReconRunStatus,
  };
}

function rowToItem(row: ReconItemRow): ReconItem {
  return {
    id: row.id,
    reconRunId: row.recon_run_id,
    source: row.source as ReconItemSource,
    amount: Number(row.amount),
    itemDate: row.item_date ?? undefined,
    description: row.description ?? undefined,
    ref: row.ref != null && typeof row.ref === 'object' ? (row.ref as Record<string, unknown>) : undefined,
    createdAt: row.created_at,
  };
}

function rowToMatchGroup(row: ReconMatchGroupRow): ReconMatchGroup {
  return {
    id: row.id,
    reconRunId: row.recon_run_id,
    status: row.status as MatchGroupStatus,
    matchConfidence: row.match_confidence != null ? Number(row.match_confidence) : undefined,
    decisionRecordId: row.decision_record_id ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToException(row: ReconExceptionRow): ReconException {
  return {
    id: row.id,
    reconRunId: row.recon_run_id,
    reason: row.reason,
    status: row.status as ReconExceptionStatus,
    linkedIssueId: row.linked_issue_id ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToSignoff(row: ReconSignoffRow): ReconSignoff {
  return {
    reconRunId: row.recon_run_id,
    signedBy: row.signed_by,
    signedAt: row.signed_at,
    notes: row.notes ?? undefined,
  };
}

// --- recon_runs ---
export async function insertReconRun(
  pool: Pool,
  id: string,
  closeSessionId: string,
  type: ReconRunType,
  status: ReconRunStatus = 'draft'
): Promise<ReconRun> {
  await pool.query(
    `INSERT INTO recon_runs (id, close_session_id, type, status) VALUES ($1, $2, $3, $4)`,
    [id, closeSessionId, type, status]
  );
  const r = await pool.query<ReconRunRow>(
    `SELECT id, close_session_id, type, created_at, status FROM recon_runs WHERE id = $1`,
    [id]
  );
  return rowToRun(r.rows[0]);
}

export async function getReconRunById(pool: Pool, id: string): Promise<ReconRun | null> {
  const r = await pool.query<ReconRunRow>(
    `SELECT id, close_session_id, type, created_at, status FROM recon_runs WHERE id = $1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToRun(row);
}

export async function listReconRunsByCloseSession(
  pool: Pool,
  closeSessionId: string,
  type?: ReconRunType
): Promise<ReconRun[]> {
  let sql = `SELECT id, close_session_id, type, created_at, status FROM recon_runs WHERE close_session_id = $1`;
  const params: unknown[] = [closeSessionId];
  if (type) {
    sql += ` AND type = $2`;
    params.push(type);
  }
  sql += ` ORDER BY created_at DESC`;
  const r = await pool.query<ReconRunRow>(sql, params);
  return r.rows.map(rowToRun);
}

export async function updateReconRunStatus(pool: Pool, id: string, status: ReconRunStatus): Promise<boolean> {
  const r = await pool.query(`UPDATE recon_runs SET status = $1 WHERE id = $2`, [status, id]);
  return (r.rowCount ?? 0) > 0;
}

// --- recon_items ---
const ITEM_COLS = `id, recon_run_id, source, amount, item_date, description, ref, created_at`;

export async function insertReconItem(
  pool: Pool,
  id: string,
  reconRunId: string,
  input: {
    source: ReconItemSource;
    amount: number;
    itemDate?: string;
    description?: string;
    ref?: Record<string, unknown>;
  }
): Promise<ReconItem> {
  await pool.query(
    `INSERT INTO recon_items (id, recon_run_id, source, amount, item_date, description, ref) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      reconRunId,
      input.source,
      input.amount,
      input.itemDate ?? null,
      input.description ?? null,
      input.ref != null ? JSON.stringify(input.ref) : null,
    ]
  );
  const r = await pool.query<ReconItemRow>(`SELECT ${ITEM_COLS} FROM recon_items WHERE id = $1`, [id]);
  return rowToItem(r.rows[0]);
}

export async function getReconItemById(pool: Pool, id: string): Promise<ReconItem | null> {
  const r = await pool.query<ReconItemRow>(`SELECT ${ITEM_COLS} FROM recon_items WHERE id = $1`, [id]);
  const row = r.rows[0];
  if (!row) return null;
  return rowToItem(row);
}

export async function listReconItemsByRunId(pool: Pool, reconRunId: string): Promise<ReconItem[]> {
  const r = await pool.query<ReconItemRow>(
    `SELECT ${ITEM_COLS} FROM recon_items WHERE recon_run_id = $1 ORDER BY item_date NULLS LAST, created_at`,
    [reconRunId]
  );
  return r.rows.map(rowToItem);
}

// --- recon_match_groups ---
const MG_COLS = `id, recon_run_id, status, match_confidence, decision_record_id, created_at`;

export async function insertReconMatchGroup(
  pool: Pool,
  id: string,
  reconRunId: string,
  input: {
    status: MatchGroupStatus;
    matchConfidence?: number;
    decisionRecordId?: string;
  }
): Promise<ReconMatchGroup> {
  await pool.query(
    `INSERT INTO recon_match_groups (id, recon_run_id, status, match_confidence, decision_record_id) VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      reconRunId,
      input.status,
      input.matchConfidence ?? null,
      input.decisionRecordId ?? null,
    ]
  );
  const r = await pool.query<ReconMatchGroupRow>(`SELECT ${MG_COLS} FROM recon_match_groups WHERE id = $1`, [id]);
  return rowToMatchGroup(r.rows[0]);
}

export async function getReconMatchGroupById(pool: Pool, id: string): Promise<ReconMatchGroup | null> {
  const r = await pool.query<ReconMatchGroupRow>(`SELECT ${MG_COLS} FROM recon_match_groups WHERE id = $1`, [id]);
  const row = r.rows[0];
  if (!row) return null;
  return rowToMatchGroup(row);
}

export async function listReconMatchGroupsByRunId(pool: Pool, reconRunId: string): Promise<ReconMatchGroup[]> {
  const r = await pool.query<ReconMatchGroupRow>(
    `SELECT ${MG_COLS} FROM recon_match_groups WHERE recon_run_id = $1 ORDER BY created_at`,
    [reconRunId]
  );
  return r.rows.map(rowToMatchGroup);
}

export async function updateReconMatchGroupStatus(
  pool: Pool,
  id: string,
  status: MatchGroupStatus
): Promise<boolean> {
  const r = await pool.query(`UPDATE recon_match_groups SET status = $1 WHERE id = $2`, [status, id]);
  return (r.rowCount ?? 0) > 0;
}

// --- recon_match_group_items ---
export async function insertReconMatchGroupItem(
  pool: Pool,
  matchGroupId: string,
  reconItemId: string
): Promise<void> {
  await pool.query(
    `INSERT INTO recon_match_group_items (match_group_id, recon_item_id) VALUES ($1, $2) ON CONFLICT (match_group_id, recon_item_id) DO NOTHING`,
    [matchGroupId, reconItemId]
  );
}

export async function listReconMatchGroupItemIds(pool: Pool, matchGroupId: string): Promise<string[]> {
  const r = await pool.query<{ recon_item_id: string }>(
    `SELECT recon_item_id FROM recon_match_group_items WHERE match_group_id = $1`,
    [matchGroupId]
  );
  return r.rows.map((row) => row.recon_item_id);
}

export async function listMatchGroupIdsContainingItem(pool: Pool, reconItemId: string): Promise<string[]> {
  const r = await pool.query<{ match_group_id: string }>(
    `SELECT match_group_id FROM recon_match_group_items WHERE recon_item_id = $1`,
    [reconItemId]
  );
  return r.rows.map((row) => row.match_group_id);
}

// --- recon_exceptions ---
export async function insertReconException(
  pool: Pool,
  id: string,
  reconRunId: string,
  input: {
    reason: string;
    status?: ReconExceptionStatus;
    linkedIssueId?: string;
  }
): Promise<ReconException> {
  await pool.query(
    `INSERT INTO recon_exceptions (id, recon_run_id, reason, status, linked_issue_id) VALUES ($1, $2, $3, $4, $5)`,
    [id, reconRunId, input.reason, input.status ?? 'open', input.linkedIssueId ?? null]
  );
  const r = await pool.query<ReconExceptionRow>(
    `SELECT id, recon_run_id, reason, status, linked_issue_id, created_at FROM recon_exceptions WHERE id = $1`,
    [id]
  );
  return rowToException(r.rows[0]);
}

export async function listReconExceptionsByRunId(pool: Pool, reconRunId: string): Promise<ReconException[]> {
  const r = await pool.query<ReconExceptionRow>(
    `SELECT id, recon_run_id, reason, status, linked_issue_id, created_at FROM recon_exceptions WHERE recon_run_id = $1 ORDER BY created_at`,
    [reconRunId]
  );
  return r.rows.map(rowToException);
}

// --- recon_signoffs ---
export async function upsertReconSignoff(
  pool: Pool,
  reconRunId: string,
  signedBy: string,
  notes?: string
): Promise<ReconSignoff> {
  await pool.query(
    `INSERT INTO recon_signoffs (recon_run_id, signed_by, notes) VALUES ($1, $2, $3)
     ON CONFLICT (recon_run_id) DO UPDATE SET signed_by = $2, signed_at = NOW(), notes = $3`,
    [reconRunId, signedBy, notes ?? null]
  );
  const r = await pool.query<ReconSignoffRow>(
    `SELECT recon_run_id, signed_by, signed_at, notes FROM recon_signoffs WHERE recon_run_id = $1`,
    [reconRunId]
  );
  return rowToSignoff(r.rows[0]);
}

export async function getReconSignoffByRunId(pool: Pool, reconRunId: string): Promise<ReconSignoff | null> {
  const r = await pool.query<ReconSignoffRow>(
    `SELECT recon_run_id, signed_by, signed_at, notes FROM recon_signoffs WHERE recon_run_id = $1`,
    [reconRunId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToSignoff(row);
}
