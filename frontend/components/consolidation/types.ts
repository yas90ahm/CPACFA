/**
 * Global Controller / Consolidation types.
 * Aligns with backend consolidation models (subsidiaries, eliminations, rollup result).
 */

export interface SubsidiaryEntity {
  entity_id: string;
  entity_name: string;
  functional_currency: string;
  /** Optional: parent entity for tree (e.g. region) */
  parent_id?: string;
}

export interface StatementLine {
  label: string;
  amount: number | string;
  account_code?: string;
}

export interface BalanceSheetData {
  report_date: string;
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  total_assets: number | string;
  total_liabilities: number | string;
  total_equity: number | string;
}

export interface EliminationEntryData {
  description: string;
  debit_account: string;
  credit_account: string;
  amount: number | string;
  entity_debit: string;
  entity_credit: string;
}

export interface ConsolidationResultData {
  report_date: string;
  reporting_currency: string;
  consolidated_balance_sheet: BalanceSheetData;
  eliminations_applied: EliminationEntryData[];
  minority_interest?: { subsidiary_entity_id: string; subsidiary_name: string; amount: number | string; description?: string }[];
  total_minority_interest?: number | string;
  translation_adjustments?: Record<string, number | string>;
  intercompany_netted?: boolean;
}

/** Entity actual vs budget for variance (e.g. revenue, net income) */
export interface EntityVariance {
  entity_id: string;
  entity_name: string;
  metric_label: string;
  actual: number;
  budget: number;
  variance_pct: number; // (actual - budget) / budget * 100
  is_over_15: boolean;  // |variance_pct| >= 15
}
