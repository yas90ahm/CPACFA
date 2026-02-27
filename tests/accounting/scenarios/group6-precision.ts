// tests/accounting/scenarios/group6-precision.ts — Scenarios 43-50: Decimal edge cases
import { ScenarioDef, AccountSpec } from './types';
import { computeExpectedTotals, d, toStr, round2 } from '../lib';

function precisionScenario(id: number, name: string, accounts: AccountSpec[], skipReason?: string): ScenarioDef {
  const totals = computeExpectedTotals(accounts);
  return {
    id, name,
    group: 'Group 6: Decimal Precision',
    entityId: `prec-s${String(id).padStart(2, '0')}`,
    period: `2070-${String(id - 42).padStart(2, '0')}`,
    accounts,
    expected: { totals, balanceSheetEquation: true },
    skipReason,
  };
}

export function getGroup6Scenarios(): ScenarioDef[] {
  // S43: Penny amounts ($0.01)
  const s43: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',       category: 'asset',     debit: '0.03', credit: '0.00' },
    { code: '2000', name: 'Account Payable',    category: 'liability', debit: '0.00', credit: '0.01' },
    { code: '3000', name: 'Common Stock Equity',category: 'equity',    debit: '0.00', credit: '0.01' },
    { code: '4000', name: 'Service Revenue',    category: 'revenue',   debit: '0.00', credit: '0.02' },
    { code: '5000', name: 'Salary Expense',     category: 'expense',   debit: '0.01', credit: '0.00' },
  ];
  // D: 0.03+0.01=0.04, C: 0.01+0.01+0.02=0.04 ✓

  // S44: Large amounts near $1B
  const s44: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',       category: 'asset',     debit: '999999999.99', credit: '0.00' },
    { code: '2000', name: 'Account Payable',    category: 'liability', debit: '0.00',         credit: '500000000.00' },
    { code: '3000', name: 'Common Stock Equity',category: 'equity',    debit: '0.00',         credit: '200000000.00' },
    { code: '4000', name: 'Service Revenue',    category: 'revenue',   debit: '0.00',         credit: '499999999.99' },
    { code: '5000', name: 'Salary Expense',     category: 'expense',   debit: '200000000.00', credit: '0.00' },
  ];
  // D: 999999999.99+200000000.00=1199999999.99
  // C: 500000000.00+200000000.00+499999999.99=1199999999.99 ✓

  // S45: 0.1+0.2=0.3 floating point test
  // Three revenue items that would cause fp issues: 0.10 + 0.20 + 0.30 = 0.60
  const s45: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',       category: 'asset',     debit: '1.00',  credit: '0.00' },
    { code: '3000', name: 'Common Stock Equity',category: 'equity',    debit: '0.00',  credit: '0.40' },
    { code: '4000', name: 'Service Revenue',    category: 'revenue',   debit: '0.00',  credit: '0.10' },
    { code: '4100', name: 'Fee Income',         category: 'revenue',   debit: '0.00',  credit: '0.20' },
    { code: '4200', name: 'Interest Income',    category: 'revenue',   debit: '0.00',  credit: '0.30' },
  ];
  // D: 1.00, C: 0.40+0.10+0.20+0.30=1.00 ✓

  // S46: Zero-balance accounts (debit = credit)
  const s46: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',       category: 'asset',     debit: '50000.00', credit: '0.00' },
    { code: '1100', name: 'Account Receivable',  category: 'asset',     debit: '10000.00', credit: '10000.00' }, // net zero
    { code: '2000', name: 'Account Payable',    category: 'liability', debit: '5000.00',  credit: '5000.00' },  // net zero
    { code: '3000', name: 'Common Stock Equity',category: 'equity',    debit: '0.00',     credit: '20000.00' },
    { code: '4000', name: 'Service Revenue',    category: 'revenue',   debit: '0.00',     credit: '50000.00' },
    { code: '5000', name: 'Salary Expense',     category: 'expense',   debit: '20000.00', credit: '0.00' },
  ];
  // D: 50000+10000+5000+20000=85000, C: 10000+5000+20000+50000=85000 ✓

  // S47: Contra asset netting — Equipment + Accum Depr
  const s47: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',           category: 'asset', debit: '100000.00', credit: '0.00' },
    { code: '1200', name: 'Equipment',               category: 'asset', debit: '500000.00', credit: '0.00' },
    { code: '1201', name: 'Equipment Accum Depr',    category: 'asset', debit: '0.00',      credit: '200000.00' },
    { code: '1300', name: 'Property Asset',           category: 'asset', debit: '300000.00', credit: '0.00' },
    { code: '1301', name: 'Property Accum Depr',      category: 'asset', debit: '0.00',      credit: '100000.00' },
    { code: '2000', name: 'Account Payable',          category: 'liability', debit: '0.00', credit: '100000.00' },
    { code: '3000', name: 'Common Stock Equity',      category: 'equity', debit: '0.00', credit: '200000.00' },
    { code: '4000', name: 'Service Revenue',          category: 'revenue', debit: '0.00', credit: '400000.00' },
    { code: '5000', name: 'Salary Expense',           category: 'expense', debit: '80000.00', credit: '0.00' },
    { code: '5100', name: 'Depreciation Expense',     category: 'expense', debit: '20000.00', credit: '0.00' },
  ];
  // D: 100000+500000+300000+80000+20000=1000000
  // C: 200000+100000+100000+200000+400000=1000000 ✓

  // S48: 200 accounts aggregation
  const s48Accounts: AccountSpec[] = [];
  let s48TotalDebit = d(0);
  let s48TotalCredit = d(0);

  // 50 asset accounts
  for (let i = 0; i < 50; i++) {
    const amt = toStr(round2(d(1000 + i * 100)));
    s48Accounts.push({
      code: `1${String(i).padStart(3, '0')}`,
      name: `Asset Account ${i + 1}`,
      category: 'asset',
      debit: amt,
      credit: '0.00',
    });
    s48TotalDebit = s48TotalDebit.plus(amt);
  }
  // 30 liability accounts
  for (let i = 0; i < 30; i++) {
    const amt = toStr(round2(d(500 + i * 50)));
    s48Accounts.push({
      code: `2${String(i).padStart(3, '0')}`,
      name: `Liability Account ${i + 1}`,
      category: 'liability',
      debit: '0.00',
      credit: amt,
    });
    s48TotalCredit = s48TotalCredit.plus(amt);
  }
  // 10 equity accounts
  for (let i = 0; i < 10; i++) {
    const amt = toStr(round2(d(2000 + i * 200)));
    s48Accounts.push({
      code: `3${String(i).padStart(3, '0')}`,
      name: `Equity Capital Account ${i + 1}`,
      category: 'equity',
      debit: '0.00',
      credit: amt,
    });
    s48TotalCredit = s48TotalCredit.plus(amt);
  }
  // 50 revenue accounts (base 2000 ensures total credits > total debits for positive expenses)
  for (let i = 0; i < 50; i++) {
    const amt = toStr(round2(d(2000 + i * 30)));
    s48Accounts.push({
      code: `4${String(i).padStart(3, '0')}`,
      name: `Revenue Stream ${i + 1}`,
      category: 'revenue',
      debit: '0.00',
      credit: amt,
    });
    s48TotalCredit = s48TotalCredit.plus(amt);
  }
  // 60 expense accounts — compute amount needed to balance
  const expensePerAccount = round2(s48TotalCredit.minus(s48TotalDebit).dividedBy(60));
  for (let i = 0; i < 59; i++) {
    s48Accounts.push({
      code: `5${String(i).padStart(3, '0')}`,
      name: `Expense Category ${i + 1}`,
      category: 'expense',
      debit: toStr(expensePerAccount),
      credit: '0.00',
    });
    s48TotalDebit = s48TotalDebit.plus(expensePerAccount);
  }
  // Last expense absorbs rounding
  const lastExpenseAmt = toStr(round2(s48TotalCredit.minus(s48TotalDebit)));
  s48Accounts.push({
    code: '5059',
    name: 'Expense Category 60',
    category: 'expense',
    debit: lastExpenseAmt,
    credit: '0.00',
  });

  // S49: Repeating decimals (1/3 amounts)
  const s49: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',       category: 'asset',     debit: '100.00', credit: '0.00' },
    { code: '3000', name: 'Common Stock Equity',category: 'equity',    debit: '0.00',   credit: '0.01' },
    { code: '4000', name: 'Service Revenue',    category: 'revenue',   debit: '0.00',   credit: '33.33' },
    { code: '4100', name: 'Fee Income',         category: 'revenue',   debit: '0.00',   credit: '33.33' },
    { code: '4200', name: 'Interest Income',    category: 'revenue',   debit: '0.00',   credit: '33.33' },
  ];
  // D: 100.00, C: 0.01+33.33+33.33+33.33=99.99+0.01=100.00 ✓

  // S50: All-zero GL (no activity)
  const s50: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',       category: 'asset',     debit: '0.00', credit: '0.00' },
    { code: '2000', name: 'Account Payable',    category: 'liability', debit: '0.00', credit: '0.00' },
    { code: '3000', name: 'Common Stock Equity',category: 'equity',    debit: '0.00', credit: '0.00' },
    { code: '4000', name: 'Service Revenue',    category: 'revenue',   debit: '0.00', credit: '0.00' },
    { code: '5000', name: 'Salary Expense',     category: 'expense',   debit: '0.00', credit: '0.00' },
  ];

  return [
    precisionScenario(43, 'Penny Amounts ($0.01)', s43),
    precisionScenario(44, 'Near Billion Dollar Amounts', s44),
    precisionScenario(45, 'Floating Point 0.1+0.2=0.3 Test', s45),
    precisionScenario(46, 'Zero Balance Accounts', s46),
    precisionScenario(47, 'Contra Asset Netting', s47),
    precisionScenario(48, '200 Account Aggregation', s48Accounts),
    precisionScenario(49, 'Repeating Decimal Amounts', s49),
    precisionScenario(50, 'All-Zero GL No Activity', s50),
  ];
}
