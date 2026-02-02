/**
 * Audit engagements — tenant-scoped engagements that group periods (e.g. FY24 audit).
 */

import type { Pool } from 'pg';

export interface AuditEngagementRow {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEngagementPeriodRow {
  engagementId: string;
  periodLabel: string;
  sortOrder: number;
}

function nextId(): string {
  return `eng-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createEngagement(
  pool: Pool,
  tenantId: string,
  name: string,
  status: string = 'draft'
): Promise<AuditEngagementRow> {
  const id = nextId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO audit_engagements (id, tenant_id, name, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tenantId, name, status, now, now]
  );
  return { id, tenantId, name, status, createdAt: now, updatedAt: now };
}

export async function getEngagement(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<AuditEngagementRow | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    name: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>('SELECT id, tenant_id, name, status, created_at, updated_at FROM audit_engagements WHERE id = $1 AND tenant_id = $2', [
    id,
    tenantId,
  ]);
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listEngagements(pool: Pool, tenantId: string): Promise<AuditEngagementRow[]> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    name: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>(
    'SELECT id, tenant_id, name, status, created_at, updated_at FROM audit_engagements WHERE tenant_id = $1 ORDER BY updated_at DESC',
    [tenantId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateEngagement(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: { name?: string; status?: string }
): Promise<AuditEngagementRow | null> {
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = $2'];
  const params: unknown[] = [id, now];
  let idx = 3;
  if (patch.name !== undefined) {
    updates.push(`name = $${idx++}`);
    params.push(patch.name);
  }
  if (patch.status !== undefined) {
    updates.push(`status = $${idx++}`);
    params.push(patch.status);
  }
  params.push(tenantId);
  await pool.query(
    `UPDATE audit_engagements SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx}`,
    params
  );
  return getEngagement(pool, tenantId, id);
}

export async function deleteEngagement(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM audit_engagements WHERE id = $1 AND tenant_id = $2 RETURNING id', [
    id,
    tenantId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

export async function addPeriodToEngagement(
  pool: Pool,
  engagementId: string,
  periodLabel: string,
  sortOrder: number = 0
): Promise<AuditEngagementPeriodRow> {
  await pool.query(
    `INSERT INTO audit_engagement_periods (engagement_id, period_label, sort_order)
     VALUES ($1, $2, $3)
     ON CONFLICT (engagement_id, period_label) DO UPDATE SET sort_order = $3`,
    [engagementId, periodLabel, sortOrder]
  );
  return { engagementId, periodLabel, sortOrder };
}

export async function removePeriodFromEngagement(
  pool: Pool,
  engagementId: string,
  periodLabel: string
): Promise<boolean> {
  const r = await pool.query(
    'DELETE FROM audit_engagement_periods WHERE engagement_id = $1 AND period_label = $2 RETURNING period_label',
    [engagementId, periodLabel]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function listPeriodsForEngagement(
  pool: Pool,
  engagementId: string
): Promise<AuditEngagementPeriodRow[]> {
  const r = await pool.query<{ engagement_id: string; period_label: string; sort_order: number }>(
    'SELECT engagement_id, period_label, sort_order FROM audit_engagement_periods WHERE engagement_id = $1 ORDER BY sort_order, period_label',
    [engagementId]
  );
  return r.rows.map((row) => ({
    engagementId: row.engagement_id,
    periodLabel: row.period_label,
    sortOrder: row.sort_order,
  }));
}
