/**
 * Close calendar: list periods, close due date per period, period status (open / in_progress / locked).
 * FW1 — Feature & Workflow Gaps. Persists close due dates to DB when tenantId and pool are provided.
 */

import type { Pool } from 'pg';
import {
  isPeriodLocked,
  getPeriodLock,
  listLockedPeriods,
} from './period_lock_service.js';
import type { CloseCalendarEntry, PeriodCloseStatus } from '../types/close_and_controls.js';
import { isDbConfigured } from '../db/index.js';
import * as calendarRepo from '../db/repositories/close_calendar_entry_repository.js';
import { listPeriodLabelsWithTB } from './trial_balance_store_service.js';

const calendarStore = new Map<string, { closeDueDate: string }>();

/**
 * Set or update close due date for a period.
 * When tenantId and pool are provided and DB is configured, persists to tenant_close_calendar_entry.
 */
export async function setCloseDueDate(
  periodLabel: string,
  closeDueDate: string,
  tenantId?: string,
  pool?: Pool
): Promise<void> {
  if (isDbConfigured() && tenantId && pool) {
    await calendarRepo.setEntry(pool, tenantId, periodLabel, closeDueDate);
  }
  calendarStore.set(periodLabel, { closeDueDate });
}

/**
 * Get close due date for a period, if set.
 * When tenantId and pool are provided and DB is configured, reads from tenant_close_calendar_entry first.
 */
export async function getCloseDueDate(
  periodLabel: string,
  tenantId?: string,
  pool?: Pool
): Promise<string | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const row = await calendarRepo.getEntry(pool, tenantId, periodLabel);
    if (row) return row.closeDueDate;
  }
  return calendarStore.get(periodLabel)?.closeDueDate;
}

/**
 * Get period status: locked if period lock exists, else in_progress if due date passed, else open.
 * When DB is configured, pass tenantId and pool for tenant-scoped locks.
 */
export async function getPeriodCloseStatus(
  periodLabel: string,
  tenantId?: string,
  pool?: Pool
): Promise<PeriodCloseStatus> {
  if (await isPeriodLocked(periodLabel, tenantId, pool)) return 'locked';
  const due = await getCloseDueDate(periodLabel, tenantId, pool);
  if (due && new Date(due) < new Date()) return 'in_progress';
  return 'open';
}

/**
 * Get a single period entry (status, due date, lock info). When DB, pass tenantId and pool.
 */
export async function getPeriodEntry(
  periodLabel: string,
  tenantId?: string,
  pool?: Pool
): Promise<CloseCalendarEntry> {
  const lock = await getPeriodLock(periodLabel, tenantId, pool);
  const due = await getCloseDueDate(periodLabel, tenantId, pool);
  const status = await getPeriodCloseStatus(periodLabel, tenantId, pool);
  return {
    periodLabel,
    closeDueDate: due ?? '',
    status,
    lockedAt: lock?.lockedAt,
    lockedBy: lock?.lockedBy,
  };
}

/**
 * List all periods with status. Optionally from a list of period labels, or derive from locks + calendar.
 * When DB, pass tenantId and pool for tenant-scoped locks. Close due date from DB or in-memory store.
 */
export async function listPeriods(
  periodLabels?: string[],
  tenantId?: string,
  pool?: Pool
): Promise<CloseCalendarEntry[]> {
  const periods = new Set<string>(periodLabels ?? []);
  const locksList = await listLockedPeriods(tenantId, pool);
  locksList.forEach((l) => periods.add(l.periodLabel));
  calendarStore.forEach((_, k) => periods.add(k));
  if (isDbConfigured() && tenantId && pool) {
    const dbEntries = await calendarRepo.listEntriesByTenant(pool, tenantId);
    dbEntries.forEach((e) => periods.add(e.periodLabel));
  }
  const tbTenantId = tenantId ?? 'default';
  const tbPeriods = await listPeriodLabelsWithTB(tbTenantId, pool);
  tbPeriods.forEach((p) => periods.add(p));
  const sorted = Array.from(periods).sort();
  return Promise.all(sorted.map((p) => getPeriodEntry(p, tenantId, pool)));
}
