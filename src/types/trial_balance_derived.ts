/**
 * Derived Trial Balance types — GL aggregation output.
 * TB is derived from GL, not uploaded separately.
 */

import type { AccountType } from './coa.js';

export interface TrialBalanceEntry {
  account_code: string;
  account_name: string;
  account_type?: AccountType;
  total_debits: number;
  total_credits: number;
  net_balance: number;
  /** For compatibility with existing TB format */
  debit?: number;
  /** For compatibility with existing TB format */
  credit?: number;
}

export interface DerivedTrialBalance {
  tenant_id: string;
  period_label: string;
  source: 'gl_aggregation';
  entries: TrialBalanceEntry[];
  total_debits: number;
  total_credits: number;
  balance_sheet_totals: {
    assets: number;
    liabilities: number;
    equity: number;
  };
  derived_at: Date;
}
