/**
 * Period close record — DB repository (tenant-scoped).
 */

import type { Pool } from 'pg';
import type { PeriodCloseRecord, PeriodCloseStatusType } from '../../types/close_and_controls.js';

function rowToRecord(row: {
  tenant_id: string;
  period_label: string;
  status: string;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}): PeriodCloseRecord {
  return {
    tenantId: row.tenant_id,
    periodLabel: row.period_label,
    status: row.status as PeriodCloseStatusType,
    closedAt: row.closed_at ?? undefined,
    closedBy: row.closed_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getPeriodClose(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<PeriodCloseRecord | null> {
  const r = await pool.query<{
    tenant_id: string;
    period_label: string;
    status: string;
    closed_at: string | null;
    closed_by: string | null;
    reviewed_at: string | null;
    reviewed_by: string | null;
    created_at: string;
    updated_at: string;
  }>('SELECT tenant_id, period_label, status, closed_at, closed_by, reviewed_at, reviewed_by, created_at, updated_at FROM period_close WHERE tenant_id = $1 AND period_label = $2', [tenantId, periodLabel]);
  const row = r.rows[0];
  if (!row) return null;
  return rowToRecord(row);
}

export async function upsertPeriodClose(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  status: PeriodCloseStatusType,
  closedAt?: string | null,
  closedBy?: string | null,
  reviewedAt?: string | null,
  reviewedBy?: string | null
): Promise<PeriodCloseRecord> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO period_close (tenant_id, period_label, status, closed_at, closed_by, reviewed_at, reviewed_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     ON CONFLICT (tenant_id, period_label)
     DO UPDATE SET status = $3, closed_at = $4, closed_by = $5, reviewed_at = COALESCE($6, period_close.reviewed_at), reviewed_by = COALESCE($7, period_close.reviewed_by), updated_at = $8`,
    [tenantId, periodLabel, status, closedAt ?? null, closedBy ?? null, reviewedAt ?? null, reviewedBy ?? null, now]
  );
  const got = await getPeriodClose(pool, tenantId, periodLabel);
  return got!;
}

export async function setReviewerSignOff(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  reviewedBy: string
): Promise<PeriodCloseRecord | null> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE period_close SET reviewed_at = $1, reviewed_by = $2, updated_at = $1 WHERE tenant_id = $3 AND period_label = $4`,
    [now, reviewedBy, tenantId, periodLabel]
  );
  if (r.rowCount === 0) return null;
  const got = await getPeriodClose(pool, tenantId, periodLabel);
  return got;
}
