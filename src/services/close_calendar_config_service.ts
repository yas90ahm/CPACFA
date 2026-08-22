/** Close calendar and recurring close-cycle configuration per tenant. */

import type { Pool } from 'pg';
import { isDbConfigured } from '../db/index.js';
import * as configRepo from '../db/repositories/close_calendar_config_repository.js';
import { CANADIAN_ASPE_PROFILE_ID, type CloseFrequency } from '../types/accounting_close_profile.js';
import { getEntitySettings } from './entity_settings_service.js';
import { CloseCycleScheduleError, validateCloseCycleSchedule } from './close_cycle_schedule.js';

export class CloseCalendarConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloseCalendarConfigError';
  }
}

export interface CloseCalendarConfig {
  tenantId: string;
  closeDueOffsetDays: number;
  reminderDays?: number;
  entityId?: string;
  connectionId?: string;
  profileId: string;
  frequency: CloseFrequency;
  autoStartEnabled: boolean;
  approvedErpWritebackEnabled: boolean;
  nextPeriodLabel?: string;
  startOffsetDays: number;
  startTimeLocal: string;
  timezone: string;
  lastDispatchedPeriod?: string;
  lastDispatchedAt?: string;
  updatedAt: string;
}

export interface SetCloseCalendarConfigInput {
  closeDueOffsetDays?: number;
  reminderDays?: number | null;
  entityId?: string | null;
  connectionId?: string | null;
  profileId?: string;
  frequency?: CloseFrequency;
  autoStartEnabled?: boolean;
  approvedErpWritebackEnabled?: boolean;
  nextPeriodLabel?: string | null;
  startOffsetDays?: number;
  startTimeLocal?: string;
  timezone?: string;
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
  input: SetCloseCalendarConfigInput,
  pool?: Pool
): Promise<CloseCalendarConfig | undefined> {
  if (!isDbConfigured() || !pool) return undefined;
  const nullableStringKeys = new Set<string>(['entityId', 'connectionId', 'nextPeriodLabel']);
  for (const key of ['entityId', 'connectionId', 'profileId', 'nextPeriodLabel', 'startTimeLocal', 'timezone'] as const) {
    const value = input[key];
    if (
      value !== undefined &&
      (typeof value !== 'string' && !(value === null && nullableStringKeys.has(key)))
    ) {
      throw new CloseCalendarConfigError(
        `${key} must be a string${nullableStringKeys.has(key) ? ' or null' : ''}`
      );
    }
  }
  if (input.autoStartEnabled !== undefined && typeof input.autoStartEnabled !== 'boolean') {
    throw new CloseCalendarConfigError('autoStartEnabled must be a boolean');
  }
  if (
    input.approvedErpWritebackEnabled !== undefined &&
    typeof input.approvedErpWritebackEnabled !== 'boolean'
  ) {
    throw new CloseCalendarConfigError('approvedErpWritebackEnabled must be a boolean');
  }
  const existing = await configRepo.getConfig(pool, tenantId);
  const merged = {
    closeDueOffsetDays: input.closeDueOffsetDays ?? existing?.closeDueOffsetDays ?? 5,
    reminderDays: input.reminderDays !== undefined ? input.reminderDays : existing?.reminderDays,
    entityId: input.entityId !== undefined ? input.entityId?.trim() || undefined : existing?.entityId,
    connectionId: input.connectionId !== undefined ? input.connectionId?.trim() || undefined : existing?.connectionId,
    profileId: input.profileId ?? existing?.profileId ?? CANADIAN_ASPE_PROFILE_ID,
    frequency: input.frequency ?? existing?.frequency ?? 'monthly',
    autoStartEnabled: input.autoStartEnabled ?? existing?.autoStartEnabled ?? false,
    approvedErpWritebackEnabled: input.approvedErpWritebackEnabled
      ?? existing?.approvedErpWritebackEnabled
      ?? false,
    nextPeriodLabel: input.nextPeriodLabel !== undefined
      ? input.nextPeriodLabel?.trim() || undefined
      : existing?.nextPeriodLabel,
    startOffsetDays: input.startOffsetDays ?? existing?.startOffsetDays ?? 1,
    startTimeLocal: input.startTimeLocal ?? existing?.startTimeLocal ?? '06:00',
    timezone: input.timezone ?? existing?.timezone ?? 'America/Toronto',
  };

  if (!Number.isInteger(merged.closeDueOffsetDays) || merged.closeDueOffsetDays < 0 || merged.closeDueOffsetDays > 31) {
    throw new CloseCalendarConfigError('closeDueOffsetDays must be an integer from 0 to 31');
  }
  if (merged.reminderDays != null && (!Number.isInteger(merged.reminderDays) || merged.reminderDays < 0)) {
    throw new CloseCalendarConfigError('reminderDays must be a non-negative integer');
  }
  if (merged.profileId !== CANADIAN_ASPE_PROFILE_ID) {
    throw new CloseCalendarConfigError(`Unsupported accounting close profile: ${merged.profileId}`);
  }
  if (merged.frequency !== 'monthly' && merged.frequency !== 'quarterly') {
    throw new CloseCalendarConfigError('frequency must be monthly or quarterly');
  }
  if (merged.autoStartEnabled && (!merged.entityId || !merged.connectionId || !merged.nextPeriodLabel)) {
    throw new CloseCalendarConfigError(
      'entityId, connectionId, and nextPeriodLabel are required when autoStartEnabled is true'
    );
  }
  if (merged.approvedErpWritebackEnabled && (!merged.entityId || !merged.connectionId)) {
    throw new CloseCalendarConfigError(
      'entityId and connectionId are required when approvedErpWritebackEnabled is true'
    );
  }
  if (merged.nextPeriodLabel) {
    try {
      validateCloseCycleSchedule({
        frequency: merged.frequency,
        nextPeriodLabel: merged.nextPeriodLabel,
        startOffsetDays: merged.startOffsetDays,
        startTimeLocal: merged.startTimeLocal,
        timezone: merged.timezone,
      });
    } catch (error) {
      if (error instanceof CloseCycleScheduleError) {
        throw new CloseCalendarConfigError(error.message);
      }
      throw error;
    }
  }

  if ((merged.autoStartEnabled || merged.approvedErpWritebackEnabled) && merged.entityId) {
    const settings = await getEntitySettings(pool, tenantId, merged.entityId);
    if (settings.functionalCurrency.toUpperCase() !== 'CAD') {
      throw new CloseCalendarConfigError(
        `Canadian ASPE close automation requires entity ${merged.entityId} to have CAD functional currency`
      );
    }
    const connection = await pool.query<{ id: string }>(
      'SELECT id FROM accounting_connections WHERE tenant_id = $1 AND id = $2',
      [tenantId, merged.connectionId]
    );
    if (!connection.rows[0]) {
      throw new CloseCalendarConfigError(
        `Accounting connection ${merged.connectionId} was not found for this tenant`
      );
    }
  }

  return configRepo.upsertConfig(pool, tenantId, {
    ...input,
    entityId: merged.entityId ?? null,
    connectionId: merged.connectionId ?? null,
    nextPeriodLabel: merged.nextPeriodLabel ?? null,
    profileId: merged.profileId,
    frequency: merged.frequency,
    autoStartEnabled: merged.autoStartEnabled,
    approvedErpWritebackEnabled: merged.approvedErpWritebackEnabled,
    startOffsetDays: merged.startOffsetDays,
    startTimeLocal: merged.startTimeLocal,
    timezone: merged.timezone,
  });
}

export async function markCloseCycleDispatched(
  tenantId: string,
  expectedPeriodLabel: string,
  nextPeriodLabel: string,
  dispatchedAt: string,
  pool: Pool
): Promise<boolean> {
  return configRepo.markPeriodDispatched(
    pool,
    tenantId,
    expectedPeriodLabel,
    nextPeriodLabel,
    dispatchedAt
  );
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
