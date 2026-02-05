/**
 * Trial balance store: save/load unadjusted TB per tenant+period (upload or sync).
 * Uses period_trial_balance repo when DB and pool; otherwise in-memory.
 */

import type { Pool } from 'pg';
import type { TrialBalanceEntry } from '../types/financial.js';
import { isDbConfigured } from '../db/index.js';
import { disallowMemoryStoreInProduction } from '../lib/env.js';
import * as repo from '../db/repositories/period_trial_balance_repository.js';
import type { PeriodTrialBalanceSource } from '../db/repositories/period_trial_balance_repository.js';

const memory = new Map<string, { entries: TrialBalanceEntry[]; source: PeriodTrialBalanceSource; at: string; by?: string; connectionId?: string; fileName?: string }>();

function key(tenantId: string, periodLabel: string): string {
  return `${tenantId}:${periodLabel}`;
}

export interface UnadjustedMeta {
  source: PeriodTrialBalanceSource;
  at?: string;
  by?: string;
  connectionId?: string;
  fileName?: string;
}

export interface UnadjustedRecord {
  entries: TrialBalanceEntry[];
  source: PeriodTrialBalanceSource;
  at?: string;
  by?: string;
  connectionId?: string;
  fileName?: string;
}

export async function saveUnadjustedFromUpload(
  tenantId: string,
  periodLabel: string,
  entries: TrialBalanceEntry[],
  meta: { uploadedBy?: string; fileName?: string },
  pool?: Pool
): Promise<void> {
  const now = new Date().toISOString();
  if (isDbConfigured() && pool) {
    await repo.upsertUnadjusted(pool, tenantId, periodLabel, entries, {
      source: 'uploaded',
      uploadedBy: meta.uploadedBy,
      uploadedAt: now,
      fileName: meta.fileName,
    });
    return;
  }
  memory.set(key(tenantId, periodLabel), {
    entries,
    source: 'uploaded',
    at: now,
    by: meta.uploadedBy,
    fileName: meta.fileName,
  });
}

export async function saveUnadjustedFromSync(
  tenantId: string,
  periodLabel: string,
  entries: TrialBalanceEntry[],
  meta: { connectionId: string; syncedBy?: string },
  pool?: Pool
): Promise<void> {
  const now = new Date().toISOString();
  if (isDbConfigured() && pool) {
    await repo.upsertUnadjusted(pool, tenantId, periodLabel, entries, {
      source: 'synced',
      syncedBy: meta.syncedBy,
      syncedAt: now,
      connectionId: meta.connectionId,
    });
    return;
  }
  disallowMemoryStoreInProduction({ storeName: 'trial balance (sync)', hasDurableContext: false });
  memory.set(key(tenantId, periodLabel), {
    entries,
    source: 'synced',
    at: now,
    by: meta.syncedBy,
    connectionId: meta.connectionId,
  });
}

export async function getUnadjusted(
  tenantId: string,
  periodLabel: string,
  pool?: Pool
): Promise<UnadjustedRecord | null> {
  if (isDbConfigured() && pool) {
    const rec = await repo.getUnadjusted(pool, tenantId, periodLabel);
    if (!rec) return null;
    const at = rec.source === 'uploaded' ? rec.uploadedAt : rec.syncedAt;
    const by = rec.source === 'uploaded' ? rec.uploadedBy : rec.syncedBy;
    return {
      entries: rec.entries,
      source: rec.source,
      at,
      by,
      connectionId: rec.connectionId,
      fileName: rec.fileName,
    };
  }
  disallowMemoryStoreInProduction({ storeName: 'trial balance', hasDurableContext: false });
  const m = memory.get(key(tenantId, periodLabel));
  if (!m) return null;
  return {
    entries: m.entries,
    source: m.source,
    at: m.at,
    by: m.by,
    connectionId: m.connectionId,
    fileName: m.fileName,
  };
}

export async function getUnadjustedMeta(
  tenantId: string,
  periodLabel: string,
  pool?: Pool
): Promise<UnadjustedMeta | null> {
  if (isDbConfigured() && pool) {
    return repo.getUnadjustedMeta(pool, tenantId, periodLabel);
  }
  disallowMemoryStoreInProduction({ storeName: 'trial balance', hasDurableContext: false });
  const m = memory.get(key(tenantId, periodLabel));
  if (!m) return null;
  return { source: m.source, at: m.at, by: m.by, connectionId: m.connectionId };
}

/** List period labels that have unadjusted TB for a tenant (for close/overview listing). */
export async function listPeriodLabelsWithTB(
  tenantId: string,
  pool?: Pool
): Promise<string[]> {
  if (isDbConfigured() && pool) {
    return repo.listPeriodLabelsForTenant(pool, tenantId);
  }
  disallowMemoryStoreInProduction({ storeName: 'trial balance', hasDurableContext: false });
  const prefix = `${tenantId}:`;
  const labels: string[] = [];
  for (const k of memory.keys()) {
    if (k.startsWith(prefix)) labels.push(k.slice(prefix.length));
  }
  return labels.sort();
}
