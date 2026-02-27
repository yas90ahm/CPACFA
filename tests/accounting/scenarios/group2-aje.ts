// tests/accounting/scenarios/group2-aje.ts — Scenarios 11-20: AJE Effects
import { ScenarioDef, AccountSpec, AJESpec } from './types';
import { computeExpectedTotals } from '../lib';

// Base GL for all AJE scenarios — simple balanced set
const baseAccounts: AccountSpec[] = [
  { code: '1000', name: 'Cash at Bank',           category: 'asset',     debit: '500000.00', credit: '0.00' },
  { code: '1100', name: 'Account Receivable',      category: 'asset',     debit: '200000.00', credit: '0.00' },
  { code: '1200', name: 'Prepaid Insurance Asset',  category: 'asset',     debit: '24000.00',  credit: '0.00' },
  { code: '1300', name: 'Equipment',               category: 'asset',     debit: '300000.00', credit: '0.00' },
  { code: '1301', name: 'Equipment Accum Depr',    category: 'asset',     debit: '0.00',      credit: '60000.00' },
  { code: '2000', name: 'Account Payable',         category: 'liability', debit: '0.00',      credit: '150000.00' },
  { code: '2100', name: 'Accrued Salary Payable',  category: 'liability', debit: '0.00',      credit: '50000.00' },
  { code: '2200', name: 'Loan Payable',            category: 'liability', debit: '0.00',      credit: '200000.00' },
  { code: '3000', name: 'Common Stock Equity',     category: 'equity',    debit: '0.00',      credit: '300000.00' },
  { code: '3100', name: 'Retained Earnings',       category: 'equity',    debit: '0.00',      credit: '64000.00' },
  { code: '4000', name: 'Service Revenue',         category: 'revenue',   debit: '0.00',      credit: '600000.00' },
  { code: '5000', name: 'Salary Expense',          category: 'expense',   debit: '250000.00', credit: '0.00' },
  { code: '5100', name: 'Rent Expense',            category: 'expense',   debit: '80000.00',  credit: '0.00' },
  { code: '5200', name: 'Depreciation Expense',    category: 'expense',   debit: '60000.00',  credit: '0.00' },
  { code: '5300', name: 'Interest Expense',        category: 'expense',   debit: '10000.00',  credit: '0.00' },
];
// D: 500000+200000+24000+300000+250000+80000+60000+10000=1424000
// C: 60000+150000+50000+200000+300000+64000+600000=1424000 ✓

function ajeScenario(id: number, name: string, ajes: AJESpec[]): ScenarioDef {
  const totals = computeExpectedTotals(baseAccounts, ajes);
  return {
    id, name,
    group: 'Group 2: AJE Effects',
    entityId: `aje-s${String(id).padStart(2, '0')}`,
    period: `2041-${String(id - 10).padStart(2, '0')}`,
    accounts: baseAccounts,
    ajes,
    expected: { totals, balanceSheetEquation: true },
  };
}

