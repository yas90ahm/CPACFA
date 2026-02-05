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
  const r = await pool.query<Row>(`SELECT ${COLS} FROM close_checklist_items WHERE id = $1`, [id]);
  return rowToItem(r.rows[0]);
}

export async function getChecklistItemById(pool: Pool, id: string): Promise<CloseChecklistItem | null> {
  const r = await pool.query<Row>(`SELECT ${COLS} FROM close_checklist_items WHERE id = $1`, [id]);
  const row = r.rows[0];
  if (!row) return null;
  return rowToItem(row);
}

export async function listChecklistItemsBySessionId(pool: Pool, closeSessionId: string): Promise<CloseChecklistItem[]> {
  const r = await pool.query<Row>(
    `SELECT ${COLS} FROM close_checklist_items WHERE close_session_id = $1 ORDER BY code`,
    [closeSessionId]
  );
  return r.rows.map(rowToItem);
}

export async function updateChecklistItemStatus(
  pool: Pool,
  id: string,
  status: CloseChecklistItemStatus,
  patch?: { completedBy?: string; completedAt?: string; notes?: string }
): Promise<CloseChecklistItem | null> {
  const now = new Date().toISOString();
  const completedBy = patch?.completedBy ?? null;
  const completedAt = patch?.completedAt ?? now;
  const notes = patch?.notes ?? null;
  await pool.query(
    `UPDATE close_checklist_items SET status = $2, updated_at = $3,
       completed_by = COALESCE($4, completed_by), completed_at = CASE WHEN $2 IN ('completed', 'skipped') THEN COALESCE($5::timestamptz, $3) ELSE completed_at END, notes = COALESCE($6, notes)
     WHERE id = $1`,
    [id, status, now, completedBy, completedAt, notes]
  );
  return getChecklistItemById(pool, id);
}

export async function hasChecklistForSession(pool: Pool, closeSessionId: string): Promise<boolean> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM close_checklist_items WHERE close_session_id = $1 LIMIT 1`,
    [closeSessionId]
  );
  return (r.rowCount ?? 0) > 0;
}
