// tests/accounting/scenarios/group5-ties.ts — Scenarios 37-42: Cross-statement ties
import Decimal from 'decimal.js';
import { ScenarioDef, AccountSpec } from './types';
import { computeExpectedTotals } from '../lib';

function tieScenario(id: number, name: string, accounts: AccountSpec[], priorAccounts?: AccountSpec[]): ScenarioDef {
  const totals = computeExpectedTotals(accounts);
  const def: ScenarioDef = {
    id, name,
    group: 'Group 5: Cross-Statement Ties',
    entityId: `tie-s${String(id).padStart(2, '0')}`,
    period: `2060-${String(id - 36).padStart(2, '0')}`,
    accounts,
    expected: { totals, balanceSheetEquation: true },
  };
  if (priorAccounts) {
    const priorMonth = id - 36;
    def.priorPeriod = {
      period: `2059-${String(12 - (6 - priorMonth)).padStart(2, '0')}`,
      accounts: priorAccounts,
    };
    // Add cash flow expected values
    const cashAcct = accounts.find(a => a.name.toLowerCase().includes('cash'));
    if (cashAcct) {
      def.expected.cashFlow = {
        endingCash: computeSignedAmountForAcct(cashAcct),
      };
    }
  }
  return def;
}

function computeSignedAmountForAcct(acct: AccountSpec): string {
  const net = new Decimal(acct.debit).minus(acct.credit);
  const signed = (acct.category === 'liability' || acct.category === 'equity' || acct.category === 'revenue')
    ? net.negated() : net;
  return signed.toFixed(2);
}

