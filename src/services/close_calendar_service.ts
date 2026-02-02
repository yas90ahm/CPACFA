/**
 * Close calendar: list periods, close due date per period, period status (open / in_progress / locked).
 * FW1 — Feature & Workflow Gaps.
 */

import type { Pool } from 'pg';
import {
  isPeriodLocked,
  getPeriodLock,
  listLockedPeriods,
} from './period_lock_service.js';
import type { CloseCalendarEntry, PeriodCloseStatus } from '../types/close_and_controls.js';

const calendarStore = new Map<string, { closeDueDate: string }>();

/**
 * Set or update close due date for a period.
 */
export function setCloseDueDate(periodLabel: string, closeDueDate: string): void {
  calendarStore.set(periodLabel, { closeDueDate });
}

/**
 * Get close due date for a period, if set.
 */
export function getCloseDueDate(periodLabel: string): string | undefined {
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
  const due = calendarStore.get(periodLabel)?.closeDueDate;
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
  const due = calendarStore.get(periodLabel)?.closeDueDate;
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
 * When DB, pass tenantId and pool for tenant-scoped locks. Close due date from store or tenant config.
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
  const sorted = Array.from(periods).sort();
  return Promise.all(sorted.map((p) => getPeriodEntry(p, tenantId, pool)));
}
