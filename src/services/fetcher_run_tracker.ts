/**
 * Fetcher run tracker + per-tenant quotas.
 */

interface TenantUsage {
  tenantId: string;
  windowStart: string;
  runs: number;
  documentsFetched: number;
}

const usage = new Map<string, TenantUsage>();

export function recordFetcherRun(tenantId: string, docsFetched: number): void {
  const record = getOrInit(tenantId);
  record.runs += 1;
  record.documentsFetched += docsFetched;
}

export function getUsage(tenantId: string): TenantUsage {
  return getOrInit(tenantId);
}

export function getQuota(tenantId: string): { limit: number; exceeded: boolean } {
  const limit = Number(process.env.FETCHER_RUNS_PER_DAY ?? 0);
  const record = getOrInit(tenantId);
  if (!Number.isFinite(limit) || limit <= 0) {
    return { limit: 0, exceeded: false };
  }
  return { limit, exceeded: record.runs >= limit };
}

function getOrInit(tenantId: string): TenantUsage {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const existing = usage.get(tenantId);
  if (!existing || existing.windowStart !== today) {
    const fresh: TenantUsage = { tenantId, windowStart: today, runs: 0, documentsFetched: 0 };
    usage.set(tenantId, fresh);
    return fresh;
  }
  return existing;
}
