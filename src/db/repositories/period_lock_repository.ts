/**
 * Period locks — DB repository (tenant-scoped). Uses tenant pool.
 */

import type { Pool } from 'pg';
import type { PeriodLock } from '../../types/close_and_controls.js';

export async function lockPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  lockedBy: string,
  reason?: string
): Promise<PeriodLock> {
  const lockedAt = new Date().toISOString();
  await pool.query(
    `INSERT INTO period_locks (tenant_id, period_label, locked_at, locked_by, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, period_label) DO UPDATE SET locked_at = $3, locked_by = $4, reason = $5`,
    [tenantId, periodLabel, lockedAt, lockedBy, reason ?? null]
  );
  return { periodLabel, lockedAt, lockedBy, reason };
}

export async function getPeriodLock(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<PeriodLock | null> {
  const r = await pool.query<{ period_label: string; locked_at: string; locked_by: string; reason: string | null }>(
    'SELECT period_label, locked_at, locked_by, reason FROM period_locks WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    periodLabel: row.period_label,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    reason: row.reason ?? undefined,
  };
}

export async function listLockedPeriods(pool: Pool, tenantId: string): Promise<PeriodLock[]> {
  const r = await pool.query<{ period_label: string; locked_at: string; locked_by: string; reason: string | null }>(
    'SELECT period_label, locked_at, locked_by, reason FROM period_locks WHERE tenant_id = $1 ORDER BY period_label',
    [tenantId]
  );
  return r.rows.map((row) => ({
    periodLabel: row.period_label,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    reason: row.reason ?? undefined,
  }));
}

export async function isPeriodLocked(pool: Pool, tenantId: string, periodLabel: string): Promise<boolean> {
  const lock = await getPeriodLock(pool, tenantId, periodLabel);
  return lock !== null;
}
