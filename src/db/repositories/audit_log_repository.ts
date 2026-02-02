/**
 * Audit log — tenant-scoped persistence. Uses tenant pool.
 */

import type { Pool } from 'pg';
import type { AuditLogEntry } from '../../types/close_and_controls.js';

function nextId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function insertAuditLog(
  pool: Pool,
  tenantId: string,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<AuditLogEntry> {
  const id = nextId();
  const timestamp = new Date().toISOString();
  await pool.query(
    `INSERT INTO audit_log (id, tenant_id, timestamp, actor, action, resource, detail, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      tenantId,
      timestamp,
      entry.actor,
      entry.action,
      entry.resource ?? null,
      entry.detail ?? null,
      entry.payload ? JSON.stringify(entry.payload) : null,
    ]
  );
  return { ...entry, id, timestamp };
}

export async function queryAuditLogDb(
  pool: Pool,
  tenantId: string,
  filters: { actor?: string; action?: string; resource?: string; since?: string; limit?: number }
): Promise<AuditLogEntry[]> {
  const limit = Math.min(filters.limit ?? 100, 500);
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let i = 2;
  if (filters.actor) {
    conditions.push(`actor = $${i}`);
    params.push(filters.actor);
    i++;
  }
  if (filters.action) {
    conditions.push(`action = $${i}`);
    params.push(filters.action);
    i++;
  }
  if (filters.resource) {
    conditions.push(`resource = $${i}`);
    params.push(filters.resource);
    i++;
  }
  if (filters.since) {
    conditions.push(`timestamp >= $${i}`);
    params.push(filters.since);
    i++;
  }
  params.push(limit);
  const limitIdx = params.length;
  const r = await pool.query<{
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    resource: string | null;
    detail: string | null;
    payload: unknown;
  }>(
    `SELECT id, timestamp, actor, action, resource, detail, payload
     FROM audit_log WHERE ${conditions.join(' AND ')}
     ORDER BY timestamp DESC LIMIT $${limitIdx}`,
    params
  );
  return r.rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    actor: row.actor,
    action: row.action,
    resource: row.resource ?? undefined,
    detail: row.detail ?? undefined,
    payload: (row.payload as Record<string, unknown>) ?? undefined,
  }));
}

/**
 * Delete audit log rows older than beforeTimestamp for a tenant. Returns number of rows deleted.
 */
export async function deleteAuditLogOlderThan(
  pool: Pool,
  tenantId: string,
  beforeTimestamp: string
): Promise<number> {
  const r = await pool.query(
    'DELETE FROM audit_log WHERE tenant_id = $1 AND timestamp < $2',
    [tenantId, beforeTimestamp]
  );
  return r.rowCount ?? 0;
}
