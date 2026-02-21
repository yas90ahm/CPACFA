import type { StatementLineItem, AccountRollup } from '@/lib/types/statements';

function line(
  id: string,
  statementType: StatementLineItem['statementType'],
  sectionName: string,
  lineItemName: string,
  amount: string,
  displayOrder: number,
  opts: {
    isSubtotal?: boolean;
    isGrandTotal?: boolean;
    indentLevel?: number;
    accounts?: AccountRollup[];
  } = {}
): StatementLineItem {
  const { isSubtotal = false, isGrandTotal = false, indentLevel = 1, accounts = [] } = opts;
  return {
    id,
    statementType,
    sectionName,
    lineItemName,
    taxonomyLineId: id,
    amount,
    displayOrder,
    isSubtotal,
    isGrandTotal,
    indentLevel,
    accounts,
  };
}

function acct(code: string, name: string, balance: string, entries: AccountRollup['entries'] = []): AccountRollup {
  return { accountCode: code, accountName: name, balance, entries };
}

function jeRef(jeId: string, jeNumber: string, memo: string, date: string, amount: string, type: 'gl_import' | 'adjusting_entry') {
  return { jeId, jeNumber, memo, date, amount, type };
}

/** Income Statement — numbers tie to Equity (Net Income) and CF (Net Income) */
const incomeStatementLines: StatementLineItem[] = [
  line('is-rev', 'income_statement', 'Revenue', 'Revenue', '', 0, { indentLevel: 0, accounts: [] }),
  line('is-rev-prod', 'income_statement', 'Revenue', 'Revenue — Product Sales', '18450000.00', 1, {
    accounts: [
      acct('4100', 'Product Revenue', '16200000.00', [
        jeRef('gl-4100', 'GL Import', 'Jan 2026', '2026-01-31', '16075000.00', 'gl_import'),
        jeRef('je-1041', 'JE #1041', 'Revenue reclass', '2026-01-31', '125000.00', 'adjusting_entry'),
      ]),
      acct('4110', 'Product Revenue — Intl', '1950000.00', [
        jeRef('gl-4110', 'GL Import', 'Jan 2026', '2026-01-31', '1950000.00', 'gl_import'),
      ]),
      acct('4120', 'Product Returns', '-700000.00', [
        jeRef('gl-4120', 'GL Import', 'Jan 2026', '2026-01-31', '-700000.00', 'gl_import'),
      ]),
    ],
  }),
  line('is-rev-svc', 'income_statement', 'Revenue', 'Revenue — Service Income', '2340000.00', 2, {
    accounts: [acct('4200', 'Service Income', '2340000.00', [jeRef('gl-4200', 'GL Import', 'Jan 2026', '2026-01-31', '2340000.00', 'gl_import')])],
  }),
  line('is-tot-rev', 'income_statement', 'Revenue', 'Total Revenue', '20790000.00', 3, { isSubtotal: true }),
  line('is-cogs', 'income_statement', 'Cost of Goods Sold', 'Cost of Goods Sold', '', 4, { indentLevel: 0, accounts: [] }),
  line('is-cogs-mat', 'income_statement', 'Cost of Goods Sold', 'COGS — Materials', '8120000.00', 5, {
    accounts: [acct('5100', 'COGS — Materials', '8120000.00', [jeRef('gl-5100', 'GL Import', 'Jan 2026', '2026-01-31', '8120000.00', 'gl_import')])],
  }),
  line('is-cogs-labor', 'income_statement', 'Cost of Goods Sold', 'COGS — Direct Labor', '3450000.00', 6, {
    accounts: [acct('5200', 'COGS — Direct Labor', '3450000.00', [jeRef('gl-5200', 'GL Import', 'Jan 2026', '2026-01-31', '3450000.00', 'gl_import')])],
  }),
  line('is-cogs-oh', 'income_statement', 'Cost of Goods Sold', 'COGS — Manufacturing Overhead', '1890000.00', 7, {
    accounts: [acct('5300', 'COGS — Overhead', '1890000.00', [jeRef('gl-5300', 'GL Import', 'Jan 2026', '2026-01-31', '1890000.00', 'gl_import')])],
  }),
  line('is-tot-cogs', 'income_statement', 'Cost of Goods Sold', 'Total Cost of Goods Sold', '13460000.00', 8, { isSubtotal: true }),
  line('is-gp', 'income_statement', '', 'Gross Profit', '7330000.00', 9, { isSubtotal: true }),
  line('is-opex', 'income_statement', 'Operating Expenses', 'Operating Expenses', '', 10, { indentLevel: 0, accounts: [] }),
  line('is-sal', 'income_statement', 'Operating Expenses', 'Salaries & Wages', '2425000.00', 11, {
    accounts: [acct('6100', 'Salaries & Wages', '2425000.00', [jeRef('gl-6100', 'GL Import', 'Jan 2026', '2026-01-31', '2425000.00', 'gl_import')])],
  }),
  line('is-rent', 'income_statement', 'Operating Expenses', 'Rent Expense', '185000.00', 12, {
    accounts: [acct('6300', 'Rent Expense', '185000.00', [jeRef('gl-6300', 'GL Import', 'Jan 2026', '2026-01-31', '185000.00', 'gl_import')])],
  }),
  line('is-depr', 'income_statement', 'Operating Expenses', 'Depreciation Expense', '57500.00', 13, {
    accounts: [acct('6400', 'Depreciation Expense', '57500.00', [jeRef('gl-6400', 'GL Import', 'Jan 2026', '2026-01-31', '57500.00', 'gl_import')])],
  }),
  line('is-ins', 'income_statement', 'Operating Expenses', 'Insurance Expense', '8333.33', 14, {
    accounts: [acct('6500', 'Insurance Expense', '8333.33', [jeRef('gl-6500', 'GL Import', 'Jan 2026', '2026-01-31', '8333.33', 'gl_import')])],
  }),
  line('is-util', 'income_statement', 'Operating Expenses', 'Utilities', '42000.00', 15, {
    accounts: [acct('6600', 'Utilities', '42000.00', [jeRef('gl-6600', 'GL Import', 'Jan 2026', '2026-01-31', '42000.00', 'gl_import')])],
  }),
  line('is-supp', 'income_statement', 'Operating Expenses', 'Office Supplies', '18500.00', 16, {
    accounts: [acct('6200', 'Office Supplies', '18500.00', [jeRef('gl-6200', 'GL Import', 'Jan 2026', '2026-01-31', '18500.00', 'gl_import')])],
  }),
  line('is-prof', 'income_statement', 'Operating Expenses', 'Professional Fees', '32000.00', 17, {
    accounts: [acct('6700', 'Professional Fees', '32000.00', [jeRef('gl-6700', 'GL Import', 'Jan 2026', '2026-01-31', '32000.00', 'gl_import')])],
  }),
  line('is-tot-opex', 'income_statement', 'Operating Expenses', 'Total Operating Expenses', '2768333.33', 18, { isSubtotal: true }),
  line('is-oi', 'income_statement', '', 'Operating Income', '4561666.67', 19, { isSubtotal: true }),
  line('is-other', 'income_statement', 'Other Income (Expense)', 'Other Income (Expense)', '', 20, { indentLevel: 0, accounts: [] }),
  line('is-int', 'income_statement', 'Other Income (Expense)', 'Interest Expense', '-33333.33', 21, {
    accounts: [acct('7100', 'Interest Expense', '-33333.33', [jeRef('gl-7100', 'GL Import', 'Jan 2026', '2026-01-31', '-33333.33', 'gl_import')])],
  }),
  line('is-oth-inc', 'income_statement', 'Other Income (Expense)', 'Other Income', '12000.00', 22, {
    accounts: [acct('7200', 'Other Income', '12000.00', [jeRef('gl-7200', 'GL Import', 'Jan 2026', '2026-01-31', '12000.00', 'gl_import')])],
  }),
  line('is-tot-other', 'income_statement', 'Other Income (Expense)', 'Total Other Income (Expense)', '-21333.33', 23, { isSubtotal: true }),
  line('is-ibt', 'income_statement', '', 'Income Before Tax', '4540333.34', 24, { isSubtotal: true }),
  line('is-tax', 'income_statement', '', 'Income Tax Expense', '1135083.34', 25, {
    accounts: [acct('7300', 'Income Tax Expense', '1135083.34', [jeRef('gl-7300', 'GL Import', 'Jan 2026', '2026-01-31', '1135083.34', 'gl_import')])],
  }),
  line('is-ni', 'income_statement', '', 'Net Income', '3405250.00', 26, { isGrandTotal: true, accounts: [] }),
];

