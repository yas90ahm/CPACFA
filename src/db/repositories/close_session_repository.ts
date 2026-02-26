/**
 * Close session — DB repository (tenant-scoped pool).
 *
 * Date normalization (deterministic):
 * - periodStart / periodEnd: ISO date only (YYYY-MM-DD) for period boundaries.
 * - createdAt / updatedAt / certifiedAt: full ISO 8601 string (timestamps).
 */

import type { Pool, PoolClient } from 'pg';

/** Pool or client (for transactional writes). Both expose .query(). */
type Queryable = Pool | PoolClient;
import type { CloseSession, CloseSessionStatus } from '../../types/close_session.js';

interface CloseSessionRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  period_start: string | Date;
  period_end: string | Date;
  basis: string;
  standard: string;
  status: string;
  certified_by: string | null;
  certified_at: string | Date | null;
  certification_memo: string | null;
  certified_snapshot_id: string | null;
  certification_artifact_id: string | null;
  reopened_at: string | Date | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  statements_stale_since: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

/** Normalize to ISO date string (YYYY-MM-DD). Used for periodStart/periodEnd only. */
function toISODateString(v: string | Date | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  return (v as Date).toISOString().slice(0, 10);
}

/** Normalize to full ISO 8601 timestamp string. Used for createdAt/updatedAt/certifiedAt. */
function toISOTimestampString(v: string | Date | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return (v as Date).toISOString();
}

const SESSION_COLUMNS =
  'id, tenant_id, entity_id, period_start, period_end, basis, standard, status, certified_by, certified_at, certification_memo, certified_snapshot_id, certification_artifact_id, reopened_at, reopened_by, reopen_reason, statements_stale_since, created_at, updated_at';

function rowToSession(row: CloseSessionRow): CloseSession {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    periodStart: toISODateString(row.period_start),
    periodEnd: toISODateString(row.period_end),
    basis: row.basis as CloseSession['basis'],
    standard: row.standard,
    status: row.status as CloseSessionStatus,
    certifiedBy: row.certified_by ?? undefined,
    certifiedAt:
      row.certified_at != null
        ? (typeof row.certified_at === 'string' ? row.certified_at : (row.certified_at as Date).toISOString())
        : undefined,
    certificationMemo: row.certification_memo ?? undefined,
    certifiedSnapshotId: row.certified_snapshot_id ?? undefined,
    certificationArtifactId: row.certification_artifact_id ?? undefined,
    reopenedAt:
      row.reopened_at != null
        ? (typeof row.reopened_at === 'string' ? row.reopened_at : (row.reopened_at as Date).toISOString())
        : undefined,
    reopenedBy: row.reopened_by ?? undefined,
    reopenReason: row.reopen_reason ?? undefined,
    statementsStaleSince:
      row.statements_stale_since != null && String(row.statements_stale_since).length > 0
        ? (typeof row.statements_stale_since === 'string'
            ? row.statements_stale_since
            : (row.statements_stale_since as Date).toISOString())
        : undefined,
    createdAt: toISOTimestampString(row.created_at),
    updatedAt: toISOTimestampString(row.updated_at),
  };
}

/** Check if any session exists for tenant+entity with overlapping [periodStart, periodEnd]. */
export async function hasOverlappingSession(
  pool: Pool,
  tenantId: string,
  entityId: string,
  periodStart: string,
  periodEnd: string,
  excludeId?: string
): Promise<boolean> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM close_sessions
     WHERE tenant_id = $1 AND entity_id = $2
       AND period_start <= $4 AND period_end >= $3
       AND ($5::text IS NULL OR id != $5)`,
    [tenantId, entityId, periodStart, periodEnd, excludeId ?? null]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Return the first overlapping session for tenant+entity+period, or null. */
export async function getOverlappingSession(
  pool: Pool,
  tenantId: string,
  entityId: string,
  periodStart: string,
  periodEnd: string
): Promise<CloseSession | null> {
  const r = await pool.query<CloseSessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM close_sessions
     WHERE tenant_id = $1 AND entity_id = $2
       AND period_start <= $4 AND period_end >= $3
     LIMIT 1`,
    [tenantId, entityId, periodStart, periodEnd]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToSession(row);
}

export async function insertCloseSession(
  pool: Pool,
  id: string,
  tenantId: string,
  entityId: string,
  periodStart: string,
  periodEnd: string,
  basis: string,
  standard: string,
  status: string
): Promise<CloseSession> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO close_sessions (id, tenant_id, entity_id, period_start, period_end, basis, standard, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
    [id, tenantId, entityId, periodStart, periodEnd, basis, standard, status, now]
  );
  const r = await pool.query<CloseSessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM close_sessions WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return rowToSession(r.rows[0]);
}

