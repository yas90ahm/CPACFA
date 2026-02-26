export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type MappingStatus = 'mapped' | 'unmapped' | 'changed';

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debitBalance: number;
  creditBalance: number;
  netBalance: number;
  mappingReportingLineId: string | null;
  mappingReportingLineName: string | null;
  mappingStatus: MappingStatus;
}

export interface GLEntry {
  date: string;
  description: string;
  debit: number;
  credit: number;
  source: string;
}

export interface TrialBalanceData {
  periodLabel: string;
  isAdjusted: boolean;
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  glEntriesByAccount: Record<string, GLEntry[]>;
}