/** Balance Sheet — Total Assets = Total L+E */
const balanceSheetLines: StatementLineItem[] = [
  line('bs-assets', 'balance_sheet', 'ASSETS', 'ASSETS', '', 0, { indentLevel: 0, accounts: [] }),
  line('bs-ca', 'balance_sheet', 'Current Assets', 'Current Assets', '', 1, { indentLevel: 0, accounts: [] }),
  line('bs-cash', 'balance_sheet', 'Current Assets', 'Cash and Cash Equivalents', '1745678.90', 2, {
    accounts: [
      acct('1010', 'Chase Checking', '1745678.90', [
        jeRef('gl-1010', 'GL Import', 'Jan 2026', '2026-01-31', '1745678.90', 'gl_import'),
      ]),
    ],
  }),
  line('bs-ar', 'balance_sheet', 'Current Assets', 'Accounts Receivable, net', '3438289.00', 3, {
    accounts: [acct('1100', 'Accounts Receivable', '3438289.00', [jeRef('gl-1100', 'GL Import', 'Jan 2026', '2026-01-31', '3438289.00', 'gl_import')])],
  }),
  line('bs-inv', 'balance_sheet', 'Current Assets', 'Inventory', '3900000.00', 4, {
    accounts: [
      acct('1200', 'Inventory — Raw', '2000000.00', [jeRef('gl-1200', 'GL Import', 'Jan 2026', '2026-01-31', '2000000.00', 'gl_import')]),
      acct('1210', 'Inventory — FG', '1900000.00', [jeRef('gl-1210', 'GL Import', 'Jan 2026', '2026-01-31', '1900000.00', 'gl_import')]),
    ],
  }),
  line('bs-prepaid', 'balance_sheet', 'Current Assets', 'Prepaid Expenses', '236666.67', 5, {
    accounts: [acct('1300', 'Prepaid Expenses', '236666.67', [jeRef('gl-1300', 'GL Import', 'Jan 2026', '2026-01-31', '236666.67', 'gl_import')])],
  }),
  line('bs-tot-ca', 'balance_sheet', 'Current Assets', 'Total Current Assets', '9320634.57', 6, { isSubtotal: true }),
  line('bs-ppe', 'balance_sheet', 'Non-Current Assets', 'Property, Plant & Equipment', '12500000.00', 7, {
    accounts: [acct('1500', 'PP&E', '12500000.00', [jeRef('gl-1500', 'GL Import', 'Jan 2026', '2026-01-31', '12500000.00', 'gl_import')])],
  }),
  line('bs-accdep', 'balance_sheet', 'Non-Current Assets', 'Less: Accumulated Depreciation', '-4257500.00', 8, {
    accounts: [acct('1510', 'Accumulated Depreciation', '-4257500.00', [jeRef('gl-1510', 'GL Import', 'Jan 2026', '2026-01-31', '-4257500.00', 'gl_import')])],
  }),
  line('bs-net-ppe', 'balance_sheet', 'Non-Current Assets', 'Net PP&E', '8242500.00', 9, { isSubtotal: true }),
  line('bs-tot-assets', 'balance_sheet', '', 'Total Assets', '17563134.57', 10, { isGrandTotal: true }),
  line('bs-liab-eq', 'balance_sheet', "LIABILITIES AND STOCKHOLDERS' EQUITY", "LIABILITIES AND STOCKHOLDERS' EQUITY", '', 11, { indentLevel: 0, accounts: [] }),
  line('bs-cl', 'balance_sheet', 'Current Liabilities', 'Current Liabilities', '', 12, { indentLevel: 0, accounts: [] }),
  line('bs-ap', 'balance_sheet', 'Current Liabilities', 'Accounts Payable', '2890000.00', 13, {
    accounts: [acct('2010', 'Accounts Payable', '2890000.00', [jeRef('gl-2010', 'GL Import', 'Jan 2026', '2026-01-31', '2890000.00', 'gl_import')])],
  }),
  line('bs-accr', 'balance_sheet', 'Current Liabilities', 'Accrued Expenses', '2089333.33', 14, {
    accounts: [acct('2100', 'Accrued Expenses', '2089333.33', [jeRef('gl-2100', 'GL Import', 'Jan 2026', '2026-01-31', '2089333.33', 'gl_import')])],
  }),
  line('bs-curr-debt', 'balance_sheet', 'Current Liabilities', 'Current Portion of Long-Term Debt', '500000.00', 15, {
    accounts: [acct('2200', 'Current Portion LTD', '500000.00', [jeRef('gl-2200', 'GL Import', 'Jan 2026', '2026-01-31', '500000.00', 'gl_import')])],
  }),
  line('bs-tot-cl', 'balance_sheet', 'Current Liabilities', 'Total Current Liabilities', '5479333.33', 16, { isSubtotal: true }),
  line('bs-ltd', 'balance_sheet', 'Non-Current Liabilities', 'Long-Term Debt', '8000000.00', 17, {
    accounts: [acct('2500', 'Long-Term Debt', '8000000.00', [jeRef('gl-2500', 'GL Import', 'Jan 2026', '2026-01-31', '8000000.00', 'gl_import')])],
  }),
  line('bs-tot-liab', 'balance_sheet', 'Non-Current Liabilities', 'Total Liabilities', '13479333.33', 18, { isSubtotal: true }),
  line('bs-eq', 'balance_sheet', "Stockholders' Equity", "Stockholders' Equity", '', 19, { indentLevel: 0, accounts: [] }),
  line('bs-cs', 'balance_sheet', "Stockholders' Equity", 'Common Stock', '100000.00', 20, {
    accounts: [acct('3010', 'Common Stock', '100000.00', [jeRef('gl-3010', 'GL Import', 'Jan 2026', '2026-01-31', '100000.00', 'gl_import')])],
  }),
  line('bs-apic', 'balance_sheet', "Stockholders' Equity", 'Additional Paid-In Capital', '500000.00', 21, {
    accounts: [acct('3020', 'APIC', '500000.00', [jeRef('gl-3020', 'GL Import', 'Jan 2026', '2026-01-31', '500000.00', 'gl_import')])],
  }),
  line('bs-re', 'balance_sheet', "Stockholders' Equity", 'Retained Earnings', '3483801.24', 22, {
    accounts: [acct('3030', 'Retained Earnings', '3483801.24', [jeRef('gl-3030', 'GL Import', 'Jan 2026', '2026-01-31', '3483801.24', 'gl_import')])],
  }),
  line('bs-tot-eq', 'balance_sheet', "Stockholders' Equity", 'Total Stockholders\' Equity', '4083801.24', 23, { isSubtotal: true }),
  line('bs-tot-liab-eq', 'balance_sheet', '', 'Total Liabilities & Equity', '17563134.57', 24, { isGrandTotal: true }),
];

