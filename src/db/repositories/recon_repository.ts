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
    amount: Number(row.amount ?? '0'),
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
  tenantId: string,
  id: string,
  closeSessionId: string,
  type: ReconRunType,
  status: ReconRunStatus = 'draft'
): Promise<ReconRun> {
  await pool.query(
    `INSERT INTO recon_runs (id, close_session_id, type, status) VALUES ($1, $2, $3, $4)`,
    [id, closeSessionId, type, status]
  );
  const row = await getReconRunById(pool, tenantId, id);
  if (!row) throw new Error('Failed to fetch recon run after insert');
  return row;
}

export async function getReconRunById(pool: Pool, tenantId: string, id: string): Promise<ReconRun | null> {
  const r = await pool.query<ReconRunRow>(
    `SELECT rr.id, rr.close_session_id, rr.type, rr.created_at, rr.status
     FROM recon_runs rr
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND rr.id = $2`,
    [tenantId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToRun(row);
}

export async function listReconRunsByCloseSession(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  type?: ReconRunType
): Promise<ReconRun[]> {
  let sql = `SELECT rr.id, rr.close_session_id, rr.type, rr.created_at, rr.status
     FROM recon_runs rr
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND rr.close_session_id = $2`;
  const params: unknown[] = [tenantId, closeSessionId];
  if (type) {
    sql += ` AND rr.type = $3`;
    params.push(type);
  }
  sql += ` ORDER BY rr.created_at DESC`;
  const r = await pool.query<ReconRunRow>(sql, params);
  return r.rows.map(rowToRun);
}

export async function updateReconRunStatus(pool: Pool, tenantId: string, id: string, status: ReconRunStatus): Promise<boolean> {
  const r = await pool.query(
    `UPDATE recon_runs rr
     SET status = $1
     FROM close_sessions cs
     WHERE rr.close_session_id = cs.id AND cs.tenant_id = $2 AND rr.id = $3`,
    [status, tenantId, id]
  );
  return (r.rowCount ?? 0) > 0;
}

// --- recon_items ---
const ITEM_COLS = `id, recon_run_id, source, amount, item_date, description, ref, created_at`;

export async function insertReconItem(
  pool: Pool,
  tenantId: string,
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
  const r = await pool.query<ReconItemRow>(
    `SELECT ri.id, ri.recon_run_id, ri.source, ri.amount, ri.item_date, ri.description, ri.ref, ri.created_at
     FROM recon_items ri
     JOIN recon_runs rr ON ri.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND ri.id = $2`,
    [tenantId, id]
  );
  return rowToItem(r.rows[0]);
}

export async function getReconItemById(pool: Pool, tenantId: string, id: string): Promise<ReconItem | null> {
  const r = await pool.query<ReconItemRow>(
    `SELECT ri.id, ri.recon_run_id, ri.source, ri.amount, ri.item_date, ri.description, ri.ref, ri.created_at
     FROM recon_items ri
     JOIN recon_runs rr ON ri.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND ri.id = $2`,
    [tenantId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToItem(row);
}

export async function listReconItemsByRunId(pool: Pool, tenantId: string, reconRunId: string): Promise<ReconItem[]> {
  const r = await pool.query<ReconItemRow>(
    `SELECT ri.id, ri.recon_run_id, ri.source, ri.amount, ri.item_date, ri.description, ri.ref, ri.created_at
     FROM recon_items ri
     JOIN recon_runs rr ON ri.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND ri.recon_run_id = $2
     ORDER BY ri.item_date NULLS LAST, ri.created_at`,
    [tenantId, reconRunId]
  );
  return r.rows.map(rowToItem);
}

// --- recon_match_groups ---
const MG_COLS = `id, recon_run_id, status, match_confidence, decision_record_id, created_at`;

export async function insertReconMatchGroup(
  pool: Pool,
  tenantId: string,
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
  const r = await pool.query<ReconMatchGroupRow>(
    `SELECT rmg.id, rmg.recon_run_id, rmg.status, rmg.match_confidence, rmg.decision_record_id, rmg.created_at
     FROM recon_match_groups rmg
     JOIN recon_runs rr ON rmg.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND rmg.id = $2`,
    [tenantId, id]
  );
  return rowToMatchGroup(r.rows[0]);
}

export async function getReconMatchGroupById(pool: Pool, tenantId: string, id: string): Promise<ReconMatchGroup | null> {
  const r = await pool.query<ReconMatchGroupRow>(
    `SELECT rmg.id, rmg.recon_run_id, rmg.status, rmg.match_confidence, rmg.decision_record_id, rmg.created_at
     FROM recon_match_groups rmg
     JOIN recon_runs rr ON rmg.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND rmg.id = $2`,
    [tenantId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToMatchGroup(row);
}

export async function listReconMatchGroupsByRunId(pool: Pool, tenantId: string, reconRunId: string): Promise<ReconMatchGroup[]> {
  const r = await pool.query<ReconMatchGroupRow>(
    `SELECT rmg.id, rmg.recon_run_id, rmg.status, rmg.match_confidence, rmg.decision_record_id, rmg.created_at
     FROM recon_match_groups rmg
     JOIN recon_runs rr ON rmg.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND rmg.recon_run_id = $2
     ORDER BY rmg.created_at`,
    [tenantId, reconRunId]
  );
  return r.rows.map(rowToMatchGroup);
}

export async function updateReconMatchGroupStatus(
  pool: Pool,
  tenantId: string,
  id: string,
  status: MatchGroupStatus
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE recon_match_groups rmg
     SET status = $1
     FROM recon_runs rr
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE rmg.recon_run_id = rr.id AND cs.tenant_id = $2 AND rmg.id = $3`,
    [status, tenantId, id]
  );
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

export async function listReconMatchGroupItemIds(pool: Pool, tenantId: string, matchGroupId: string): Promise<string[]> {
  const r = await pool.query<{ recon_item_id: string }>(
    `SELECT mgi.recon_item_id
     FROM recon_match_group_items mgi
     JOIN recon_match_groups rmg ON mgi.match_group_id = rmg.id
     JOIN recon_runs rr ON rmg.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND mgi.match_group_id = $2`,
    [tenantId, matchGroupId]
  );
  return r.rows.map((row) => row.recon_item_id);
}

export async function listMatchGroupIdsContainingItem(pool: Pool, tenantId: string, reconItemId: string): Promise<string[]> {
  const r = await pool.query<{ match_group_id: string }>(
    `SELECT mgi.match_group_id
     FROM recon_match_group_items mgi
     JOIN recon_match_groups rmg ON mgi.match_group_id = rmg.id
     JOIN recon_runs rr ON rmg.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND mgi.recon_item_id = $2`,
    [tenantId, reconItemId]
  );
  return r.rows.map((row) => row.match_group_id);
}

// --- recon_exceptions ---
export async function insertReconException(
  pool: Pool,
  tenantId: string,
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
    `SELECT re.id, re.recon_run_id, re.reason, re.status, re.linked_issue_id, re.created_at
     FROM recon_exceptions re
     JOIN recon_runs rr ON re.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND re.id = $2`,
    [tenantId, id]
  );
  return rowToException(r.rows[0]);
}

export async function listReconExceptionsByRunId(pool: Pool, tenantId: string, reconRunId: string): Promise<ReconException[]> {
  const r = await pool.query<ReconExceptionRow>(
    `SELECT re.id, re.recon_run_id, re.reason, re.status, re.linked_issue_id, re.created_at
     FROM recon_exceptions re
     JOIN recon_runs rr ON re.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND re.recon_run_id = $2
     ORDER BY re.created_at`,
    [tenantId, reconRunId]
  );
  return r.rows.map(rowToException);
}

// --- recon_signoffs ---
export async function upsertReconSignoff(
  pool: Pool,
  tenantId: string,
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
    `SELECT rs.recon_run_id, rs.signed_by, rs.signed_at, rs.notes
     FROM recon_signoffs rs
     JOIN recon_runs rr ON rs.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND rs.recon_run_id = $2`,
    [tenantId, reconRunId]
  );
  return rowToSignoff(r.rows[0]);
}

export async function getReconSignoffByRunId(pool: Pool, tenantId: string, reconRunId: string): Promise<ReconSignoff | null> {
  const r = await pool.query<ReconSignoffRow>(
    `SELECT rs.recon_run_id, rs.signed_by, rs.signed_at, rs.notes
     FROM recon_signoffs rs
     JOIN recon_runs rr ON rs.recon_run_id = rr.id
     JOIN close_sessions cs ON rr.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND rs.recon_run_id = $2`,
    [tenantId, reconRunId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToSignoff(row);
}
