/**
 * Accounting connections — DB repository (tenant-scoped). Uses tenant pool.
 */

import type { Pool } from 'pg';
import type { AccountingConnection } from '../../types/accounting_integration.js';

export async function createConnection(
  pool: Pool,
  row: Omit<AccountingConnection, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AccountingConnection> {
  const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO accounting_connections (id, tenant_id, provider, name, credential_ref, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, row.tenantId, row.provider, row.name, row.credentialRef, now, now]
  );
  return {
    id,
    tenantId: row.tenantId,
    provider: row.provider,
    name: row.name,
    credentialRef: row.credentialRef,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getConnection(pool: Pool, id: string): Promise<AccountingConnection | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    provider: string;
    name: string;
    credential_ref: string;
    last_sync_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM accounting_connections WHERE id = $1', [id]);
  const row = r.rows[0];
  if (!row) return null;
  return rowToConnection(row);
}

export async function listConnections(pool: Pool, tenantId: string): Promise<AccountingConnection[]> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    provider: string;
    name: string;
    credential_ref: string;
    last_sync_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM accounting_connections WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return r.rows.map(rowToConnection);
}

export async function updateConnection(
  pool: Pool,
  id: string,
  patch: Partial<Pick<AccountingConnection, 'lastSyncAt' | 'lastSyncStatus' | 'lastSyncError'>>
): Promise<AccountingConnection | null> {
  const now = new Date().toISOString();
  await pool.query(
    `UPDATE accounting_connections SET
       last_sync_at = COALESCE($2, last_sync_at),
       last_sync_status = COALESCE($3, last_sync_status),
       last_sync_error = COALESCE($4, last_sync_error),
       updated_at = $5
     WHERE id = $1`,
    [
      id,
      patch.lastSyncAt ?? null,
      patch.lastSyncStatus ?? null,
      patch.lastSyncError ?? null,
      now,
    ]
  );
  return getConnection(pool, id);
}

function rowToConnection(row: {
  id: string;
  tenant_id: string;
  provider: string;
  name: string;
  credential_ref: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}): AccountingConnection {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider as AccountingConnection['provider'],
    name: row.name,
    credentialRef: row.credential_ref,
    lastSyncAt: row.last_sync_at ?? undefined,
    lastSyncStatus: (row.last_sync_status as AccountingConnection['lastSyncStatus']) ?? undefined,
    lastSyncError: row.last_sync_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