/** Cash Flow — Ending Cash = BS Cash */
const cashFlowLines: StatementLineItem[] = [
  line('cf-op', 'cash_flow', 'Operating', 'Cash Flows from Operating Activities', '', 0, { indentLevel: 0, accounts: [] }),
  line('cf-ni', 'cash_flow', 'Operating', 'Net Income', '3405250.00', 1, { accounts: [] }),
  line('cf-adj', 'cash_flow', 'Operating', 'Adjustments for non-cash items:', '', 2, { indentLevel: 0, accounts: [] }),
  line('cf-depr', 'cash_flow', 'Operating', 'Depreciation Expense', '57500.00', 3, { accounts: [] }),
  line('cf-baddebt', 'cash_flow', 'Operating', 'Bad Debt Expense', '18500.00', 4, { accounts: [] }),
  line('cf-wc', 'cash_flow', 'Operating', 'Changes in working capital:', '', 5, { indentLevel: 0, accounts: [] }),
  line('cf-ar', 'cash_flow', 'Operating', '(Increase) in Accounts Receivable', '-156789.00', 6, { accounts: [] }),
  line('cf-inv', 'cash_flow', 'Operating', '(Increase) in Inventory', '-200000.00', 7, { accounts: [] }),
  line('cf-prepaid', 'cash_flow', 'Operating', 'Decrease in Prepaid Expenses', '8333.33', 8, { accounts: [] }),
  line('cf-ap', 'cash_flow', 'Operating', 'Increase in Accounts Payable', '234000.00', 9, { accounts: [] }),
  line('cf-accr', 'cash_flow', 'Operating', 'Increase in Accrued Expenses', '189333.33', 10, { accounts: [] }),
  line('cf-net-op', 'cash_flow', 'Operating', 'Net Cash from Operating Activities', '3556127.66', 11, { isSubtotal: true }),
  line('cf-inv-h', 'cash_flow', 'Investing', 'Cash Flows from Investing Activities', '', 12, { indentLevel: 0, accounts: [] }),
  line('cf-ppe', 'cash_flow', 'Investing', 'Purchase of PP&E', '-150000.00', 13, { accounts: [] }),
  line('cf-net-inv', 'cash_flow', 'Investing', 'Net Cash from Investing Activities', '-150000.00', 14, { isSubtotal: true }),
  line('cf-fin-h', 'cash_flow', 'Financing', 'Cash Flows from Financing Activities', '', 15, { indentLevel: 0, accounts: [] }),
  line('cf-debt', 'cash_flow', 'Financing', 'Repayment of Long-Term Debt', '-125000.00', 16, { accounts: [] }),
  line('cf-net-fin', 'cash_flow', 'Financing', 'Net Cash from Financing Activities', '-125000.00', 17, { isSubtotal: true }),
  line('cf-change', 'cash_flow', '', 'Net Change in Cash', '3281127.66', 18, { isSubtotal: true }),
  line('cf-beg', 'cash_flow', '', 'Beginning Cash Balance', '-1535448.76', 19, { accounts: [] }),
  line('cf-end', 'cash_flow', '', 'Ending Cash Balance', '1745678.90', 20, { isGrandTotal: true, accounts: [] }),
];

