/**
 * Tenant close calendar config: close_due_offset_days, reminder_days.
 */

import type { Pool } from 'pg';

export interface CloseCalendarConfigRow {
  tenantId: string;
  closeDueOffsetDays: number;
  reminderDays?: number;
  updatedAt: string;
}

export async function getConfig(
  pool: Pool,
  tenantId: string
): Promise<CloseCalendarConfigRow | null> {
  const r = await pool.query<{
    tenant_id: string;
    close_due_offset_days: number;
    reminder_days: number | null;
    updated_at: string;
  }>(
    'SELECT tenant_id, close_due_offset_days, reminder_days, updated_at FROM tenant_close_calendar_config WHERE tenant_id = $1',
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    closeDueOffsetDays: row.close_due_offset_days,
    reminderDays: row.reminder_days ?? undefined,
    updatedAt: row.updated_at,
  };
}

export async function upsertConfig(
  pool: Pool,
  tenantId: string,
  input: { closeDueOffsetDays?: number; reminderDays?: number }
): Promise<CloseCalendarConfigRow> {
  const now = new Date().toISOString();
  const existing = await getConfig(pool, tenantId);
  const offset = input.closeDueOffsetDays ?? existing?.closeDueOffsetDays ?? 5;
  const reminder = input.reminderDays !== undefined ? input.reminderDays : (existing?.reminderDays ?? null);
  await pool.query(
    `INSERT INTO tenant_close_calendar_config (tenant_id, close_due_offset_days, reminder_days, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id)
     DO UPDATE SET close_due_offset_days = $2, reminder_days = $3, updated_at = $4`,
    [tenantId, offset, reminder, now]
  );
  const got = await getConfig(pool, tenantId);
  return got!;
}
