/**
 * Data catalog for ad-hoc query over tenant datasets.
 */

export type DataCatalogDatasetType =
  | 'trial_balance'
  | 'balance_sheet'
  | 'profit_and_loss'
  | 'budget_version'
  | 'cash_forecast'
  | 'ar_aging'
  | 'ap_aging'
  | 'data_quality_exceptions';

export interface DataCatalogEntry {
  id: string;
  name: string;
  type: DataCatalogDatasetType;
  /** Field names and types for schema */
  schema: { name: string; type: string }[];
  /** Optional: custom resolver (e.g. for DB-stored custom reports) */
  resolver?: string;
}

export interface CatalogQueryResult {
  datasetId: string;
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
}
