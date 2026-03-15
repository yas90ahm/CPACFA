/**
 * EBITDA addbacks — DB repository (tenant-scoped).
 */

import type { Pool } from 'pg';
import type { EbitdaAddback } from '../../types/ebitda_bridge.js';

interface AddbackRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  period_label: string;
  close_session_id: string;
  label: string;
  amount: string;
  category: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAddback(row: AddbackRow): EbitdaAddback {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    periodLabel: row.period_label,
    closeSessionId: row.close_session_id,
    label: row.label,
    amount: row.amount,
    category: row.category,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Insert a new EBITDA addback item.
 */
export async function insertAddback(
  pool: Pool,
  input: {
    id: string;
    tenantId: string;
    entityId: string;
    periodLabel: string;
    closeSessionId: string;
    label: string;
    amount: number;
    category: string;
    createdBy?: string;
  }
): Promise<EbitdaAddback> {
  const r = await pool.query<AddbackRow>(
    `INSERT INTO tenant_ebitda_addbacks (id, tenant_id, entity_id, period_label, close_session_id, label, amount, category, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [input.id, input.tenantId, input.entityId, input.periodLabel, input.closeSessionId, input.label, input.amount, input.category, input.createdBy ?? null]
  );
  return rowToAddback(r.rows[0]);
}

/**
 * List all addbacks for a close session.
 */
export async function listAddbacksForSession(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<EbitdaAddback[]> {
  const r = await pool.query<AddbackRow>(
    `SELECT * FROM tenant_ebitda_addbacks
     WHERE tenant_id = $1 AND close_session_id = $2
     ORDER BY created_at`,
    [tenantId, closeSessionId]
  );
  return r.rows.map(rowToAddback);
}

/**
 * Get a single addback by id (tenant-scoped).
 */
export async function getAddbackById(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<EbitdaAddback | null> {
  const r = await pool.query<AddbackRow>(
    `SELECT * FROM tenant_ebitda_addbacks
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return r.rows[0] ? rowToAddback(r.rows[0]) : null;
}

/**
 * Delete an addback by id (tenant-scoped).
 */
export async function deleteAddback(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM tenant_ebitda_addbacks
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return (r.rowCount ?? 0) > 0;
}