export async function getCloseSessionById(
  client: Queryable,
  tenantId: string,
  id: string
): Promise<CloseSession | null> {
  const r = await client.query<CloseSessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM close_sessions WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToSession(row);
}

/** Lock session row for update (prevents concurrent certify race). Use inside transaction. */
export async function getCloseSessionByIdForUpdate(
  client: Queryable,
  tenantId: string,
  id: string
): Promise<CloseSession | null> {
  const r = await client.query<CloseSessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM close_sessions WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToSession(row);
}

export async function listCloseSessions(
  pool: Pool,
  tenantId: string,
  entityId?: string,
  status?: string
): Promise<CloseSession[]> {
  let sql = `SELECT ${SESSION_COLUMNS} FROM close_sessions WHERE tenant_id = $1`;
  const params: string[] = [tenantId];
  let i = 2;
  if (entityId) {
    sql += ` AND entity_id = $${i}`;
    params.push(entityId);
    i += 1;
  }
  if (status) {
    sql += ` AND status = $${i}`;
    params.push(status);
  }
  sql += ' ORDER BY period_start DESC, created_at DESC';
  const r = await pool.query<CloseSessionRow>(sql, params);
  return r.rows.map(rowToSession);
}

export async function updateCloseSessionStatus(
  client: Queryable,
  tenantId: string,
  id: string,
  status: string
): Promise<CloseSession | null> {
  const now = new Date().toISOString();
  const r = await client.query(
    'UPDATE close_sessions SET status = $1, updated_at = $2 WHERE tenant_id = $3 AND id = $4',
    [status, now, tenantId, id]
  );
  if (r.rowCount === 0) return null;
  return getCloseSessionById(client, tenantId, id);
}

export async function updateCertification(
  client: Queryable,
  tenantId: string,
  id: string,
  certifiedBy: string,
  certifiedAt: string,
  certificationMemo?: string,
  certifiedSnapshotId?: string,
  certificationArtifactId?: string | null
): Promise<CloseSession | null> {
  const now = new Date().toISOString();
  const r = await client.query(
    `UPDATE close_sessions
     SET status = 'certified', certified_by = $1, certified_at = $2, certification_memo = $3,
         certified_snapshot_id = COALESCE($4, certified_snapshot_id),
         certification_artifact_id = COALESCE($5, certification_artifact_id),
         updated_at = $6
     WHERE tenant_id = $7 AND id = $8`,
    [certifiedBy, certifiedAt, certificationMemo ?? null, certifiedSnapshotId ?? null, certificationArtifactId ?? null, now, tenantId, id]
  );
  if (r.rowCount === 0) return null;
  return getCloseSessionById(client, tenantId, id);
}

/** Set statements_stale_since when TB changes (cascade invalidation). Clear when statements regenerated. */
export async function setStatementsStaleSince(
  pool: Queryable,
  tenantId: string,
  closeSessionId: string
): Promise<void> {
  const now = new Date().toISOString();
  await pool.query(
    `UPDATE close_sessions SET statements_stale_since = $1, updated_at = $1
     WHERE tenant_id = $2 AND id = $3`,
    [now, tenantId, closeSessionId]
  );
}

/** Clear statements_stale_since when statements are regenerated. */
export async function clearStatementsStaleSince(
  pool: Queryable,
  tenantId: string,
  closeSessionId: string
): Promise<void> {
  const now = new Date().toISOString();
  await pool.query(
    `UPDATE close_sessions SET statements_stale_since = NULL, updated_at = $1
     WHERE tenant_id = $2 AND id = $3`,
    [now, tenantId, closeSessionId]
  );
}

/** Reopen: set status to in_progress, record reopened_at/by/reason. Certification fields preserved for audit. */
export async function updateReopen(
  client: Queryable,
  tenantId: string,
  id: string,
  reopenedBy: string,
  reopenReason: string
): Promise<CloseSession | null> {
  const now = new Date().toISOString();
  const r = await client.query(
    `UPDATE close_sessions
     SET status = 'in_progress', reopened_at = $1, reopened_by = $2, reopen_reason = $3, updated_at = $4
     WHERE tenant_id = $5 AND id = $6`,
    [now, reopenedBy, reopenReason, now, tenantId, id]
  );
  if (r.rowCount === 0) return null;
  return getCloseSessionById(client, tenantId, id);
}