/** Equity — Net Income = IS; Ending RE = BS RE; Total Equity = BS Total Equity */
const equityLines: StatementLineItem[] = [
  line('eq-cs', 'equity', 'Common Stock', 'Common Stock', '100000.00', 0, { accounts: [] }),
  line('eq-apic', 'equity', 'Additional Paid-In Capital', 'Additional Paid-In Capital', '500000.00', 1, { accounts: [] }),
  line('eq-re', 'equity', 'Retained Earnings', 'Retained Earnings', '3483801.24', 2, { accounts: [] }),
  line('eq-tot', 'equity', '', 'Total Stockholders\' Equity', '4083801.24', 3, { isGrandTotal: true, accounts: [] }),
];

export const mockIncomeStatement = { statementType: 'income_statement' as const, lines: incomeStatementLines };
export const mockBalanceSheet = { statementType: 'balance_sheet' as const, lines: balanceSheetLines };
export const mockCashFlow = { statementType: 'cash_flow' as const, lines: cashFlowLines };
export const mockEquityStatement = { statementType: 'equity' as const, lines: equityLines };

/** Equity statement columnar layout: rows are "Beginning Balance", "Net Income", "Dividends", "Ending Balance" */
export const mockEquityColumnar = {
  columns: ['Common Stock', 'Additional Paid-In Cap', 'Retained Earnings', "Total Stockholders' Equity"],
  rows: [
    { label: 'Beginning Balance', values: ['100000.00', '500000.00', '78551.24', '678551.24'] },
    { label: 'Net Income', values: ['—', '—', '3405250.00', '3405250.00'] },
    { label: 'Dividends', values: ['—', '—', '—', '—'] },
    { label: 'Ending Balance', values: ['100000.00', '500000.00', '3483801.24', '4083801.24'] },
  ],
};

export function getStatementsBySession(_sessionId: string) {
  return {
    incomeStatement: mockIncomeStatement,
    balanceSheet: mockBalanceSheet,
    cashFlow: mockCashFlow,
    equityStatement: mockEquityStatement,
    equityColumnar: mockEquityColumnar,
  };
}
