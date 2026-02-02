/**
 * Budget versioning: named versions, lock, variance references.
 * When pool and tenantId are provided, uses tenant DB; otherwise in-memory (dev fallback).
 */

import type { Pool } from 'pg';
import type { BudgetVersion, BudgetVersionLine, BudgetStatus } from '../types/budget_forecast.js';
import {
  createBudgetVersion as createRepo,
  getBudgetVersion as getRepo,
  listBudgetVersions as listRepo,
  updateBudgetVersion as updateRepo,
  lockBudgetVersion as lockRepo,
  setBudgetStatus as setStatusRepo,
} from '../db/repositories/budget_version_repository.js';

const store = new Map<string, BudgetVersion>();

function uuid(): string {
  return `bv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createBudgetVersion(
  params: { name: string; periodLabel: string; lines: BudgetVersionLine[] },
  pool?: Pool | null,
  tenantId?: string
): Promise<BudgetVersion> {
  if (pool && tenantId) return createRepo(pool, tenantId, params);
  const now = new Date().toISOString();
  const version: BudgetVersion = {
    id: uuid(),
    name: params.name,
    periodLabel: params.periodLabel,
    status: 'draft',
    lines: params.lines,
    createdAt: now,
    updatedAt: now,
  };
  store.set(version.id, version);
  return version;
}

export async function getBudgetVersion(
  id: string,
  pool?: Pool | null,
  tenantId?: string
): Promise<BudgetVersion | undefined> {
  if (pool && tenantId) {
    const v = await getRepo(pool, id, tenantId);
    return v ?? undefined;
  }
  return store.get(id);
}

export async function listBudgetVersions(
  periodLabel?: string,
  pool?: Pool | null,
  tenantId?: string
): Promise<BudgetVersion[]> {
  if (pool && tenantId) return listRepo(pool, tenantId, periodLabel);
  const list = Array.from(store.values());
  if (periodLabel) return list.filter((v) => v.periodLabel === periodLabel);
  return list;
}

export async function updateBudgetVersion(
  id: string,
  updates: { name?: string; lines?: BudgetVersionLine[] },
  pool?: Pool | null,
  tenantId?: string
): Promise<BudgetVersion | null> {
  if (pool && tenantId) return updateRepo(pool, id, tenantId, updates);
  const v = store.get(id);
  if (!v || v.status === 'locked') return null;
  if (updates.name != null) v.name = updates.name;
  if (updates.lines != null) v.lines = updates.lines;
  v.updatedAt = new Date().toISOString();
  return v;
}

export async function lockBudgetVersion(
  id: string,
  lockedBy: string,
  pool?: Pool | null,
  tenantId?: string
): Promise<BudgetVersion | null> {
  if (pool && tenantId) return lockRepo(pool, id, tenantId, lockedBy);
  const v = store.get(id);
  if (!v || v.status === 'locked') return null;
  v.status = 'locked';
  v.lockedAt = new Date().toISOString();
  v.lockedBy = lockedBy;
  v.updatedAt = v.lockedAt;
  return v;
}

export async function setBudgetStatus(
  id: string,
  status: BudgetStatus,
  pool?: Pool | null,
  tenantId?: string
): Promise<BudgetVersion | null> {
  if (pool && tenantId) return setStatusRepo(pool, id, tenantId, status);
  const v = store.get(id);
  if (!v) return null;
  if (status === 'locked' && !v.lockedAt) v.lockedAt = new Date().toISOString();
  v.status = status;
  v.updatedAt = new Date().toISOString();
  return v;
}
