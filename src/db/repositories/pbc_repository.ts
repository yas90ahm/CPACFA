/**
 * PBC (Provided by Client) items per tenant — DB when pool/tenantId present.
 */

import type { Pool } from 'pg';
import type { PBCItem } from '../../types/pbc.js';

function rowToItem(row: {
  id: string;
  tenant_id: string;
  label: string;
  description: string | null;
  status: string;
  requested_at: string | null;
  provided_at: string | null;
  document_id: string | null;
  period_label: string | null;
  created_at: string;
  updated_at: string;
}): PBCItem {
  return {
    id: row.id,
    label: row.label,
    description: row.description ?? undefined,
    status: row.status as PBCItem['status'],
    requestedAt: row.requested_at ?? undefined,
    providedAt: row.provided_at ?? undefined,
    documentId: row.document_id ?? undefined,
    periodLabel: row.period_label ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function create(
  pool: Pool,
  tenantId: string,
  item: Omit<PBCItem, 'id' | 'createdAt' | 'updatedAt'>
): Promise<PBCItem> {
  const id = `pbc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO pbc_items (id, tenant_id, label, description, status, requested_at, provided_at, document_id, period_label, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      tenantId,
      item.label,
      item.description ?? null,
      item.status ?? 'pending',
      item.requestedAt ?? null,
      item.providedAt ?? null,
      item.documentId ?? null,
      item.periodLabel ?? null,
      now,
      now,
    ]
  );
  return { ...item, id, createdAt: now, updatedAt: now };
}

export async function list(
  pool: Pool,
  tenantId: string,
  filters?: { status?: PBCItem['status']; periodLabel?: string }
): Promise<PBCItem[]> {
  let sql = 'SELECT id, tenant_id, label, description, status, requested_at, provided_at, document_id, period_label, created_at, updated_at FROM pbc_items WHERE tenant_id = $1';
  const params: unknown[] = [tenantId];
  if (filters?.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }
  if (filters?.periodLabel) {
    params.push(filters.periodLabel);
    sql += ` AND period_label = $${params.length}`;
  }
  sql += ' ORDER BY updated_at DESC, created_at DESC';
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    label: string;
    description: string | null;
    status: string;
    requested_at: string | null;
    provided_at: string | null;
    document_id: string | null;
    period_label: string | null;
    created_at: string;
    updated_at: string;
  }>(sql, params);
  return r.rows.map(rowToItem);
}

export async function get(pool: Pool, id: string, tenantId: string): Promise<PBCItem | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    label: string;
    description: string | null;
    status: string;
    requested_at: string | null;
    provided_at: string | null;
    document_id: string | null;
    period_label: string | null;
    created_at: string;
    updated_at: string;
  }>(
    'SELECT id, tenant_id, label, description, status, requested_at, provided_at, document_id, period_label, created_at, updated_at FROM pbc_items WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  const row = r.rows[0];
  return row ? rowToItem(row) : null;
}

export async function update(
  pool: Pool,
  id: string,
  tenantId: string,
  patch: { status?: PBCItem['status']; providedAt?: string; documentId?: string }
): Promise<PBCItem | null> {
  const now = new Date().toISOString();
  await pool.query(
    `UPDATE pbc_items SET status = COALESCE($3, status), provided_at = COALESCE($4, provided_at), document_id = COALESCE($5, document_id), updated_at = $6 WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, patch.status ?? null, patch.providedAt ?? null, patch.documentId ?? null, now]
  );
  return get(pool, id, tenantId);
}