export function getGroup2Scenarios(): ScenarioDef[] {
  return [
    // S11: Single depreciation AJE
    ajeScenario(11, 'Single Depreciation AJE', [
      {
        memo: 'Monthly depreciation on equipment',
        lines: [
          { accountRef: '5200', debit: 5000, credit: 0, description: 'Depreciation expense' },
          { accountRef: '1301', debit: 0, credit: 5000, description: 'Accum depreciation' },
        ],
      },
    ]),

    // S12: Accrued salary AJE
    ajeScenario(12, 'Accrued Salary AJE', [
      {
        memo: 'Accrue monthly salaries earned but not paid',
        lines: [
          { accountRef: '5000', debit: 25000, credit: 0, description: 'Salary expense accrual' },
          { accountRef: '2100', debit: 0, credit: 25000, description: 'Accrued salary payable' },
        ],
      },
    ]),

    // S13: Prepaid insurance amortization
    ajeScenario(13, 'Prepaid Insurance Amortization', [
      {
        memo: 'Monthly insurance amortization 24000/12=2000',
        lines: [
          { accountRef: '5300', debit: 2000, credit: 0, description: 'Insurance expense' },
          { accountRef: '1200', debit: 0, credit: 2000, description: 'Reduce prepaid' },
        ],
      },
    ]),

    // S14: Revenue accrual
    ajeScenario(14, 'Revenue Accrual AJE', [
      {
        memo: 'Accrue unbilled revenue for services performed',
        lines: [
          { accountRef: '1100', debit: 15000, credit: 0, description: 'Unbilled receivable' },
          { accountRef: '4000', debit: 0, credit: 15000, description: 'Accrued revenue' },
        ],
      },
    ]),

    // S15: Reclassification AJE (no P&L impact)
    ajeScenario(15, 'Reclassification AJE', [
      {
        memo: 'Reclassify short-term portion of long-term debt',
        lines: [
          { accountRef: '2200', debit: 50000, credit: 0, description: 'Reduce long-term debt' },
          { accountRef: '2000', debit: 0, credit: 50000, description: 'Current portion of debt' },
        ],
      },
    ]),

    // S16: Multiple stacking AJEs
    ajeScenario(16, 'Multiple Stacking AJEs', [
      {
        memo: 'Depreciation adjustment',
        lines: [
          { accountRef: '5200', debit: 5000, credit: 0 },
          { accountRef: '1301', debit: 0, credit: 5000 },
        ],
      },
      {
        memo: 'Salary accrual',
        lines: [
          { accountRef: '5000', debit: 25000, credit: 0 },
          { accountRef: '2100', debit: 0, credit: 25000 },
        ],
      },
      {
        memo: 'Prepaid amortization',
        lines: [
          { accountRef: '5300', debit: 2000, credit: 0 },
          { accountRef: '1200', debit: 0, credit: 2000 },
        ],
      },
    ]),

    // S17: Large AJE (10% of revenue)
    ajeScenario(17, 'Large Revenue Adjustment AJE', [
      {
        memo: 'Correct revenue recognition error from prior month',
        lines: [
          { accountRef: '4000', debit: 60000, credit: 0, description: 'Reduce overstated revenue' },
          { accountRef: '2000', debit: 0, credit: 60000, description: 'Liability for refunds' },
        ],
      },
    ]),

    // S18: Penny-level AJE
    ajeScenario(18, 'Penny-Level Rounding AJE', [
      {
        memo: 'Correct rounding difference in interest calculation',
        lines: [
          { accountRef: '5300', debit: 0.01, credit: 0, description: 'Interest rounding' },
          { accountRef: '2000', debit: 0, credit: 0.01, description: 'Rounding payable' },
        ],
      },
    ]),

    // S19: Multi-line compound AJE
    ajeScenario(19, 'Multi-Line Compound AJE', [
      {
        memo: 'Month-end comprehensive adjustments',
        lines: [
          { accountRef: '5200', debit: 5000, credit: 0, description: 'Depreciation' },
          { accountRef: '5000', debit: 10000, credit: 0, description: 'Salary accrual' },
          { accountRef: '5300', debit: 2000, credit: 0, description: 'Interest accrual' },
          { accountRef: '1301', debit: 0, credit: 5000, description: 'Accum depr' },
          { accountRef: '2100', debit: 0, credit: 10000, description: 'Salary payable' },
          { accountRef: '2200', debit: 0, credit: 2000, description: 'Interest payable' },
        ],
      },
    ]),

    // S20: Twenty stacked AJEs
    (() => {
      const ajes: AJESpec[] = [];
      for (let i = 1; i <= 20; i++) {
        ajes.push({
          memo: `Stacked AJE #${i}: salary accrual batch`,
          lines: [
            { accountRef: '5000', debit: 1000, credit: 0, description: `Salary batch ${i}` },
            { accountRef: '2100', debit: 0, credit: 1000, description: `Payable batch ${i}` },
          ],
        });
      }
      return ajeScenario(20, 'Twenty Stacked AJEs', ajes);
    })(),
  ];
}
