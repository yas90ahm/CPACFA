/**
 * Filing calendar items — tenant-scoped (tenant DB).
 */

import type { Pool } from 'pg';
import type { FilingCalendarItem } from '../../types/tax_statutory.js';

function nextId(): string {
  return `filing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function createFilingCalendarItem(
  pool: Pool,
  tenantId: string,
  item: Omit<FilingCalendarItem, 'id'>
): Promise<FilingCalendarItem> {
  const id = nextId();
  await pool.query(
    `INSERT INTO filing_calendar_items (id, tenant_id, type, name, due_date, entity_id, jurisdiction, status, recurrence, reminder_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      tenantId,
      item.type,
      item.name,
      item.dueDate,
      item.entityId ?? null,
      item.jurisdiction ?? null,
      item.status ?? 'pending',
      item.recurrence ?? null,
      item.reminderDays ?? null,
    ]
  );
  return { ...item, id };
}

export async function listFilingCalendarItems(
  pool: Pool,
  tenantId: string,
  params?: { entityId?: string; type?: FilingCalendarItem['type']; fromDate?: string; toDate?: string }
): Promise<FilingCalendarItem[]> {
  let sql =
    'SELECT id, type, name, due_date, entity_id, jurisdiction, status, recurrence, reminder_days FROM filing_calendar_items WHERE tenant_id = $1';
  const args: unknown[] = [tenantId];
  let i = 2;
  if (params?.entityId) {
    sql += ` AND entity_id = $${i}`;
    args.push(params.entityId);
    i += 1;
  }
  if (params?.type) {
    sql += ` AND type = $${i}`;
    args.push(params.type);
    i += 1;
  }
  if (params?.fromDate) {
    sql += ` AND due_date >= $${i}`;
    args.push(params.fromDate);
    i += 1;
  }
  if (params?.toDate) {
    sql += ` AND due_date <= $${i}`;
    args.push(params.toDate);
    i += 1;
  }
  sql += ' ORDER BY due_date';
  const r = await pool.query<{
    id: string;
    type: string;
    name: string;
    due_date: string;
    entity_id: string | null;
    jurisdiction: string | null;
    status: string | null;
    recurrence: string | null;
    reminder_days: number | null;
  }>(sql, args);
  return r.rows.map((row) => ({
    id: row.id,
    type: row.type as FilingCalendarItem['type'],
    name: row.name,
    dueDate: row.due_date,
    entityId: row.entity_id ?? undefined,
    jurisdiction: row.jurisdiction ?? undefined,
    status: (row.status as FilingCalendarItem['status']) ?? undefined,
    recurrence: (row.recurrence as FilingCalendarItem['recurrence']) ?? undefined,
    reminderDays: row.reminder_days ?? undefined,
  }));
}

export async function updateFilingCalendarStatus(
  pool: Pool,
  id: string,
  tenantId: string,
  status: FilingCalendarItem['status']
): Promise<FilingCalendarItem | null> {
  await pool.query(
    'UPDATE filing_calendar_items SET status = $3 WHERE id = $1 AND tenant_id = $2',
    [id, tenantId, status]
  );
  const r = await pool.query<{
    id: string;
    type: string;
    name: string;
    due_date: string;
    entity_id: string | null;
    jurisdiction: string | null;
    status: string | null;
    recurrence: string | null;
    reminder_days: number | null;
  }>('SELECT id, type, name, due_date, entity_id, jurisdiction, status, recurrence, reminder_days FROM filing_calendar_items WHERE id = $1 AND tenant_id = $2', [
    id,
    tenantId,
  ]);
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    type: row.type as FilingCalendarItem['type'],
    name: row.name,
    dueDate: row.due_date,
    entityId: row.entity_id ?? undefined,
    jurisdiction: row.jurisdiction ?? undefined,
    status: (row.status as FilingCalendarItem['status']) ?? undefined,
    recurrence: (row.recurrence as FilingCalendarItem['recurrence']) ?? undefined,
    reminderDays: row.reminder_days ?? undefined,
  };
}
