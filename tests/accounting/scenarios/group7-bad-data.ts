// tests/accounting/scenarios/group7-bad-data.ts — Scenarios 51-55: Bad data handling
import { ScenarioDef, AccountSpec } from './types';
import { computeExpectedTotals } from '../lib';

export function getGroup7Scenarios(): ScenarioDef[] {
  // S51: Imbalanced GL (debits ≠ credits) — expect 207 partial or rejection
  const s51: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',       category: 'asset',     debit: '100000.00', credit: '0.00' },
    { code: '2000', name: 'Account Payable',    category: 'liability', debit: '0.00',      credit: '50000.00' },
    { code: '3000', name: 'Common Stock Equity',category: 'equity',    debit: '0.00',      credit: '30000.00' },
    // Intentionally imbalanced: D=100000, C=80000
    { code: '4000', name: 'Service Revenue',    category: 'revenue',   debit: '0.00',      credit: '0.00' },
  ];

  // S52: Duplicate account codes
  const s52: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',       category: 'asset',     debit: '100000.00', credit: '0.00' },
    { code: '1000', name: 'Cash at Bank Dup',   category: 'asset',     debit: '50000.00',  credit: '0.00' },
    { code: '2000', name: 'Account Payable',    category: 'liability', debit: '0.00',      credit: '100000.00' },
    { code: '3000', name: 'Common Stock Equity',category: 'equity',    debit: '0.00',      credit: '50000.00' },
  ];
  // D: 150000, C: 150000 ✓ (but duplicate code)

  // S53: Unmapped account names (no keyword match → default ASSET)
  const s53: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',       category: 'asset',     debit: '100000.00', credit: '0.00' },
    { code: '9000', name: 'Zzyzx Widget Alpha', category: 'revenue',   debit: '0.00',      credit: '50000.00' }, // no keyword → ASSET default
    { code: '9100', name: 'Qwerty Blorp Beta',  category: 'expense',   debit: '30000.00',  credit: '0.00' },    // no keyword → ASSET default
    { code: '3000', name: 'Common Stock Equity',category: 'equity',    debit: '0.00',      credit: '80000.00' },
  ];
  // D: 100000+30000=130000, C: 50000+80000=130000 ✓
  // But classifier will put 9000 and 9100 as ASSET instead of revenue/expense
  // So the expected totals are DIFFERENT from what category says!
  // 9000: D=0, C=50000, classified as ASSET → signed = 0-50000 = -50000 (debit-positive)
  // 9100: D=30000, C=0, classified as ASSET → signed = 30000
  // So total assets = 100000 + (-50000) + 30000 = 80000
  // Equity = 80000, Revenue = 0, Expenses = 0, NI = 0
  // Total equity = 80000 + 0 = 80000
  // A = L + E → 80000 = 0 + 80000 ✓
  // This tests misclassification behavior

  // S54: Empty GL (no entries at all)
  const s54: AccountSpec[] = [];

  // S55: Negative amounts (revenue with debit balance, expense with credit balance)
  const s55: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',        category: 'asset',     debit: '50000.00',  credit: '0.00' },
    { code: '2000', name: 'Account Payable',     category: 'liability', debit: '0.00',      credit: '20000.00' },
    { code: '3000', name: 'Common Stock Equity', category: 'equity',    debit: '0.00',      credit: '50000.00' },
    { code: '4000', name: 'Service Revenue',     category: 'revenue',   debit: '20000.00',  credit: '0.00' },  // Debit balance revenue (return/refund)
    { code: '5000', name: 'Salary Expense',      category: 'expense',   debit: '0.00',      credit: '20000.00' }, // Credit balance expense (recovery)
    { code: '4100', name: 'Fee Income',          category: 'revenue',   debit: '0.00',      credit: '40000.00' },
  ];
  // D: 50000+20000=70000, C: 20000+50000+20000+40000=130000
  // Diff: 60000 short on debits → add expense
  // Fix: add Interest Expense debit 60000
  // D: 50000+20000+60000=130000, C: 130000 ✓
  // Revenue: Service Revenue = -(20000-0) = -20000 (negative!), Fee Income = 40000 → total = 20000
  // Expense: Salary = -(0-20000) wait no...
  // Expense is debit-positive: signed = debit - credit = 0 - 20000 = -20000 (negative expense)
  // Interest Expense: 60000 - 0 = 60000
  // Total expenses = -20000 + 60000 = 40000
  // NI = 20000 - 40000 = -20000

  return [
    {
      id: 51, name: 'Imbalanced GL',
      group: 'Group 7: Bad Data',
      entityId: 'bad-s51', period: '2080-01',
      accounts: s51,
      expected: {
        totals: computeExpectedTotals(s51),
        expectError: { status: 200 }, // staged for HITL fix (TB not saved to main ledger)
      },
    },

    {
      id: 52, name: 'Duplicate Account Codes',
      group: 'Group 7: Bad Data',
      entityId: 'bad-s52', period: '2080-02',
      accounts: s52,
      expected: {
        totals: computeExpectedTotals(s52),
        balanceSheetEquation: true,
      },
    },

    {
      id: 53, name: 'Unmapped Account Names',
      group: 'Group 7: Bad Data',
      entityId: 'bad-s53', period: '2080-03',
      accounts: s53,
      expected: {
        // Expected with ACTUAL classifier behavior (default ASSET for unknown names)
        totals: {
          totalAssets: '80000.00',   // 100000 + (-50000) + 30000
          totalLiabilities: '0.00',
          totalEquity: '80000.00',   // equity(80000) + NI(0)
          totalRevenue: '0.00',
          totalExpenses: '0.00',
          netIncome: '0.00',
        },
        balanceSheetEquation: true,
      },
    },

    {
      id: 54, name: 'Empty GL',
      group: 'Group 7: Bad Data',
      entityId: 'bad-s54', period: '2080-04',
      accounts: s54,
      expected: {
        totals: { totalAssets: '0.00', totalLiabilities: '0.00', totalEquity: '0.00', totalRevenue: '0.00', totalExpenses: '0.00', netIncome: '0.00' },
        expectError: { status: 400 }, // empty file likely rejected
      },
    },

    (() => {
      // Fixed S55 with balancing entry
      const s55Fixed: AccountSpec[] = [
        { code: '1000', name: 'Cash at Bank',        category: 'asset',     debit: '50000.00',  credit: '0.00' },
        { code: '2000', name: 'Account Payable',     category: 'liability', debit: '0.00',      credit: '20000.00' },
        { code: '3000', name: 'Common Stock Equity', category: 'equity',    debit: '0.00',      credit: '50000.00' },
        { code: '4000', name: 'Service Revenue',     category: 'revenue',   debit: '20000.00',  credit: '0.00' },
        { code: '4100', name: 'Fee Income',          category: 'revenue',   debit: '0.00',      credit: '40000.00' },
        { code: '5000', name: 'Salary Expense',      category: 'expense',   debit: '0.00',      credit: '20000.00' },
        { code: '5100', name: 'Interest Expense',    category: 'expense',   debit: '60000.00',  credit: '0.00' },
      ];
      // D: 50000+20000+60000=130000, C: 20000+50000+40000+20000=130000 ✓
      return {
        id: 55, name: 'Negative Revenue and Expense Balances',
        group: 'Group 7: Bad Data',
        entityId: 'bad-s55', period: '2080-05',
        accounts: s55Fixed,
        expected: {
          totals: computeExpectedTotals(s55Fixed),
          balanceSheetEquation: true,
        },
      };
    })(),
  ];
}
