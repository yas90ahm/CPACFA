/**
 * Close calendar config per tenant: close_due_offset_days, reminder_days.
 * Used by close_calendar_service to compute close due date from period end.
 */

import type { Pool } from 'pg';
import { isDbConfigured } from '../db/index.js';
import * as configRepo from '../db/repositories/close_calendar_config_repository.js';

export interface CloseCalendarConfig {
  tenantId: string;
  closeDueOffsetDays: number;
  reminderDays?: number;
  updatedAt: string;
}

export async function getCloseCalendarConfig(
  tenantId: string,
  pool?: Pool
): Promise<CloseCalendarConfig | undefined> {
  if (!isDbConfigured() || !pool) return undefined;
  const c = await configRepo.getConfig(pool, tenantId);
  return c ?? undefined;
}

export async function setCloseCalendarConfig(
  tenantId: string,
  input: { closeDueOffsetDays?: number; reminderDays?: number },
  pool?: Pool
): Promise<CloseCalendarConfig | undefined> {
  if (!isDbConfigured() || !pool) return undefined;
  return configRepo.upsertConfig(pool, tenantId, input);
}

/**
 * Compute close due date from period label and offset days.
 * Supports YYYY-MM (e.g. 2025-01 -> end of Jan + offset -> e.g. 2025-02-05).
 */
export function computeCloseDueFromPeriod(periodLabel: string, offsetDays: number): string {
  const match = periodLabel.match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const lastDay = new Date(year, month, 0);
  const due = new Date(lastDay);
  due.setDate(due.getDate() + offsetDays);
  return due.toISOString().slice(0, 10);
}
