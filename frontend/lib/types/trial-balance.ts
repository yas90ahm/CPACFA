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
  /** Prior period net balance */
  priorNetBalance?: string | null;
  /** Change = current net - prior net */
  changeAmount?: string | null;
  /** Change percentage */
  changePercent?: string | null;
  /** Account exists only in current period */
  isNew?: boolean;
  /** Account had balance in prior but zero in current */
  isInactive?: boolean;
  /** Original currency if all GL lines for this account share the same currency */
  originalCurrency?: string | null;
  /** Original debit in original currency */
  originalDebit?: string | null;
  /** Original credit in original currency */
  originalCredit?: string | null;
  /** Exchange rate used for translation */
  exchangeRate?: string | null;
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
  priorPeriodLabel?: string | null;
  isAdjusted: boolean;
  rows: TrialBalanceRow[];
  /** Decimal string from backend — never convert to JS number */
  totalDebits: string;
  /** Decimal string from backend — never convert to JS number */
  totalCredits: string;
  glEntriesByAccount: Record<string, GLEntry[]>;
}
