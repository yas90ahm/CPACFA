/**
 * General Ledger types — journal entries and lines.
 */

export interface GeneralLedgerLine {
  id?: string;
  tenant_id: string;
  period_label: string;
  entry_id: string;
  line_number: number;
  entry_date: Date | string;
  account_code: string;
  debit: number;
  credit: number;
  description?: string;
  amount_provenance?: string;
  source?: string;
  created_at?: Date | string;
  created_by?: string;
}

export interface JournalEntry {
  entry_id: string;
  entry_date: Date | string;
  description?: string;
  lines: GeneralLedgerLine[];
}

export interface GLUploadRow {
  entry_id: string;
  line_number?: number;
  entry_date: string | Date;
  account_code: string;
  debit?: number | string;
  credit?: number | string;
  description?: string;
  amount_provenance?: string;
}

export interface GLValidationResult {
  valid: boolean;
  balancedEntries: JournalEntry[];
  imbalancedEntries: Array<{
    entry: JournalEntry;
    totalDebits: number;
    totalCredits: number;
    imbalance: number;
  }>;
  errors: string[];
}

export interface GLUploadResult {
  success: boolean;
  balancedCount: number;
  imbalancedCount: number;
  imbalancedEntries?: Array<{
    entry_id: string;
    totalDebits: number;
    totalCredits: number;
    imbalance: number;
    lines: GeneralLedgerLine[];
  }>;
  stagedIds?: string[];
  errors?: string[];
}

export interface GLResolveRequest {
  stagedId: string;
  resolution: {
    action: 'apply_correction' | 'skip';
    correctedLines?: Array<{
      line_number?: number;
      account_code: string;
      debit?: number;
      credit?: number;
      description?: string;
    }>;
  };
}
