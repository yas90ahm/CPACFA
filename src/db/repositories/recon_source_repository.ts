/**
 * Repository for tenant_recon_source_data table.
 * CRUD operations for reconciliation source data (bank statements, subledger exports).
 */

import type { Pool } from 'pg';
import type { ReconSourceData, ReconSourceEntry } from '../../types/recon_source.js';

interface SourceRow {
  id: string;
  tenant_id: string;
  recon_id: string;
  close_session_id: string;
  source_type: string;
  file_name: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  entries: ReconSourceEntry[];
  total_amount: string | null;
  entry_count: number;
}

function toModel(row: SourceRow): ReconSourceData {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    reconId: row.recon_id,
    closeSessionId: row.close_session_id,
    sourceType: row.source_type,
    fileName: row.file_name,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    entries: row.entries ?? [],
    totalAmount: row.total_amount ?? '0',
    entryCount: row.entry_count,
  };
}

export async function insertReconSource(
  pool: Pool,
  id: string,
  tenantId: string,
  reconId: string,
  closeSessionId: string,
  sourceType: string,
  fileName: string | null,
  uploadedBy: string | null,
  entries: ReconSourceEntry[],
  totalAmount: number,
  entryCount: number
): Promise<ReconSourceData> {
  const { rows } = await pool.query<SourceRow>(
    `INSERT INTO tenant_recon_source_data
       (id, tenant_id, recon_id, close_session_id, source_type, file_name, uploaded_by, entries, total_amount, entry_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [id, tenantId, reconId, closeSessionId, sourceType, fileName, uploadedBy, JSON.stringify(entries), totalAmount, entryCount]
  );
  return toModel(rows[0]!);
}

export async function getReconSourceByReconAndSession(
  pool: Pool,
  tenantId: string,
  reconId: string,
  closeSessionId: string
): Promise<ReconSourceData | null> {
  const { rows } = await pool.query<SourceRow>(
    `SELECT * FROM tenant_recon_source_data
     WHERE tenant_id = $1 AND recon_id = $2 AND close_session_id = $3
     ORDER BY uploaded_at DESC LIMIT 1`,
    [tenantId, reconId, closeSessionId]
  );
  return rows.length > 0 ? toModel(rows[0]!) : null;
}

export async function listReconSourcesBySession(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<ReconSourceData[]> {
  const { rows } = await pool.query<SourceRow>(
    `SELECT * FROM tenant_recon_source_data
     WHERE tenant_id = $1 AND close_session_id = $2
     ORDER BY uploaded_at DESC`,
    [tenantId, closeSessionId]
  );
  return rows.map(toModel);
}

export async function deleteReconSource(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM tenant_recon_source_data WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return (result.rowCount ?? 0) > 0;
}
