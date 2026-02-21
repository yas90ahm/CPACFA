import type { TrialBalanceRow, GLEntry } from '@/lib/types/trial-balance';

function row(
  code: string,
  name: string,
  type: TrialBalanceRow['accountType'],
  debit: number,
  credit: number,
  mappingId: string | null,
  mappingName: string | null,
  status: TrialBalanceRow['mappingStatus']
): TrialBalanceRow {
  const net = debit - credit;
  return {
    accountCode: code,
    accountName: name,
    accountType: type,
    debitBalance: debit,
    creditBalance: credit,
    netBalance: net,
    mappingReportingLineId: mappingId,
    mappingReportingLineName: mappingName,
    mappingStatus: status,
  };
}

export const mockTrialBalanceRows: TrialBalanceRow[] = [
  row('1010', 'Chase Checking — Operating', 'ASSET', 2_450_000, 0, 'cash', 'Cash and Cash Equivalents', 'mapped'),
  row('1020', 'Chase Savings — Reserve', 'ASSET', 1_200_000, 0, 'cash', 'Cash and Cash Equivalents', 'mapped'),
  row('1100', 'Accounts Receivable — Trade', 'ASSET', 8_750_000, 0, 'ar', 'Accounts Receivable', 'mapped'),
  row('1200', 'Inventory — Raw Materials', 'ASSET', 3_200_000, 0, 'inv', 'Inventory', 'mapped'),
  row('1210', 'Inventory — Finished Goods', 'ASSET', 5_100_000, 0, 'inv', 'Inventory', 'mapped'),
  row('1300', 'Prepaid Expenses', 'ASSET', 420_000, 0, 'prepaid', 'Prepaid Expenses', 'mapped'),
  row('1500', 'Property, Plant & Equipment', 'ASSET', 12_500_000, 0, 'ppe', 'Property, Plant & Equipment', 'mapped'),
  row('1510', 'Accumulated Depreciation', 'ASSET', 0, 2_800_000, 'accdep', 'Accumulated Depreciation', 'mapped'),
  row('2010', 'Accounts Payable — Trade', 'LIABILITY', 0, 4_200_000, 'ap', 'Accounts Payable', 'mapped'),
  row('2100', 'Accrued Expenses', 'LIABILITY', 0, 1_850_000, 'accrued', 'Accrued Expenses', 'mapped'),
  row('2200', 'Current Portion — Long-Term Debt', 'LIABILITY', 0, 1_500_000, 'curr-debt', 'Current Portion — Long-Term Debt', 'mapped'),
  row('2500', 'Long-Term Debt — Term Loan', 'LIABILITY', 0, 8_000_000, 'ltd', 'Long-Term Debt', 'mapped'),
  row('3010', 'Common Stock', 'EQUITY', 0, 1_000_000, 'eq-cs', 'Common Stock', 'mapped'),
  row('3020', 'Additional Paid-In Capital', 'EQUITY', 0, 5_000_000, 'eq-apic', 'Additional Paid-In Capital', 'mapped'),
  row('3030', 'Retained Earnings', 'EQUITY', 0, 14_220_000, 'eq-re', 'Retained Earnings', 'mapped'),
  row('4100', 'Revenue — Product Sales', 'REVENUE', 0, 185_000_000, 'rev-prod', 'Revenue — Products', 'mapped'),
  row('4200', 'Revenue — Service Income', 'REVENUE', 0, 12_500_000, 'rev-svc', 'Revenue — Services', 'mapped'),
  row('5100', 'COGS — Materials', 'EXPENSE', 136_713_000, 0, 'cogs-mat', 'COGS — Materials', 'mapped'),
  row('5200', 'COGS — Direct Labor', 'EXPENSE', 32_000_000, 0, 'cogs-labor', 'COGS — Direct Labor', 'mapped'),
  row('5300', 'COGS — Overhead', 'EXPENSE', 8_500_000, 0, 'cogs-oh', 'COGS — Overhead', 'mapped'),
  row('6100', 'Salaries & Wages', 'EXPENSE', 18_200_000, 0, 'opex-sal', 'Operating Expenses — Salaries', 'mapped'),
  row('6200', 'Office Supplies', 'EXPENSE', 45_000, 0, null, null, 'unmapped'),
  row('6300', 'Rent Expense', 'EXPENSE', 720_000, 0, 'opex-rent', 'Operating Expenses — Rent', 'mapped'),
  row('6400', 'Depreciation Expense', 'EXPENSE', 280_000, 0, 'opex-depr', 'Operating Expenses — Depreciation', 'mapped'),
  row('6500', 'Insurance Expense', 'EXPENSE', 120_000, 0, 'opex-gen', 'Operating Expenses — General', 'mapped'),
  row('6600', 'Utilities', 'EXPENSE', 95_000, 0, 'opex-gen', 'Operating Expenses — General', 'mapped'),
  row('6700', 'Professional Fees', 'EXPENSE', 340_000, 0, 'opex-gen', 'Operating Expenses — General', 'mapped'),
  row('6800', 'Shipping', 'EXPENSE', 890_000, 0, null, null, 'unmapped'),
  row('7100', 'Interest Expense', 'EXPENSE', 420_000, 0, 'cfs-fin', 'Financing Activities', 'mapped'),
  row('7200', 'Other Income', 'REVENUE', 0, 85_000, 'rev-other', 'Revenue — Other', 'mapped'),
  row('7300', 'Income Tax Expense', 'EXPENSE', 4_200_000, 0, 'opex-gen', 'Operating Expenses — General', 'mapped'),
  row('7350', 'Miscellaneous Expense', 'EXPENSE', 12_000, 0, null, null, 'unmapped'),
];

const totalDebits = mockTrialBalanceRows.reduce((s, r) => s + r.debitBalance, 0);
const totalCredits = mockTrialBalanceRows.reduce((s, r) => s + r.creditBalance, 0);

function glFor(code: string, debit: number, credit: number): GLEntry[] {
  return [
    { date: '2026-01-15', description: 'Opening balance', debit, credit, source: 'GL import' },
    { date: '2026-01-31', description: 'Period activity', debit: 0, credit: 0, source: 'JE#1042' },
  ];
}

export const mockGLByAccount: Record<string, GLEntry[]> = {};
mockTrialBalanceRows.forEach((r) => {
  mockGLByAccount[r.accountCode] = glFor(r.accountCode, r.debitBalance, r.creditBalance);
});

export const mockTrialBalance = {
  periodLabel: 'January 2026',
  isAdjusted: false,
  rows: mockTrialBalanceRows,
  totalDebits,
  totalCredits,
  glEntriesByAccount: mockGLByAccount,
};

export const unmappedCount = mockTrialBalanceRows.filter((r) => r.mappingStatus === 'unmapped').length;
export const mappedCount = mockTrialBalanceRows.filter((r) => r.mappingReportingLineId != null).length;