export function getGroup5Scenarios(): ScenarioDef[] {
  // S37: BS equation verification (simple)
  const s37Accounts: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',          category: 'asset',     debit: '100000.00', credit: '0.00' },
    { code: '1100', name: 'Account Receivable',     category: 'asset',     debit: '50000.00',  credit: '0.00' },
    { code: '2000', name: 'Account Payable',        category: 'liability', debit: '0.00',      credit: '30000.00' },
    { code: '3000', name: 'Common Stock Equity',    category: 'equity',    debit: '0.00',      credit: '50000.00' },
    { code: '4000', name: 'Service Revenue',        category: 'revenue',   debit: '0.00',      credit: '120000.00' },
    { code: '5000', name: 'Salary Expense',         category: 'expense',   debit: '50000.00',  credit: '0.00' },
  ];
  // D: 100000+50000+50000=200000, C: 30000+50000+120000=200000 ✓

  // S38: Net Income tie (P&L NI = BS equity component)
  const s38Accounts: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',           category: 'asset',     debit: '500000.00', credit: '0.00' },
    { code: '1100', name: 'Account Receivable',      category: 'asset',     debit: '200000.00', credit: '0.00' },
    { code: '1200', name: 'Equipment',               category: 'asset',     debit: '300000.00', credit: '0.00' },
    { code: '2000', name: 'Account Payable',         category: 'liability', debit: '0.00',      credit: '200000.00' },
    { code: '2100', name: 'Loan Payable',            category: 'liability', debit: '0.00',      credit: '300000.00' },
    { code: '3000', name: 'Common Stock Equity',     category: 'equity',    debit: '0.00',      credit: '200000.00' },
    { code: '4000', name: 'Service Revenue',         category: 'revenue',   debit: '0.00',      credit: '500000.00' },
    { code: '4100', name: 'Interest Income',         category: 'revenue',   debit: '0.00',      credit: '50000.00' },
    { code: '5000', name: 'Salary Expense',          category: 'expense',   debit: '200000.00', credit: '0.00' },
    { code: '5100', name: 'Rent Expense',            category: 'expense',   debit: '100000.00', credit: '0.00' },
    { code: '5200', name: 'Depreciation Expense',    category: 'expense',   debit: '50000.00',  credit: '0.00' },
  ];
  // D: 500000+200000+300000+200000+100000+50000=1350000
  // C: 200000+300000+200000+500000+50000+0=1250000
  // Diff: 100000 → fix: increase revenue to 600000
  // C: 200000+300000+200000+600000+50000=1350000 ✓

  // S39: With prior period for CF ending cash = BS cash tie
  const s39Prior: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',          category: 'asset',     debit: '80000.00',  credit: '0.00' },
    { code: '1100', name: 'Account Receivable',     category: 'asset',     debit: '40000.00',  credit: '0.00' },
    { code: '2000', name: 'Account Payable',        category: 'liability', debit: '0.00',      credit: '20000.00' },
    { code: '3000', name: 'Common Stock Equity',    category: 'equity',    debit: '0.00',      credit: '50000.00' },
    { code: '4000', name: 'Service Revenue',        category: 'revenue',   debit: '0.00',      credit: '100000.00' },
    { code: '5000', name: 'Salary Expense',         category: 'expense',   debit: '50000.00',  credit: '0.00' },
  ];
  // D: 80000+40000+50000=170000, C: 20000+50000+100000=170000 ✓

  const s39Current: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',          category: 'asset',     debit: '120000.00', credit: '0.00' },
    { code: '1100', name: 'Account Receivable',     category: 'asset',     debit: '60000.00',  credit: '0.00' },
    { code: '2000', name: 'Account Payable',        category: 'liability', debit: '0.00',      credit: '30000.00' },
    { code: '3000', name: 'Common Stock Equity',    category: 'equity',    debit: '0.00',      credit: '50000.00' },
    { code: '4000', name: 'Service Revenue',        category: 'revenue',   debit: '0.00',      credit: '150000.00' },
    { code: '5000', name: 'Salary Expense',         category: 'expense',   debit: '50000.00',  credit: '0.00' },
  ];
  // D: 120000+60000+50000=230000, C: 30000+50000+150000=230000 ✓

  // S40: Equity closing = BS total equity
  const s40Accounts: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',          category: 'asset',     debit: '300000.00', credit: '0.00' },
    { code: '1100', name: 'Account Receivable',     category: 'asset',     debit: '100000.00', credit: '0.00' },
    { code: '2000', name: 'Account Payable',        category: 'liability', debit: '0.00',      credit: '100000.00' },
    { code: '3000', name: 'Common Stock Equity',    category: 'equity',    debit: '0.00',      credit: '100000.00' },
    { code: '3100', name: 'Retained Earnings',      category: 'equity',    debit: '0.00',      credit: '50000.00' },
    { code: '4000', name: 'Service Revenue',        category: 'revenue',   debit: '0.00',      credit: '250000.00' },
    { code: '5000', name: 'Salary Expense',         category: 'expense',   debit: '80000.00',  credit: '0.00' },
    { code: '5100', name: 'Rent Expense',           category: 'expense',   debit: '20000.00',  credit: '0.00' },
  ];
  // D: 300000+100000+80000+20000=500000, C: 100000+100000+50000+250000=500000 ✓

  // S41: Multi-revenue/expense breakdown
  const s41Accounts: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',          category: 'asset',     debit: '200000.00', credit: '0.00' },
    { code: '1100', name: 'Account Receivable',     category: 'asset',     debit: '150000.00', credit: '0.00' },
    { code: '1200', name: 'Inventory',               category: 'asset',     debit: '100000.00', credit: '0.00' },
    { code: '2000', name: 'Account Payable',         category: 'liability', debit: '0.00',      credit: '80000.00' },
    { code: '2100', name: 'Accrued Liability',        category: 'liability', debit: '0.00',      credit: '20000.00' },
    { code: '3000', name: 'Common Stock Equity',     category: 'equity',    debit: '0.00',      credit: '100000.00' },
    { code: '4000', name: 'Product Sales Revenue',   category: 'revenue',   debit: '0.00',      credit: '300000.00' },
    { code: '4100', name: 'Service Revenue',         category: 'revenue',   debit: '0.00',      credit: '100000.00' },
    { code: '4200', name: 'Interest Income',         category: 'revenue',   debit: '0.00',      credit: '10000.00' },
    { code: '5000', name: 'Cost of Goods Sold Expense', category: 'expense', debit: '150000.00', credit: '0.00' },
    { code: '5100', name: 'Salary Expense',          category: 'expense',   debit: '100000.00', credit: '0.00' },
    { code: '5200', name: 'Rent Expense',            category: 'expense',   debit: '50000.00',  credit: '0.00' },
    { code: '5300', name: 'Depreciation Expense',    category: 'expense',   debit: '10000.00',  credit: '0.00' },
    { code: '5400', name: 'Utility Expense',         category: 'expense',   debit: '10000.00',  credit: '0.00' },
    { code: '5500', name: 'Insurance Expense',       category: 'expense',   debit: '30000.00',  credit: '0.00' },
  ];
  // D: 200000+150000+100000+150000+100000+50000+10000+10000+30000=800000
  // C: 80000+20000+100000+300000+100000+10000=610000
  // Diff: 190000 → increase: Accrued Liability to 210000
  // C: 80000+210000+100000+300000+100000+10000=800000 ✓

  // S42: Negative equity (accumulated losses exceed equity)
  const s42Accounts: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',          category: 'asset',     debit: '50000.00',  credit: '0.00' },
    { code: '1100', name: 'Account Receivable',     category: 'asset',     debit: '30000.00',  credit: '0.00' },
    { code: '2000', name: 'Account Payable',        category: 'liability', debit: '0.00',      credit: '50000.00' },
    { code: '2100', name: 'Loan Payable',           category: 'liability', debit: '0.00',      credit: '100000.00' },
    { code: '3000', name: 'Common Stock Equity',    category: 'equity',    debit: '0.00',      credit: '10000.00' },
    { code: '4000', name: 'Service Revenue',        category: 'revenue',   debit: '0.00',      credit: '20000.00' },
    { code: '5000', name: 'Salary Expense',         category: 'expense',   debit: '80000.00',  credit: '0.00' },
    { code: '5100', name: 'Rent Expense',           category: 'expense',   debit: '20000.00',  credit: '0.00' },
  ];
  // D: 50000+30000+80000+20000=180000, C: 50000+100000+10000+20000=180000 ✓
  // Revenue: 20000, Expenses: 100000, NI: -80000
  // Equity = 10000 + (-80000) = -70000
  // A=80000, L=150000, E=-70000 → 80000 = 150000 + (-70000) = 80000 ✓

  return [
    tieScenario(37, 'BS Equation A=L+E Simple', s37Accounts),

    (() => {
      // Fix s38 balance
      const fixed38: AccountSpec[] = [
        { code: '1000', name: 'Cash at Bank',           category: 'asset',     debit: '500000.00', credit: '0.00' },
        { code: '1100', name: 'Account Receivable',      category: 'asset',     debit: '200000.00', credit: '0.00' },
        { code: '1200', name: 'Equipment',               category: 'asset',     debit: '300000.00', credit: '0.00' },
        { code: '2000', name: 'Account Payable',         category: 'liability', debit: '0.00',      credit: '200000.00' },
        { code: '2100', name: 'Loan Payable',            category: 'liability', debit: '0.00',      credit: '300000.00' },
        { code: '3000', name: 'Common Stock Equity',     category: 'equity',    debit: '0.00',      credit: '200000.00' },
        { code: '4000', name: 'Service Revenue',         category: 'revenue',   debit: '0.00',      credit: '600000.00' },
        { code: '4100', name: 'Interest Income',         category: 'revenue',   debit: '0.00',      credit: '50000.00' },
        { code: '5000', name: 'Salary Expense',          category: 'expense',   debit: '200000.00', credit: '0.00' },
        { code: '5100', name: 'Rent Expense',            category: 'expense',   debit: '100000.00', credit: '0.00' },
        { code: '5200', name: 'Depreciation Expense',    category: 'expense',   debit: '50000.00',  credit: '0.00' },
      ];
      return tieScenario(38, 'Net Income Tie P&L to BS', fixed38);
    })(),

    tieScenario(39, 'Cash Flow Ending Cash = BS Cash', s39Current, s39Prior),

    tieScenario(40, 'Equity Closing = BS Total Equity', s40Accounts),

    (() => {
      // Fix s41 balance
      const fixed41: AccountSpec[] = [
        { code: '1000', name: 'Cash at Bank',          category: 'asset',     debit: '200000.00', credit: '0.00' },
        { code: '1100', name: 'Account Receivable',     category: 'asset',     debit: '150000.00', credit: '0.00' },
        { code: '1200', name: 'Inventory',               category: 'asset',     debit: '100000.00', credit: '0.00' },
        { code: '2000', name: 'Account Payable',         category: 'liability', debit: '0.00',      credit: '80000.00' },
        { code: '2100', name: 'Accrued Liability',        category: 'liability', debit: '0.00',      credit: '210000.00' },
        { code: '3000', name: 'Common Stock Equity',     category: 'equity',    debit: '0.00',      credit: '100000.00' },
        { code: '4000', name: 'Product Sales Revenue',   category: 'revenue',   debit: '0.00',      credit: '300000.00' },
        { code: '4100', name: 'Service Revenue',         category: 'revenue',   debit: '0.00',      credit: '100000.00' },
        { code: '4200', name: 'Interest Income',         category: 'revenue',   debit: '0.00',      credit: '10000.00' },
        { code: '5000', name: 'Cost of Goods Sold Expense', category: 'expense', debit: '150000.00', credit: '0.00' },
        { code: '5100', name: 'Salary Expense',          category: 'expense',   debit: '100000.00', credit: '0.00' },
        { code: '5200', name: 'Rent Expense',            category: 'expense',   debit: '50000.00',  credit: '0.00' },
        { code: '5300', name: 'Depreciation Expense',    category: 'expense',   debit: '10000.00',  credit: '0.00' },
        { code: '5400', name: 'Utility Expense',         category: 'expense',   debit: '10000.00',  credit: '0.00' },
        { code: '5500', name: 'Insurance Expense',       category: 'expense',   debit: '30000.00',  credit: '0.00' },
      ];
      return tieScenario(41, 'Multi Revenue/Expense Breakdown Tie', fixed41);
    })(),

    tieScenario(42, 'Negative Equity (Net Loss > Equity)', s42Accounts),
  ];
}
