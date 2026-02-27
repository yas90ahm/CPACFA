/**
 * GL Data Generator for UAT Tests
 * Generates realistic balanced journal-entry CSV data of varying sizes.
 */

export interface Account {
  code: string;
  name: string;
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense';
}

export const CHART_OF_ACCOUNTS: Account[] = [
  // Assets (1xxx)
  { code: '1000', name: 'Cash - Operating', category: 'asset' },
  { code: '1010', name: 'Cash - Payroll', category: 'asset' },
  { code: '1100', name: 'Accounts Receivable', category: 'asset' },
  { code: '1200', name: 'Inventory', category: 'asset' },
  { code: '1300', name: 'Prepaid Expenses', category: 'asset' },
  { code: '1400', name: 'Prepaid Insurance', category: 'asset' },
  { code: '1500', name: 'Fixed Assets - Equipment', category: 'asset' },
  { code: '1510', name: 'Fixed Assets - Furniture', category: 'asset' },
  { code: '1600', name: 'Accumulated Depreciation', category: 'asset' },
  { code: '1700', name: 'Intangible Assets', category: 'asset' },
  // Liabilities (2xxx)
  { code: '2000', name: 'Accounts Payable', category: 'liability' },
  { code: '2100', name: 'Accrued Expenses', category: 'liability' },
  { code: '2200', name: 'Accrued Payroll', category: 'liability' },
  { code: '2300', name: 'Sales Tax Payable', category: 'liability' },
  { code: '2400', name: 'Deferred Revenue', category: 'liability' },
  { code: '2500', name: 'Current Portion LTD', category: 'liability' },
  { code: '2600', name: 'Long Term Debt', category: 'liability' },
  // Equity (3xxx)
  { code: '3000', name: 'Common Stock', category: 'equity' },
  { code: '3100', name: 'Additional Paid-in Capital', category: 'equity' },
  { code: '3200', name: 'Retained Earnings', category: 'equity' },
  // Revenue (4xxx)
  { code: '4000', name: 'Product Revenue', category: 'revenue' },
  { code: '4100', name: 'Service Revenue', category: 'revenue' },
  { code: '4200', name: 'Subscription Revenue', category: 'revenue' },
  { code: '4300', name: 'Other Income', category: 'revenue' },
  // COGS (5xxx)
  { code: '5000', name: 'Cost of Goods Sold', category: 'cogs' },
  { code: '5100', name: 'Cost of Services', category: 'cogs' },
  { code: '5200', name: 'Direct Materials', category: 'cogs' },
  // Expenses (6xxx-7xxx)
  { code: '6000', name: 'Salaries and Wages', category: 'expense' },
  { code: '6100', name: 'Employee Benefits', category: 'expense' },
  { code: '6200', name: 'Payroll Taxes', category: 'expense' },
  { code: '6300', name: 'Rent Expense', category: 'expense' },
  { code: '6400', name: 'Utilities Expense', category: 'expense' },
  { code: '6500', name: 'Insurance Expense', category: 'expense' },
  { code: '6600', name: 'Depreciation Expense', category: 'expense' },
  { code: '6700', name: 'Office Supplies', category: 'expense' },
  { code: '6800', name: 'Professional Fees', category: 'expense' },
  { code: '6900', name: 'Marketing Expense', category: 'expense' },
  { code: '7000', name: 'Travel and Entertainment', category: 'expense' },
  { code: '7100', name: 'Software and Technology', category: 'expense' },
  { code: '7200', name: 'Bad Debt Expense', category: 'expense' },
  { code: '7300', name: 'Interest Expense', category: 'expense' },
  { code: '7400', name: 'Income Tax Expense', category: 'expense' },
];

/** JE pattern: lines that must balance (total debit multiplier = total credit multiplier) */
interface JEPattern {
  description: string;
  lines: Array<{ accountCode: string; isDebit: boolean; fraction: number }>;
}

