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
  account_name?: string;
  debit: number;
  credit: number;
  description?: string;
  amount_provenance?: string;
  source?: string;
  created_at?: Date | string;
  created_by?: string;
  /** ISO currency code of original transaction (null = functional currency) */
  original_currency?: string | null;
  /** Debit in original currency before translation */
  original_debit?: number | null;
  /** Credit in original currency before translation */
  original_credit?: number | null;
  /** Exchange rate used: 1 original = rate * functional */
  exchange_rate?: number | null;
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
  account_name?: string;
  debit?: number | string;
  credit?: number | string;
  description?: string;
  amount_provenance?: string;
  /** ISO currency code of original transaction */
  currency?: string | null;
  /** Exchange rate used for translation */
  exchange_rate?: number | string | null;
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
