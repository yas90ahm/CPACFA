/**
 * Per-tenant, per-period close due date (tenant_close_calendar_entry).
 */

import type { Pool } from 'pg';

export interface CloseCalendarEntryRow {
  tenantId: string;
  periodLabel: string;
  closeDueDate: string;
  updatedAt: string;
}

export async function getEntry(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<CloseCalendarEntryRow | null> {
  const r = await pool.query<{
    tenant_id: string;
    period_label: string;
    close_due_date: string;
    updated_at: string;
  }>(
    'SELECT tenant_id, period_label, close_due_date, updated_at FROM tenant_close_calendar_entry WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  if (!row) return null;
  const closeDueDate =
    typeof row.close_due_date === 'string'
      ? row.close_due_date
      : (row.close_due_date as unknown as Date).toISOString().slice(0, 10);
  const updatedAt =
    typeof row.updated_at === 'string' ? row.updated_at : (row.updated_at as unknown as Date)?.toISOString?.() ?? String(row.updated_at);
  return { tenantId: row.tenant_id, periodLabel: row.period_label, closeDueDate, updatedAt };
}

export async function setEntry(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  closeDueDate: string
): Promise<CloseCalendarEntryRow> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tenant_close_calendar_entry (tenant_id, period_label, close_due_date, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, period_label)
     DO UPDATE SET close_due_date = $3, updated_at = $4`,
    [tenantId, periodLabel, closeDueDate, now]
  );
  const got = await getEntry(pool, tenantId, periodLabel);
  return got!;
}

export async function listEntriesByTenant(
  pool: Pool,
  tenantId: string
): Promise<CloseCalendarEntryRow[]> {
  const r = await pool.query<{
    tenant_id: string;
    period_label: string;
    close_due_date: string;
    updated_at: string;
  }>(
    'SELECT tenant_id, period_label, close_due_date, updated_at FROM tenant_close_calendar_entry WHERE tenant_id = $1 ORDER BY period_label',
    [tenantId]
  );
  return r.rows.map((row) => {
    const closeDueDate =
      typeof row.close_due_date === 'string'
        ? row.close_due_date
        : (row.close_due_date as unknown as Date).toISOString().slice(0, 10);
    const updatedAt =
      typeof row.updated_at === 'string' ? row.updated_at : (row.updated_at as unknown as Date)?.toISOString?.() ?? String(row.updated_at);
    return { tenantId: row.tenant_id, periodLabel: row.period_label, closeDueDate, updatedAt };
  });
}