const JE_PATTERNS: JEPattern[] = [
  // 2-line patterns
  { description: 'Revenue recognition', lines: [
    { accountCode: '1100', isDebit: true, fraction: 1 },
    { accountCode: '4000', isDebit: false, fraction: 1 },
  ]},
  { description: 'Cash receipt from customer', lines: [
    { accountCode: '1000', isDebit: true, fraction: 1 },
    { accountCode: '1100', isDebit: false, fraction: 1 },
  ]},
  { description: 'Vendor invoice', lines: [
    { accountCode: '6800', isDebit: true, fraction: 1 },
    { accountCode: '2000', isDebit: false, fraction: 1 },
  ]},
  { description: 'Payment to vendor', lines: [
    { accountCode: '2000', isDebit: true, fraction: 1 },
    { accountCode: '1000', isDebit: false, fraction: 1 },
  ]},
  { description: 'Monthly depreciation', lines: [
    { accountCode: '6600', isDebit: true, fraction: 1 },
    { accountCode: '1600', isDebit: false, fraction: 1 },
  ]},
  { description: 'Prepaid insurance amortization', lines: [
    { accountCode: '6500', isDebit: true, fraction: 1 },
    { accountCode: '1400', isDebit: false, fraction: 1 },
  ]},
  { description: 'Service revenue earned', lines: [
    { accountCode: '2400', isDebit: true, fraction: 1 },
    { accountCode: '4100', isDebit: false, fraction: 1 },
  ]},
  { description: 'Subscription revenue earned', lines: [
    { accountCode: '1100', isDebit: true, fraction: 1 },
    { accountCode: '4200', isDebit: false, fraction: 1 },
  ]},
  { description: 'COGS - inventory consumed', lines: [
    { accountCode: '5000', isDebit: true, fraction: 1 },
    { accountCode: '1200', isDebit: false, fraction: 1 },
  ]},
  { description: 'Monthly rent', lines: [
    { accountCode: '6300', isDebit: true, fraction: 1 },
    { accountCode: '1000', isDebit: false, fraction: 1 },
  ]},
  { description: 'Income tax accrual', lines: [
    { accountCode: '7400', isDebit: true, fraction: 1 },
    { accountCode: '2100', isDebit: false, fraction: 1 },
  ]},
  { description: 'Marketing expense', lines: [
    { accountCode: '6900', isDebit: true, fraction: 1 },
    { accountCode: '2000', isDebit: false, fraction: 1 },
  ]},
  // 3-line patterns
  { description: 'Payroll processing', lines: [
    { accountCode: '6000', isDebit: true, fraction: 0.70 },
    { accountCode: '6200', isDebit: true, fraction: 0.30 },
    { accountCode: '1010', isDebit: false, fraction: 1.00 },
  ]},
  { description: 'Loan payment (principal + interest)', lines: [
    { accountCode: '2600', isDebit: true, fraction: 0.80 },
    { accountCode: '7300', isDebit: true, fraction: 0.20 },
    { accountCode: '1000', isDebit: false, fraction: 1.00 },
  ]},
  { description: 'Revenue with sales tax', lines: [
    { accountCode: '1100', isDebit: true, fraction: 1.00 },
    { accountCode: '4000', isDebit: false, fraction: 0.90 },
    { accountCode: '2300', isDebit: false, fraction: 0.10 },
  ]},
  // 4-line pattern
  { description: 'Office expense allocation', lines: [
    { accountCode: '6700', isDebit: true, fraction: 0.40 },
    { accountCode: '6400', isDebit: true, fraction: 0.30 },
    { accountCode: '7100', isDebit: true, fraction: 0.30 },
    { accountCode: '1000', isDebit: false, fraction: 1.00 },
  ]},
  { description: 'Payroll with benefits', lines: [
    { accountCode: '6000', isDebit: true, fraction: 0.60 },
    { accountCode: '6100', isDebit: true, fraction: 0.20 },
    { accountCode: '6200', isDebit: true, fraction: 0.20 },
    { accountCode: '1010', isDebit: false, fraction: 1.00 },
  ]},
];

