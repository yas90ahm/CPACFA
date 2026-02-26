export type StatementType = 'income_statement' | 'balance_sheet' | 'cash_flow' | 'equity';

export interface JournalEntryRef {
  jeId: string;
  jeNumber: string;
  memo: string;
  date: string;
  amount: string;
  type: 'gl_import' | 'adjusting_entry';
}

export interface AccountRollup {
  accountCode: string;
  accountName: string;
  balance: string;
  entries: JournalEntryRef[];
}

export interface StatementLineItem {
  id: string;
  statementType: StatementType;
  sectionName: string;
  lineItemName: string;
  taxonomyLineId: string;
  amount: string;
  displayOrder: number;
  isSubtotal: boolean;
  isGrandTotal: boolean;
  indentLevel: number;
  accounts: AccountRollup[];
}
