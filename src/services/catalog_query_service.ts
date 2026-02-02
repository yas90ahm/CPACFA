/**
 * Run catalog query: resolve dataset by id (default or custom), call existing service, return tabular result.
 * In-memory cache per tenant with TTL and max size (evict oldest by expiresAt when at capacity).
 * Per-process; with multiple API instances cache is not shared.
 */

import type { Pool } from 'pg';
import type { CatalogQueryResult } from '../types/data_catalog.js';
import { getDataset } from './data_catalog_service.js';
import { getLastStatementGeneration } from './audit_export_service.js';
import { getBudgetVersion, listBudgetVersions } from './budget_version_service.js';
import { listCashFlowForecasts } from './cash_flow_forecast_service.js';
import { listExceptionsForTenant } from './data_quality_exception_service.js';

export interface CatalogQueryFilters {
  periodLabel?: string;
  entityId?: string;
  limit?: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_KEYS = 1000;
const cache = new Map<string, { result: CatalogQueryResult; expiresAt: number }>();

function cacheKey(tenantId: string, datasetId: string, filters?: CatalogQueryFilters): string {
  return JSON.stringify({ tenantId, datasetId, periodLabel: filters?.periodLabel, entityId: filters?.entityId, limit: filters?.limit });
}

function getCached(key: string): CatalogQueryResult | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry.result;
}

/** Evict the single entry with the smallest expiresAt (oldest) to make room. */
function evictOneOldest(): void {
  let oldestKey: string | null = null;
  let oldestExpires = Infinity;
  for (const [k, v] of cache.entries()) {
    if (v.expiresAt < oldestExpires) {
      oldestExpires = v.expiresAt;
      oldestKey = k;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

function setCached(key: string, result: CatalogQueryResult): void {
  if (cache.size >= MAX_CACHE_KEYS && !cache.has(key)) {
    evictOneOldest();
  }
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function runByType(
  tenantId: string,
  datasetId: string,
  type: string,
  filters?: CatalogQueryFilters,
  pool?: Pool | null
): Promise<CatalogQueryResult | null> {
  switch (type) {
    case 'balance_sheet': {
      const gen = await getLastStatementGeneration(tenantId, pool ?? undefined);
      const st = gen?.statements;
      if (!st?.balanceSheet) return null;
      const rows = [
        ...st.balanceSheet.assets.map((a) => ({ section: 'assets', label: a.label, amount: a.amount })),
        ...st.balanceSheet.liabilities.map((l) => ({ section: 'liabilities', label: l.label, amount: l.amount })),
        ...st.balanceSheet.equity.map((e) => ({ section: 'equity', label: e.label, amount: e.amount })),
      ];
      return { datasetId, columns: [{ name: 'section', type: 'string' }, { name: 'label', type: 'string' }, { name: 'amount', type: 'number' }], rows };
    }
    case 'profit_and_loss': {
      const gen = await getLastStatementGeneration(tenantId, pool ?? undefined);
      const st = gen?.statements;
      if (!st?.profitAndLoss) return null;
      const rows = [
        ...st.profitAndLoss.revenue.map((r) => ({ section: 'revenue', label: r.label, amount: r.amount })),
        ...st.profitAndLoss.expenses.map((e) => ({ section: 'expenses', label: e.label, amount: e.amount })),
        { section: 'summary', label: 'Net Income', amount: st.profitAndLoss.netIncome },
      ];
      return { datasetId, columns: [{ name: 'section', type: 'string' }, { name: 'label', type: 'string' }, { name: 'amount', type: 'number' }], rows };
    }
    case 'trial_balance': {
      const gen = await getLastStatementGeneration(tenantId, pool ?? undefined);
      const tb = gen?.statements?.trialBalance;
      if (!tb?.entries) return null;
      const rows = tb.entries.slice(0, filters?.limit ?? 100).map((e) => ({
        accountName: e.accountName,
        debit: e.debit ?? 0,
        credit: e.credit ?? 0,
      }));
      return { datasetId, columns: [{ name: 'accountName', type: 'string' }, { name: 'debit', type: 'number' }, { name: 'credit', type: 'number' }], rows };
    }
    case 'budget_version': {
      const periodLabel = filters?.periodLabel;
      const versions = await listBudgetVersions(periodLabel, pool ?? undefined, tenantId);
      const version = versions[0];
      if (!version) return { datasetId, columns: [{ name: 'label', type: 'string' }, { name: 'amount', type: 'number' }], rows: [] };
      const lines = version.lines ?? [];
      const rows = (filters?.limit ? lines.slice(0, filters.limit) : lines).map((l) => ({
        label: (l as { label?: string; accountName?: string }).label ?? (l as { accountName?: string }).accountName ?? '',
        amount: (l as { amount?: number }).amount ?? 0,
      }));
      return { datasetId, columns: [{ name: 'label', type: 'string' }, { name: 'amount', type: 'number' }], rows };
    }
    case 'cash_forecast': {
      const list = listCashFlowForecasts({ limit: filters?.limit ?? 50 });
      const rows = list.flatMap((f) =>
        (f.periods ?? []).map((p) => ({
          periodLabel: p.periodLabel ?? '',
          openingBalance: p.openingBalance ?? 0,
          receipts: p.receipts ?? 0,
          disbursements: p.disbursements ?? 0,
        }))
      );
      return { datasetId, columns: [{ name: 'periodLabel', type: 'string' }, { name: 'openingBalance', type: 'number' }, { name: 'receipts', type: 'number' }, { name: 'disbursements', type: 'number' }], rows };
    }
    case 'ar_aging':
    case 'ap_aging':
      return { datasetId, columns: [{ name: 'bucket', type: 'string' }, { name: 'amount', type: 'number' }, { name: 'count', type: 'number' }], rows: [] };
    case 'data_quality_exceptions': {
      if (!pool) return { datasetId, columns: [{ name: 'ruleId', type: 'string' }, { name: 'message', type: 'string' }, { name: 'severity', type: 'string' }, { name: 'periodLabel', type: 'string' }], rows: [] };
      const list = await listExceptionsForTenant(pool, tenantId, { periodLabel: filters?.periodLabel, limit: filters?.limit ?? 50 });
      const rows = list.map((e) => ({ ruleId: e.ruleId, message: e.message, severity: e.severity, periodLabel: e.periodLabel ?? '' }));
      return { datasetId, columns: [{ name: 'ruleId', type: 'string' }, { name: 'message', type: 'string' }, { name: 'severity', type: 'string' }, { name: 'periodLabel', type: 'string' }], rows };
    }
    default:
      return null;
  }
}

export async function runCatalogQuery(
  tenantId: string,
  datasetId: string,
  filters?: CatalogQueryFilters,
  pool?: Pool | null
): Promise<CatalogQueryResult | null> {
  const key = cacheKey(tenantId, datasetId, filters);
  const cached = getCached(key);
  if (cached) return cached;

  const entry = await getDataset(datasetId, pool ?? null, tenantId);
  if (!entry) return null;
  const type = entry.type;

  const result = await runByType(tenantId, datasetId, type, filters, pool);
  if (result) setCached(key, result);
  return result;
}
