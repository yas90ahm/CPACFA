/**
 * Data catalog: list datasets for tenant (default list + custom DB entries).
 */

import type { Pool } from 'pg';
import type { DataCatalogEntry, DataCatalogDatasetType } from '../types/data_catalog.js';
import * as repo from '../db/repositories/data_catalog_repository.js';

const DEFAULT_CATALOG: DataCatalogEntry[] = [
  { id: 'trial_balance', name: 'Trial Balance', type: 'trial_balance', schema: [{ name: 'accountName', type: 'string' }, { name: 'debit', type: 'number' }, { name: 'credit', type: 'number' }] },
  { id: 'balance_sheet', name: 'Balance Sheet', type: 'balance_sheet', schema: [{ name: 'label', type: 'string' }, { name: 'amount', type: 'number' }, { name: 'section', type: 'string' }] },
  { id: 'profit_and_loss', name: 'Profit and Loss', type: 'profit_and_loss', schema: [{ name: 'label', type: 'string' }, { name: 'amount', type: 'number' }, { name: 'section', type: 'string' }] },
  { id: 'budget_version', name: 'Budget Version', type: 'budget_version', schema: [{ name: 'accountCode', type: 'string' }, { name: 'accountName', type: 'string' }, { name: 'amount', type: 'number' }] },
  { id: 'cash_forecast', name: 'Cash Forecast', type: 'cash_forecast', schema: [{ name: 'periodLabel', type: 'string' }, { name: 'openingBalance', type: 'number' }, { name: 'receipts', type: 'number' }, { name: 'disbursements', type: 'number' }] },
  { id: 'ar_aging', name: 'AR Aging', type: 'ar_aging', schema: [{ name: 'bucket', type: 'string' }, { name: 'amount', type: 'number' }, { name: 'count', type: 'number' }] },
  { id: 'ap_aging', name: 'AP Aging', type: 'ap_aging', schema: [{ name: 'bucket', type: 'string' }, { name: 'amount', type: 'number' }, { name: 'count', type: 'number' }] },
  { id: 'data_quality_exceptions', name: 'Data Quality Exceptions', type: 'data_quality_exceptions', schema: [{ name: 'ruleId', type: 'string' }, { name: 'message', type: 'string' }, { name: 'severity', type: 'string' }, { name: 'periodLabel', type: 'string' }] },
];

export function listDefaultDatasets(): DataCatalogEntry[] {
  return DEFAULT_CATALOG.map((e) => ({ ...e }));
}

export async function listDatasetsForTenant(
  pool: Pool | null,
  tenantId: string
): Promise<DataCatalogEntry[]> {
  const defaultList = listDefaultDatasets();
  if (!pool || !tenantId) return defaultList;
  try {
    const custom = await repo.listCustom(pool, tenantId);
    return [...defaultList, ...custom];
  } catch {
    return defaultList;
  }
}

export async function getDataset(
  datasetId: string,
  pool: Pool | null,
  tenantId: string
): Promise<DataCatalogEntry | null> {
  if (pool && tenantId) {
    const custom = await repo.getById(pool, datasetId, tenantId);
    if (custom) return custom;
  }
  return listDefaultDatasets().find((e) => e.id === datasetId) ?? null;
}

export async function createCustomDataset(
  pool: Pool,
  tenantId: string,
  entry: { name: string; type: DataCatalogDatasetType; schema?: { name: string; type: string }[] }
): Promise<DataCatalogEntry> {
  return repo.create(pool, tenantId, entry);
}

export async function updateCustomDataset(
  pool: Pool,
  tenantId: string,
  id: string,
  update: { name?: string; type?: DataCatalogDatasetType; schema?: { name: string; type: string }[] }
): Promise<DataCatalogEntry | null> {
  return repo.update(pool, id, tenantId, update);
}

export async function deleteCustomDataset(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<boolean> {
  return repo.remove(pool, id, tenantId);
}
