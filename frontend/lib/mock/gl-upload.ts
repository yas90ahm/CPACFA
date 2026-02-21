import type { GLParseResult, ValidationResult } from '@/lib/types/ingest';

const MOCK_COLUMNS = ['Acct No', 'Account Name', 'Trans Date', 'Description', 'Doc Number', 'Debit', 'Credit'];

const MOCK_ROWS: Record<string, string>[] = [
  { 'Acct No': '1010', 'Account Name': 'Chase Checking', 'Trans Date': '2026-02-01', 'Description': 'Opening', 'Doc Number': 'OP', 'Debit': '5000.00', 'Credit': '' },
  { 'Acct No': '1010', 'Account Name': 'Chase Checking', 'Trans Date': '2026-02-03', 'Description': 'Deposit', 'Doc Number': 'DEP-001', 'Debit': '', 'Credit': '1200.00' },
  { 'Acct No': '1100', 'Account Name': 'Accounts Recv', 'Trans Date': '2026-02-01', 'Description': 'Invoice', 'Doc Number': 'INV-100', 'Debit': '12500.00', 'Credit': '' },
  { 'Acct No': '1200', 'Account Name': 'Inventory', 'Trans Date': '2026-02-02', 'Description': 'Receipt', 'Doc Number': 'RCV-50', 'Debit': '8500.00', 'Credit': '' },
  { 'Acct No': '2010', 'Account Name': 'Accounts Pay', 'Trans Date': '2026-02-05', 'Description': 'Vendor', 'Doc Number': 'AP-200', 'Debit': '', 'Credit': '3200.00' },
  { 'Acct No': '4100', 'Account Name': 'Revenue', 'Trans Date': '2026-02-10', 'Description': 'Sales', 'Doc Number': 'SAL-1', 'Debit': '', 'Credit': '45000.00' },
  { 'Acct No': '5100', 'Account Name': 'COGS', 'Trans Date': '2026-02-10', 'Description': 'Cost', 'Doc Number': 'SAL-1', 'Debit': '28000.00', 'Credit': '' },
  { 'Acct No': '6100', 'Account Name': 'Salaries', 'Trans Date': '2026-02-15', 'Description': 'Payroll', 'Doc Number': 'PR-1', 'Debit': '120000.00', 'Credit': '' },
  { 'Acct No': '6710', 'Account Name': 'New Account A', 'Trans Date': '2026-02-01', 'Description': 'New', 'Doc Number': 'N1', 'Debit': '100.00', 'Credit': '' },
  { 'Acct No': '6720', 'Account Name': 'New Account B', 'Trans Date': '2026-02-02', 'Description': 'New', 'Doc Number': 'N2', 'Debit': '', 'Credit': '250.00' },
];

export const mockGLParseResult: GLParseResult = {
  columns: MOCK_COLUMNS,
  rows: MOCK_ROWS,
  rowCount: 1247,
  accountCount: 52,
  autoDetectedMappings: {
    account_code: 'Acct No',
    account_name: 'Account Name',
    date: 'Trans Date',
    description: 'Description',
    reference: 'Doc Number',
    debit_amount: 'Debit',
    credit_amount: 'Credit',
  },
};

export const mockGLValidationPass: ValidationResult = {
  passed: true,
  errors: [],
  warnings: [
    { message: '5 new accounts not seen in prior period', detail: '6710, 6720, 6730, 6740, 6750' },
    { message: '3 accounts from prior period have no activity this period', detail: '7200, 7300, 7400' },
  ],
};

export const mockGLValidationFail: ValidationResult = {
  passed: false,
  errors: [
    { message: 'Trial balance does not balance', detail: 'Total Debits: $45,678,901.23 | Total Credits: $45,678,899.00 | Difference: $2.23' },
    { message: '3 entries have unparseable amounts', detail: 'Rows 142, 567, 890', rows: [142, 567, 890] },
  ],
  warnings: [],
};

export function parseGLFile(_file: File): Promise<GLParseResult> {
  return Promise.resolve(mockGLParseResult);
}

export function validateGL(_mappings: Record<string, string>, _rows: Record<string, string>[]): Promise<ValidationResult> {
  return Promise.resolve(mockGLValidationPass);
}

/** Mock TB file parse for "Upload Trial Balance Directly" flow. */
const TB_MOCK_COLUMNS = ['Account Code', 'Account Name', 'Debit', 'Credit', 'Type'];
const TB_MOCK_ROWS: Record<string, string>[] = [
  { 'Account Code': '1010', 'Account Name': 'Chase Checking', 'Debit': '1245678.90', 'Credit': '0', 'Type': 'ASSET' },
  { 'Account Code': '1100', 'Account Name': 'Accounts Receivable', 'Debit': '3456789.00', 'Credit': '0', 'Type': 'ASSET' },
  { 'Account Code': '2010', 'Account Name': 'Accounts Payable', 'Debit': '0', 'Credit': '2890000.00', 'Type': 'LIABILITY' },
];
export const mockTBParseResult: GLParseResult = {
  columns: TB_MOCK_COLUMNS,
  rows: TB_MOCK_ROWS,
  rowCount: 52,
  accountCount: 52,
  autoDetectedMappings: {
    account_code: 'Account Code',
    account_name: 'Account Name',
    debit_balance: 'Debit',
    credit_balance: 'Credit',
    account_type: 'Type',
  },
};

export function parseTBFile(_file: File): Promise<GLParseResult> {
  return Promise.resolve(mockTBParseResult);
}
