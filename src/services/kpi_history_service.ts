/**
 * KPI history: store KPI snapshots by period/date for trend — FW2 Feature & Workflow Gaps.
 * When pool and tenantId are provided, uses tenant DB; in production no in-memory fallback.
 */

import type { Pool } from 'pg';
import { disallowMemoryStoreInProduction } from '../lib/env.js';
import type { CFOKPIs } from '../types/cfo-dashboard.js';
import * as kpiHistoryRepo from '../db/repositories/kpi_history_repository.js';
import type { KPISnapshot } from '../types/kpi_history.js';

export type { KPISnapshot } from '../types/kpi_history.js';

const store = new Map<string, KPISnapshot>();

function nextId(): string {
  return `kpi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function appendKPISnapshot(
  params: {
    periodLabel: string;
    kpis: CFOKPIs;
    asAt?: string;
  },
  pool?: Pool | null,
  tenantId?: string
): Promise<KPISnapshot> {
  const now = new Date().toISOString();
  const asAt = params.asAt ?? now;
  const id = nextId();
  if (pool && tenantId) {
    return kpiHistoryRepo.append(pool, tenantId, {
      id,
      periodLabel: params.periodLabel,
      asAt,
      kpis: params.kpis,
    }) as Promise<KPISnapshot>;
  }
  const snap: KPISnapshot = {
    id,
    periodLabel: params.periodLabel,
    asAt,
    kpis: params.kpis,
    createdAt: now,
  };
  store.set(id, snap);
  return snap;
}

export async function listKPIHistory(
  params?: {
    periodLabel?: string;
    from?: string;
    to?: string;
    limit?: number;
  },
  pool?: Pool | null,
  tenantId?: string
): Promise<KPISnapshot[]> {
  if (pool && tenantId) {
    return kpiHistoryRepo.list(pool, tenantId, params);
  }
  disallowMemoryStoreInProduction({ storeName: 'KPI history', hasDurableContext: false });
  let list = Array.from(store.values());
  if (params?.periodLabel) list = list.filter((s) => s.periodLabel === params.periodLabel);
  if (params?.from) list = list.filter((s) => s.asAt >= params.from!);
  if (params?.to) list = list.filter((s) => s.asAt <= params.to!);
  list.sort((a, b) => b.asAt.localeCompare(a.asAt));
  const limit = params?.limit ?? 50;
  return list.slice(0, limit);
}
