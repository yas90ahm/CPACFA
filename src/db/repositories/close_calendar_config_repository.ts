/** Tenant close calendar and recurring cycle kickoff configuration. */

import type { Pool } from 'pg';
import type { CloseFrequency } from '../../types/accounting_close_profile.js';

export interface CloseCalendarConfigRow {
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

export interface UpsertCloseCalendarConfigInput {
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

interface ConfigDbRow {
  tenant_id: string;
  close_due_offset_days: number;
  reminder_days: number | null;
  entity_id: string | null;
  connection_id: string | null;
  profile_id: string;
  close_frequency: string;
  auto_start_enabled: boolean;
  approved_erp_writeback_enabled: boolean;
  next_period_label: string | null;
  start_offset_days: number;
  start_time_local: string;
  timezone: string;
  last_dispatched_period: string | null;
  last_dispatched_at: string | Date | null;
  updated_at: string | Date;
}

const CONFIG_COLUMNS = `tenant_id, close_due_offset_days, reminder_days, entity_id, connection_id,
  profile_id, close_frequency, auto_start_enabled, approved_erp_writeback_enabled, next_period_label,
  start_offset_days, start_time_local::text AS start_time_local, timezone,
  last_dispatched_period, last_dispatched_at, updated_at`;

function rowToConfig(row: ConfigDbRow): CloseCalendarConfigRow {
  return {
    tenantId: row.tenant_id,
    closeDueOffsetDays: row.close_due_offset_days,
    reminderDays: row.reminder_days ?? undefined,
    entityId: row.entity_id ?? undefined,
    connectionId: row.connection_id ?? undefined,
    profileId: row.profile_id,
    frequency: row.close_frequency as CloseFrequency,
    autoStartEnabled: row.auto_start_enabled,
    approvedErpWritebackEnabled: row.approved_erp_writeback_enabled,
    nextPeriodLabel: row.next_period_label ?? undefined,
    startOffsetDays: row.start_offset_days,
    startTimeLocal: row.start_time_local.slice(0, 5),
    timezone: row.timezone,
    lastDispatchedPeriod: row.last_dispatched_period ?? undefined,
    lastDispatchedAt: row.last_dispatched_at == null
      ? undefined
      : typeof row.last_dispatched_at === 'string'
        ? row.last_dispatched_at
        : row.last_dispatched_at.toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : row.updated_at.toISOString(),
  };
}

export async function getConfig(
  pool: Pool,
  tenantId: string
): Promise<CloseCalendarConfigRow | null> {
  const r = await pool.query<ConfigDbRow>(
    `SELECT ${CONFIG_COLUMNS}
     FROM tenant_close_calendar_config
     WHERE tenant_id = $1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToConfig(row);
}

export async function upsertConfig(
  pool: Pool,
  tenantId: string,
  input: UpsertCloseCalendarConfigInput
): Promise<CloseCalendarConfigRow> {
  const now = new Date().toISOString();
  const existing = await getConfig(pool, tenantId);
  const offset = input.closeDueOffsetDays ?? existing?.closeDueOffsetDays ?? 5;
  const reminder = input.reminderDays !== undefined ? input.reminderDays : (existing?.reminderDays ?? null);
  const entityId = input.entityId !== undefined ? input.entityId : (existing?.entityId ?? null);
  const connectionId = input.connectionId !== undefined ? input.connectionId : (existing?.connectionId ?? null);
  const profileId = input.profileId ?? existing?.profileId ?? 'ca-aspe-private-enterprise';
  const frequency = input.frequency ?? existing?.frequency ?? 'monthly';
  const autoStartEnabled = input.autoStartEnabled ?? existing?.autoStartEnabled ?? false;
  const approvedErpWritebackEnabled = input.approvedErpWritebackEnabled
    ?? existing?.approvedErpWritebackEnabled
    ?? false;
  const nextPeriodLabel = input.nextPeriodLabel !== undefined
    ? input.nextPeriodLabel
    : (existing?.nextPeriodLabel ?? null);
  const startOffsetDays = input.startOffsetDays ?? existing?.startOffsetDays ?? 1;
  const startTimeLocal = input.startTimeLocal ?? existing?.startTimeLocal ?? '06:00';
  const timezone = input.timezone ?? existing?.timezone ?? 'America/Toronto';
  await pool.query(
    `INSERT INTO tenant_close_calendar_config (
       tenant_id, close_due_offset_days, reminder_days, entity_id, connection_id, profile_id,
       close_frequency, auto_start_enabled, approved_erp_writeback_enabled, next_period_label,
       start_offset_days, start_time_local, timezone, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::time, $13, $14)
     ON CONFLICT (tenant_id)
     DO UPDATE SET
       close_due_offset_days = EXCLUDED.close_due_offset_days,
       reminder_days = EXCLUDED.reminder_days,
       entity_id = EXCLUDED.entity_id,
       connection_id = EXCLUDED.connection_id,
       profile_id = EXCLUDED.profile_id,
       close_frequency = EXCLUDED.close_frequency,
       auto_start_enabled = EXCLUDED.auto_start_enabled,
       approved_erp_writeback_enabled = EXCLUDED.approved_erp_writeback_enabled,
       next_period_label = EXCLUDED.next_period_label,
       start_offset_days = EXCLUDED.start_offset_days,
       start_time_local = EXCLUDED.start_time_local,
       timezone = EXCLUDED.timezone,
       updated_at = EXCLUDED.updated_at`,
    [
      tenantId,
      offset,
      reminder,
      entityId,
      connectionId,
      profileId,
      frequency,
      autoStartEnabled,
      approvedErpWritebackEnabled,
      nextPeriodLabel,
      startOffsetDays,
      startTimeLocal,
      timezone,
      now,
    ]
  );
  const got = await getConfig(pool, tenantId);
  return got!;
}

/**
 * Record a successful queue dispatch and move the recurring cursor forward.
 * The expected-period predicate makes concurrent schedulers safe.
 */
export async function markPeriodDispatched(
  pool: Pool,
  tenantId: string,
  expectedPeriodLabel: string,
  nextPeriodLabel: string,
  dispatchedAt: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE tenant_close_calendar_config
     SET next_period_label = $1,
         last_dispatched_period = $2,
         last_dispatched_at = $3,
         updated_at = $3
     WHERE tenant_id = $4
       AND auto_start_enabled = TRUE
       AND next_period_label = $2`,
    [nextPeriodLabel, expectedPeriodLabel, dispatchedAt, tenantId]
  );
  return (result.rowCount ?? 0) === 1;
}