function randomAmount(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomDate(year: number, month: number): string {
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = Math.floor(Math.random() * daysInMonth) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function generateJELines(
  entryId: string,
  date: string,
  pattern: JEPattern,
  baseAmount: number
): string[] {
  const debits = pattern.lines.filter(l => l.isDebit);
  const credits = pattern.lines.filter(l => !l.isDebit);

  // Compute debit amounts; last debit absorbs rounding remainder
  const debitAmts: number[] = [];
  let debitSum = 0;
  for (let i = 0; i < debits.length; i++) {
    if (i === debits.length - 1) {
      debitAmts.push(Math.round((baseAmount - debitSum) * 100) / 100);
    } else {
      const a = Math.round(baseAmount * debits[i].fraction * 100) / 100;
      debitAmts.push(a);
      debitSum += a;
    }
  }
  const totalDebit = debitAmts.reduce((s, a) => s + a, 0);

  // Compute credit amounts; last credit absorbs to match total debit exactly
  const creditAmts: number[] = [];
  let creditSum = 0;
  for (let i = 0; i < credits.length; i++) {
    if (i === credits.length - 1) {
      creditAmts.push(Math.round((totalDebit - creditSum) * 100) / 100);
    } else {
      const a = Math.round(totalDebit * credits[i].fraction * 100) / 100;
      creditAmts.push(a);
      creditSum += a;
    }
  }

  const csvLines: string[] = [];
  for (let i = 0; i < debits.length; i++) {
    const acc = CHART_OF_ACCOUNTS.find(a => a.code === debits[i].accountCode)!;
    csvLines.push(
      `${entryId},${date},${acc.code},${acc.name},${debitAmts[i].toFixed(2)},0.00,${pattern.description}`
    );
  }
  for (let i = 0; i < credits.length; i++) {
    const acc = CHART_OF_ACCOUNTS.find(a => a.code === credits[i].accountCode)!;
    csvLines.push(
      `${entryId},${date},${acc.code},${acc.name},0.00,${creditAmts[i].toFixed(2)},${pattern.description}`
    );
  }
  return csvLines;
}

/**
 * Generate a balanced GL CSV with approximately `targetLineCount` lines.
 * @param targetLineCount target number of data rows (excluding header)
 * @param period YYYY-MM format (default "2026-01")
 */
export function generateGL(targetLineCount: number, period: string = '2026-01'): string {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);

  const rows: string[] = ['entry_id,entry_date,account_code,account_name,debit,credit,description'];
  let lineCount = 0;
  let jeIndex = 0;

  while (lineCount < targetLineCount) {
    jeIndex++;
    const entryId = `JE-${String(jeIndex).padStart(6, '0')}`;
    const date = randomDate(year, month);
    const pattern = JE_PATTERNS[Math.floor(Math.random() * JE_PATTERNS.length)];
    const baseAmount = randomAmount(100, 250000);
    const jeLines = generateJELines(entryId, date, pattern, baseAmount);
    rows.push(...jeLines);
    lineCount += jeLines.length;
  }

  return rows.join('\n');
}

/** Generate a GL CSV where debits != credits within a single JE */
export function generateImbalancedGL(period: string = '2026-01'): string {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const date = randomDate(year, month);
  return [
    'entry_id,entry_date,account_code,account_name,debit,credit,description',
    `JE-IMBAL-001,${date},1000,Cash - Operating,10000.00,0.00,Imbalanced entry`,
    `JE-IMBAL-001,${date},4000,Product Revenue,0.00,5000.00,Imbalanced entry`,
  ].join('\n');
}

/** Generate a minimal balanced GL for quick tests (2 entries, 4 lines) */
export function generateMinimalGL(period: string = '2026-01'): string {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const date = randomDate(year, month);
  return [
    'entry_id,entry_date,account_code,account_name,debit,credit,description',
    `JE-MIN-001,${date},1000,Cash - Operating,50000.00,0.00,Initial cash deposit`,
    `JE-MIN-001,${date},3000,Common Stock,0.00,50000.00,Initial cash deposit`,
    `JE-MIN-002,${date},1100,Accounts Receivable,25000.00,0.00,Service revenue recognition`,
    `JE-MIN-002,${date},4100,Service Revenue,0.00,25000.00,Service revenue recognition`,
    `JE-MIN-003,${date},5000,Cost of Goods Sold,15000.00,0.00,COGS for period`,
    `JE-MIN-003,${date},1200,Inventory,0.00,15000.00,COGS for period`,
    `JE-MIN-004,${date},6000,Salaries and Wages,10000.00,0.00,Payroll expense`,
    `JE-MIN-004,${date},1000,Cash - Operating,0.00,10000.00,Payroll expense`,
  ].join('\n');
}

export const GL_PROFILES = [100, 500, 1000, 5000, 10000, 20000, 30000] as const;
