/**
 * Chart of Accounts types — tenant-level account metadata.
 */

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface CoaAccount {
  id?: string;
  tenant_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_subtype?: string;
  parent_account_code?: string;
  is_active?: boolean;
  effective_from?: Date | string;
  effective_to?: Date | string;
  created_at?: Date | string;
  updated_at?: Date | string;
  created_by?: string;
}

export interface CoaUploadRow {
  account_code: string;
  account_name: string;
  account_type: string;
  account_subtype?: string;
  parent_account_code?: string;
}
