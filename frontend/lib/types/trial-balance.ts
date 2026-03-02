export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type MappingStatus = 'mapped' | 'unmapped' | 'changed';

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  /** Decimal string from backend — never convert to JS number */
  debitBalance: string;
  /** Decimal string from backend — never convert to JS number */
  creditBalance: string;
  /** Decimal string from backend — never convert to JS number */
  netBalance: string;
  mappingReportingLineId: string | null;
  mappingReportingLineName: string | null;
  mappingStatus: MappingStatus;
}

export interface GLEntry {
  id: string;
  date: string;
  description: string | null;
  /** Decimal string from backend */
  debit: string;
  /** Decimal string from backend */
  credit: string;
  source: 'gl_import' | 'adjusting_entry';
  jeId: string | null;
  jeNumber: string | null;
}

export interface GLDrillDownResponse {
  accountCode: string;
  accountName: string;
  entries: GLEntry[];
}

export interface TrialBalanceData {
  periodLabel: string;
  isAdjusted: boolean;
  rows: TrialBalanceRow[];
  /** Decimal string from backend — never convert to JS number */
  totalDebits: string;
  /** Decimal string from backend — never convert to JS number */
  totalCredits: string;
  glEntriesByAccount: Record<string, GLEntry[]>;
}
