/**
 * Close adjustments — DB repository (tenant-scoped). Uses tenant pool.
 */

import type { Pool } from 'pg';
import type { CloseAdjustment } from '../../types/close_and_controls.js';

function nextId(): string {
  return `adj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createAdjustment(
  pool: Pool,
  tenantId: string,
  adj: Omit<CloseAdjustment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CloseAdjustment> {
  const id = nextId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO close_adjustments (id, tenant_id, period_label, source, description, debits, credits, source_detail, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      tenantId,
      adj.periodLabel,
      adj.source,
      adj.description,
      JSON.stringify(adj.debits ?? []),
      JSON.stringify(adj.credits ?? []),
      adj.sourceDetail ?? null,
      adj.status ?? 'pending',
      now,
      now,
    ]
  );
  return { ...adj, id, createdAt: now, updatedAt: now };
}

export async function getAdjustment(pool: Pool, id: string, tenantId: string): Promise<CloseAdjustment | null> {
  const r = await pool.query<{
    id: string;
    period_label: string;
    source: string;
    description: string;
    debits: unknown;
    credits: unknown;
    source_detail: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    approved_by: string | null;
    approved_at: string | null;
    posted_at: string | null;
    posted_external_id: string | null;
  }>('SELECT * FROM close_adjustments WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  const row = r.rows[0];
  if (!row) return null;
  return rowToAdjustment(row);
}

export async function listAdjustments(pool: Pool, tenantId: string, periodLabel?: string): Promise<CloseAdjustment[]> {
  const q = periodLabel
    ? 'SELECT * FROM close_adjustments WHERE tenant_id = $1 AND period_label = $2 ORDER BY created_at DESC'
    : 'SELECT * FROM close_adjustments WHERE tenant_id = $1 ORDER BY created_at DESC';
  const params = periodLabel ? [tenantId, periodLabel] : [tenantId];
  const r = await pool.query<{
    id: string;
    period_label: string;
    source: string;
    description: string;
    debits: unknown;
    credits: unknown;
    source_detail: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    approved_by: string | null;
    approved_at: string | null;
    posted_at: string | null;
    posted_external_id: string | null;
  }>(q, params);
  return r.rows.map(rowToAdjustment);
}

export async function updateAdjustmentStatus(
  pool: Pool,
  id: string,
  tenantId: string,
  status: CloseAdjustment['status'],
  patch?: { approvedBy?: string; approvedAt?: string; postedAt?: string; postedExternalId?: string }
): Promise<CloseAdjustment | null> {
  const now = new Date().toISOString();
  await pool.query(
    `UPDATE close_adjustments SET status = $3, updated_at = $4,
       approved_by = COALESCE($5, approved_by), approved_at = COALESCE($6, approved_at),
       posted_at = COALESCE($7, posted_at), posted_external_id = COALESCE($8, posted_external_id)
     WHERE id = $1 AND tenant_id = $2`,
    [
      id,
      tenantId,
      status,
      now,
      patch?.approvedBy ?? null,
      patch?.approvedAt ?? null,
      patch?.postedAt ?? null,
      patch?.postedExternalId ?? null,
    ]
  );
  return getAdjustment(pool, id, tenantId);
}

function rowToAdjustment(row: {
  id: string;
  period_label: string;
  source: string;
  description: string;
  debits: unknown;
  credits: unknown;
  source_detail: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  posted_at: string | null;
  posted_external_id?: string | null;
}): CloseAdjustment {
  return {
    id: row.id,
    periodLabel: row.period_label,
    source: row.source as CloseAdjustment['source'],
    description: row.description,
    debits: Array.isArray(row.debits) ? row.debits : [],
    credits: Array.isArray(row.credits) ? row.credits : [],
    sourceDetail: row.source_detail ?? undefined,
    status: row.status as CloseAdjustment['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    postedAt: row.posted_at ?? undefined,
    postedExternalId: row.posted_external_id ?? undefined,
  };
}
