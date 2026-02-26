/**
 * STATUS: UNWIRED — This service compiles but is not imported by any active route.
 * It exists as potential future functionality.
 * Last verified: 2026-02-25
 * To activate: Create a route file that imports this service and register it in server.ts
 */

/**
 * Filing calendar: tax and statutory filing/payment deadlines.
 * When pool and tenantId are provided, uses tenant DB; otherwise in-memory (dev fallback).
 */

import type { Pool } from 'pg';
import type { FilingCalendarItem } from '../types/tax_statutory.js';
import {
  createFilingCalendarItem as createRepo,
  listFilingCalendarItems as listRepo,
  updateFilingCalendarStatus as updateStatusRepo,
} from '../db/repositories/filing_calendar_repository.js';

const store = new Map<string, FilingCalendarItem>();

export async function addFilingCalendarItem(
  item: Omit<FilingCalendarItem, 'id'>,
  pool?: Pool | null,
  tenantId?: string
): Promise<FilingCalendarItem> {
  if (pool && tenantId) return createRepo(pool, tenantId, item);
  const id = `filing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const full: FilingCalendarItem = { ...item, id };
  store.set(id, full);
  return full;
}

export async function listFilingCalendarItems(
  params?: {
    entityId?: string;
    type?: FilingCalendarItem['type'];
    fromDate?: string;
    toDate?: string;
  },
  pool?: Pool | null,
  tenantId?: string
): Promise<FilingCalendarItem[]> {
  if (pool && tenantId) return listRepo(pool, tenantId, params);
  let list = Array.from(store.values());
  if (params?.entityId) list = list.filter((i) => i.entityId === params.entityId);
  if (params?.type) list = list.filter((i) => i.type === params.type);
  if (params?.fromDate) list = list.filter((i) => i.dueDate >= params.fromDate!);
  if (params?.toDate) list = list.filter((i) => i.dueDate <= params.toDate!);
  return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function updateFilingStatus(
  id: string,
  status: FilingCalendarItem['status'],
  pool?: Pool | null,
  tenantId?: string
): Promise<FilingCalendarItem | undefined> {
  if (pool && tenantId) {
    const item = await updateStatusRepo(pool, id, tenantId, status);
    return item ?? undefined;
  }
  const item = store.get(id);
  if (!item) return undefined;
  item.status = status;
  return item;
}

/** FW3: Upcoming filings with reminder flag (within reminderDays of due) */
export interface FilingWithReminder extends FilingCalendarItem {
  reminderDue?: boolean;
  daysUntilDue?: number;
}

export async function getUpcomingWithReminders(
  params?: {
    entityId?: string;
    fromDate?: string;
    toDate?: string;
    reminderDays?: number;
  },
  pool?: Pool | null,
  tenantId?: string
): Promise<FilingWithReminder[]> {
  const list = await listFilingCalendarItems(
    { entityId: params?.entityId, fromDate: params?.fromDate, toDate: params?.toDate },
    pool,
    tenantId
  );
  const now = new Date();
  const reminderDays = params?.reminderDays ?? 30;
  return list.map((item) => {
    const due = new Date(item.dueDate);
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const reminderDue =
      item.reminderDays != null
        ? daysUntilDue >= 0 && daysUntilDue <= item.reminderDays
        : daysUntilDue >= 0 && daysUntilDue <= reminderDays;
    return { ...item, reminderDue, daysUntilDue };
  });
}
