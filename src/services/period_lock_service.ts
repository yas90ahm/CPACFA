/**
 * Period lock store: lock a period so no further edits.
 * Uses tenant pool when DATABASE_URL is set and pool is provided; in production no in-memory fallback.
 */

import type { Pool } from 'pg';
import type { PeriodLock } from '../types/close_and_controls.js';
import { isDbConfigured } from '../db/index.js';
import { disallowMemoryStoreInProduction } from '../lib/env.js';
import * as periodLockRepo from '../db/repositories/period_lock_repository.js';

const locks = new Map<string, PeriodLock>();

/**
 * Lock a period. Returns the lock record or overwrites existing.
 * When DB is configured and pool provided, tenantId is required for tenant-scoped locks.
 */
export async function lockPeriod(
  periodLabel: string,
  lockedBy: string,
  reason?: string,
  tenantId?: string,
  pool?: Pool
): Promise<PeriodLock> {
  if (isDbConfigured() && tenantId && pool) {
    return periodLockRepo.lockPeriod(pool, tenantId, periodLabel, lockedBy, reason);
  }
  disallowMemoryStoreInProduction({ storeName: 'period lock', hasDurableContext: false });
  const lock: PeriodLock = {
    periodLabel,
    lockedAt: new Date().toISOString(),
    lockedBy,
    reason,
  };
  locks.set(periodLabel, lock);
  return lock;
}

/**
 * Check if a period is locked. When DB and pool, pass tenantId for tenant-scoped check.
 */
export async function isPeriodLocked(periodLabel: string, tenantId?: string, pool?: Pool): Promise<boolean> {
  if (isDbConfigured() && tenantId && pool) {
    return periodLockRepo.isPeriodLocked(pool, tenantId, periodLabel);
  }
  return locks.has(periodLabel);
}

/**
 * Get lock record for a period, if any. When DB and pool, pass tenantId.
 */
export async function getPeriodLock(
  periodLabel: string,
  tenantId?: string,
  pool?: Pool
): Promise<PeriodLock | undefined> {
  if (isDbConfigured() && tenantId && pool) {
    const lock = await periodLockRepo.getPeriodLock(pool, tenantId, periodLabel);
    return lock ?? undefined;
  }
  disallowMemoryStoreInProduction({ storeName: 'period lock', hasDurableContext: false });
  return locks.get(periodLabel);
}

/**
 * List all locked periods. When DB and pool, pass tenantId.
 */
export async function listLockedPeriods(tenantId?: string, pool?: Pool): Promise<PeriodLock[]> {
  if (isDbConfigured() && tenantId && pool) {
    return periodLockRepo.listLockedPeriods(pool, tenantId);
  }
  disallowMemoryStoreInProduction({ storeName: 'period lock', hasDurableContext: false });
  return Array.from(locks.values());
}

/** Thrown when a mutation is attempted on a locked period. */
export class PeriodLockedError extends Error {
  constructor(
    public readonly periodLabel: string,
    message = `Period is locked: ${periodLabel}`
  ) {
    super(message);
    this.name = 'PeriodLockedError';
  }
}

/**
 * Assert period is not locked; throw PeriodLockedError if locked.
 * Call before TB ingest, close adjustments, JE post, statement generation by period.
 */
export async function assertPeriodNotLocked(
  periodLabel: string,
  tenantId?: string,
  pool?: Pool
): Promise<void> {
  const locked = await isPeriodLocked(periodLabel, tenantId, pool);
  if (locked) {
    throw new PeriodLockedError(periodLabel);
  }
}
