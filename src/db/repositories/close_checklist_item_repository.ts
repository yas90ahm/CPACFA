/**
 * Close checklist items — per close_session, required controls for readiness.
 */

import type { Pool } from 'pg';
import type { CloseChecklistItem, CloseChecklistItemStatus, CloseChecklistItemCode } from '../../types/close_checklist_item.js';

interface Row {
  id: string;
  close_session_id: string;
  code: string;
  name: string;
  status: string;
  required: boolean;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const COLS = `id, close_session_id, code, name, status, required, completed_by, completed_at, notes, created_at, updated_at`;

function rowToItem(row: Row): CloseChecklistItem {
  return {
    id: row.id,
    closeSessionId: row.close_session_id,
    code: row.code as CloseChecklistItemCode,
    name: row.name,
    status: row.status as CloseChecklistItemStatus,
    required: row.required,
    completedBy: row.completed_by ?? undefined,
    completedAt: row.completed_at ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertChecklistItem(
  pool: Pool,
  tenantId: string,
  id: string,
  closeSessionId: string,
  input: {
    code: CloseChecklistItemCode;
    name: string;
    status?: CloseChecklistItemStatus;
    required?: boolean;
  }
): Promise<CloseChecklistItem> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO close_checklist_items (id, close_session_id, code, name, status, required, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [id, closeSessionId, input.code, input.name, input.status ?? 'pending', input.required ?? true, now]
  );
  const row = await getChecklistItemById(pool, tenantId, id);
  if (!row) throw new Error('Failed to fetch checklist item after insert');
  return row;
}

export async function getChecklistItemById(pool: Pool, tenantId: string, id: string): Promise<CloseChecklistItem | null> {
  const r = await pool.query<Row>(
    `SELECT cci.id, cci.close_session_id, cci.code, cci.name, cci.status, cci.required, cci.completed_by, cci.completed_at, cci.notes, cci.created_at, cci.updated_at
     FROM close_checklist_items cci
     JOIN close_sessions cs ON cci.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND cci.id = $2`,
    [tenantId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToItem(row);
}

export async function listChecklistItemsBySessionId(pool: Pool, tenantId: string, closeSessionId: string): Promise<CloseChecklistItem[]> {
  const r = await pool.query<Row>(
    `SELECT cci.id, cci.close_session_id, cci.code, cci.name, cci.status, cci.required, cci.completed_by, cci.completed_at, cci.notes, cci.created_at, cci.updated_at
     FROM close_checklist_items cci
     JOIN close_sessions cs ON cci.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND cci.close_session_id = $2
     ORDER BY cci.code`,
    [tenantId, closeSessionId]
  );
  return r.rows.map(rowToItem);
}

export async function updateChecklistItemStatus(
  pool: Pool,
  tenantId: string,
  id: string,
  status: CloseChecklistItemStatus,
  patch?: { completedBy?: string; completedAt?: string; notes?: string }
): Promise<CloseChecklistItem | null> {
  const now = new Date().toISOString();
  const completedBy = patch?.completedBy ?? null;
  const completedAt = patch?.completedAt ?? now;
  const notes = patch?.notes ?? null;
  const result = await pool.query(
    `UPDATE close_checklist_items cci
     SET status = $2, updated_at = $3,
         completed_by = COALESCE($4, completed_by), completed_at = CASE WHEN $2 IN ('completed', 'skipped') THEN COALESCE($5::timestamptz, $3) ELSE completed_at END, notes = COALESCE($6, notes)
     FROM close_sessions cs
     WHERE cci.close_session_id = cs.id AND cs.tenant_id = $7 AND cci.id = $1`,
    [id, status, now, completedBy, completedAt, notes, tenantId]
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return getChecklistItemById(pool, tenantId, id);
}

export async function hasChecklistForSession(pool: Pool, tenantId: string, closeSessionId: string): Promise<boolean> {
  const r = await pool.query<{ id: string }>(
    `SELECT cci.id
     FROM close_checklist_items cci
     JOIN close_sessions cs ON cci.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND cci.close_session_id = $2
     LIMIT 1`,
    [tenantId, closeSessionId]
  );
  return (r.rowCount ?? 0) > 0;
}
