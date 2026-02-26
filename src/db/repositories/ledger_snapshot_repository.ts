/**
 * Ledger snapshot repository — immutable snapshots for certification/export.
 */

import type { Pool, PoolClient } from 'pg';

/** Pool or client (for transactional writes). Both expose .query(). */
type Queryable = Pool | PoolClient;
import type { LedgerSnapshot, LedgerSnapshotPayload, LedgerSnapshotSource } from '../../types/ledger_snapshot.js';

interface LedgerSnapshotRow {
  id: string;
  tenant_id: string;
  period_label: string;
  created_at: string;
  created_by: string | null;
  source: string;
  snapshot_payload_json: unknown;
  snapshot_hash: string;
  hash_version: number;
  close_session_id: string | null;
}

function rowToSnapshot(row: LedgerSnapshotRow): LedgerSnapshot {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label,
    createdAt: typeof row.created_at === 'string' ? row.created_at : (row.created_at as Date).toISOString(),
    createdBy: row.created_by ?? undefined,
    source: row.source as LedgerSnapshotSource,
    snapshotPayloadJson: row.snapshot_payload_json as LedgerSnapshotPayload,
    snapshotHash: row.snapshot_hash,
    hashVersion: row.hash_version,
    closeSessionId: row.close_session_id ?? undefined,
  };
}

export interface InsertLedgerSnapshotParams {
  tenantId: string;
  periodLabel: string;
  createdBy?: string;
  source: LedgerSnapshotSource;
  snapshotPayloadJson: LedgerSnapshotPayload;
  snapshotHash: string;
  hashVersion: number;
  closeSessionId?: string;
}

export async function insertLedgerSnapshot(client: Queryable, params: InsertLedgerSnapshotParams): Promise<LedgerSnapshot> {
  const r = await client.query<LedgerSnapshotRow>(
    `INSERT INTO ledger_snapshots (
      tenant_id, period_label, created_by, source,
      snapshot_payload_json, snapshot_hash, hash_version, close_session_id
    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
    RETURNING id, tenant_id, period_label, created_at, created_by, source,
      snapshot_payload_json, snapshot_hash, hash_version, close_session_id`,
    [
      params.tenantId,
      params.periodLabel,
      params.createdBy ?? null,
      params.source,
      JSON.stringify(params.snapshotPayloadJson),
      params.snapshotHash,
      params.hashVersion,
      params.closeSessionId ?? null,
    ]
  );
  if (r.rows.length === 0) throw new Error('Insert ledger_snapshot did not return row');
  return rowToSnapshot(r.rows[0]);
}

export async function getLedgerSnapshotById(pool: Pool, tenantId: string, id: string): Promise<LedgerSnapshot | null> {
  const r = await pool.query<LedgerSnapshotRow>(
    `SELECT id, tenant_id, period_label, created_at, created_by, source,
      snapshot_payload_json, snapshot_hash, hash_version, close_session_id
     FROM ledger_snapshots WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (r.rows.length === 0) return null;
  return rowToSnapshot(r.rows[0]);
}

/** Get the latest snapshot for a close session (for certified binder/export). */
export async function getLatestSnapshotByCloseSessionId(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<LedgerSnapshot | null> {
  const r = await pool.query<LedgerSnapshotRow>(
    `SELECT id, tenant_id, period_label, created_at, created_by, source,
      snapshot_payload_json, snapshot_hash, hash_version, close_session_id
     FROM ledger_snapshots WHERE close_session_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [closeSessionId, tenantId]
  );
  if (r.rows.length === 0) return null;
  return rowToSnapshot(r.rows[0]);
}
