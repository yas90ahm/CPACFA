/**
 * Generate a 50,000-entry GL CSV for load testing.
 * Run: npx tsx tests/load/generate_50k_gl.ts
 * Output: tests/load/gl_50k.csv
 */

import fs from 'fs';
import path from 'path';

const ENTRY_COUNT = 50_000;
const OUTPUT = path.join(__dirname, 'gl_50k.csv');

const ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'debit' },
  { code: '1100', name: 'Accounts Receivable', type: 'debit' },
  { code: '1200', name: 'Inventory', type: 'debit' },
  { code: '1300', name: 'Prepaid Expenses', type: 'debit' },
  { code: '1500', name: 'Fixed Assets', type: 'debit' },
  { code: '1510', name: 'Accumulated Depreciation', type: 'credit' },
  { code: '2000', name: 'Accounts Payable', type: 'credit' },
  { code: '2100', name: 'Accrued Liabilities', type: 'credit' },
  { code: '2200', name: 'Notes Payable', type: 'credit' },
  { code: '2300', name: 'Deferred Revenue', type: 'credit' },
  { code: '3000', name: 'Common Stock', type: 'credit' },
  { code: '3100', name: 'Retained Earnings', type: 'credit' },
  { code: '4000', name: 'Product Revenue', type: 'credit' },
  { code: '4100', name: 'Service Revenue', type: 'credit' },
  { code: '4200', name: 'Other Income', type: 'credit' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'debit' },
  { code: '5100', name: 'Labor Costs', type: 'debit' },
  { code: '6000', name: 'Salaries Expense', type: 'debit' },
  { code: '6100', name: 'Rent Expense', type: 'debit' },
  { code: '6200', name: 'Utilities Expense', type: 'debit' },
  { code: '6300', name: 'Depreciation Expense', type: 'debit' },
  { code: '6400', name: 'Insurance Expense', type: 'debit' },
  { code: '6500', name: 'Marketing Expense', type: 'debit' },
  { code: '6600', name: 'Professional Fees', type: 'debit' },
  { code: '6700', name: 'Travel Expense', type: 'debit' },
  { code: '6800', name: 'Office Supplies', type: 'debit' },
  { code: '7000', name: 'Interest Expense', type: 'debit' },
  { code: '7100', name: 'Tax Expense', type: 'debit' },
];

const DESCRIPTIONS = [
  'Monthly recurring entry',
  'Customer payment received',
  'Vendor invoice payment',
  'Payroll processing',
  'Revenue recognition',
  'Depreciation allocation',
  'Insurance premium',
  'Rent payment',
  'Utility bill payment',
  'Marketing campaign',
  'Professional services',
  'Travel reimbursement',
  'Office supply purchase',
  'Interest accrual',
  'Tax provision',
  'Inventory adjustment',
  'Prepaid amortization',
  'Accrual reversal',
  'Intercompany transfer',
  'Bad debt write-off',
];

function randomAmount(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function randomDate(): string {
  const day = 1 + Math.floor(Math.random() * 28);
  return `2026-01-${String(day).padStart(2, '0')}`;
}

const lines: string[] = ['entry_id,entry_date,account_code,account_name,debit,credit,description'];

let jeNumber = 1;
let linesGenerated = 0;

while (linesGenerated < ENTRY_COUNT) {
  const jeId = `JE${String(jeNumber).padStart(5, '0')}`;
  const date = randomDate();
  const desc = DESCRIPTIONS[Math.floor(Math.random() * DESCRIPTIONS.length)];
  const amount = randomAmount(100, 50000);

  // Each JE has 2 lines (debit + credit) to stay balanced
  const debitAcctIdx = Math.floor(Math.random() * ACCOUNTS.length);
  let creditAcctIdx = Math.floor(Math.random() * ACCOUNTS.length);
  while (creditAcctIdx === debitAcctIdx) creditAcctIdx = Math.floor(Math.random() * ACCOUNTS.length);

  const debitAcct = ACCOUNTS[debitAcctIdx];
  const creditAcct = ACCOUNTS[creditAcctIdx];

  lines.push(`${jeId},${date},${debitAcct.code},${debitAcct.name},${amount.toFixed(2)},0.00,${desc}`);
  lines.push(`${jeId},${date},${creditAcct.code},${creditAcct.name},0.00,${amount.toFixed(2)},${desc}`);

  linesGenerated += 2;
  jeNumber++;
}

fs.writeFileSync(OUTPUT, lines.join('\n'), 'utf-8');
console.log(`Generated ${linesGenerated} GL entries (${jeNumber - 1} journal entries) → ${OUTPUT}`);
console.log(`File size: ${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2)} MB`);
