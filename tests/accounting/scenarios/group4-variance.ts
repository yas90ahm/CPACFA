// tests/accounting/scenarios/group4-variance.ts — Scenarios 29-36: Two-period variance
import { ScenarioDef, AccountSpec } from './types';
import { computeExpectedTotals } from '../lib';

function varianceScenario(
  id: number,
  name: string,
  priorAccounts: AccountSpec[],
  currentAccounts: AccountSpec[],
): ScenarioDef {
  const currentTotals = computeExpectedTotals(currentAccounts);
  return {
    id, name,
    group: 'Group 4: Variance',
    entityId: `var-s${String(id).padStart(2, '0')}`,
    period: `20${50 + id - 29}-02`,
    accounts: currentAccounts,
    priorPeriod: {
      period: `20${50 + id - 29}-01`,
      accounts: priorAccounts,
    },
    expected: {
      totals: currentTotals,
      balanceSheetEquation: true,
    },
  };
}

export function getGroup4Scenarios(): ScenarioDef[] {
  // Common prior period base accounts
  // D: 200000+100000+300000+150000+60000+40000=850000
  // C: 100000+200000+150000+400000=850000 ✓
  const priorBase: AccountSpec[] = [
    { code: '1000', name: 'Cash at Bank',           category: 'asset',     debit: '200000.00', credit: '0.00' },
    { code: '1100', name: 'Account Receivable',      category: 'asset',     debit: '100000.00', credit: '0.00' },
    { code: '1200', name: 'Equipment',               category: 'asset',     debit: '300000.00', credit: '0.00' },
    { code: '2000', name: 'Account Payable',         category: 'liability', debit: '0.00',      credit: '100000.00' },
    { code: '2100', name: 'Loan Payable',            category: 'liability', debit: '0.00',      credit: '200000.00' },
    { code: '3000', name: 'Common Stock Equity',     category: 'equity',    debit: '0.00',      credit: '150000.00' },
    { code: '4000', name: 'Service Revenue',         category: 'revenue',   debit: '0.00',      credit: '400000.00' },
    { code: '5000', name: 'Salary Expense',          category: 'expense',   debit: '150000.00', credit: '0.00' },
    { code: '5100', name: 'Rent Expense',            category: 'expense',   debit: '60000.00',  credit: '0.00' },
    { code: '5200', name: 'Depreciation Expense',    category: 'expense',   debit: '40000.00',  credit: '0.00' },
  ];

  return [
    // S29: Revenue Growth 10%
    // D: 230000+110000+300000+150000+60000+40000=890000
    // C: 100000+200000+150000+440000=890000 ✓
    varianceScenario(29, 'Revenue Growth 10%', priorBase, [
      { code: '1000', name: 'Cash at Bank',         category: 'asset',     debit: '230000.00', credit: '0.00' },
      { code: '1100', name: 'Account Receivable',    category: 'asset',     debit: '110000.00', credit: '0.00' },
      { code: '1200', name: 'Equipment',             category: 'asset',     debit: '300000.00', credit: '0.00' },
      { code: '2000', name: 'Account Payable',       category: 'liability', debit: '0.00',      credit: '100000.00' },
      { code: '2100', name: 'Loan Payable',          category: 'liability', debit: '0.00',      credit: '200000.00' },
      { code: '3000', name: 'Common Stock Equity',   category: 'equity',    debit: '0.00',      credit: '150000.00' },
      { code: '4000', name: 'Service Revenue',       category: 'revenue',   debit: '0.00',      credit: '440000.00' },
      { code: '5000', name: 'Salary Expense',        category: 'expense',   debit: '150000.00', credit: '0.00' },
      { code: '5100', name: 'Rent Expense',          category: 'expense',   debit: '60000.00',  credit: '0.00' },
      { code: '5200', name: 'Depreciation Expense',  category: 'expense',   debit: '40000.00',  credit: '0.00' },
    ]),

    // S30: Expense Spike 50%
    // D: 125000+100000+300000+225000+60000+40000=850000
    // C: 100000+200000+150000+400000=850000 ✓
    varianceScenario(30, 'Expense Spike 50%', priorBase, [
      { code: '1000', name: 'Cash at Bank',         category: 'asset',     debit: '125000.00', credit: '0.00' },
      { code: '1100', name: 'Account Receivable',    category: 'asset',     debit: '100000.00', credit: '0.00' },
      { code: '1200', name: 'Equipment',             category: 'asset',     debit: '300000.00', credit: '0.00' },
      { code: '2000', name: 'Account Payable',       category: 'liability', debit: '0.00',      credit: '100000.00' },
      { code: '2100', name: 'Loan Payable',          category: 'liability', debit: '0.00',      credit: '200000.00' },
      { code: '3000', name: 'Common Stock Equity',   category: 'equity',    debit: '0.00',      credit: '150000.00' },
      { code: '4000', name: 'Service Revenue',       category: 'revenue',   debit: '0.00',      credit: '400000.00' },
      { code: '5000', name: 'Salary Expense',        category: 'expense',   debit: '225000.00', credit: '0.00' },
      { code: '5100', name: 'Rent Expense',          category: 'expense',   debit: '60000.00',  credit: '0.00' },
      { code: '5200', name: 'Depreciation Expense',  category: 'expense',   debit: '40000.00',  credit: '0.00' },
    ]),

    // S31: New Account in Current Period
    // D: 180000+100000+300000+20000+150000+60000+40000=850000
    // C: 100000+200000+150000+400000=850000 ✓
    varianceScenario(31, 'New Account in Current Period', priorBase, [
      { code: '1000', name: 'Cash at Bank',         category: 'asset',     debit: '180000.00', credit: '0.00' },
      { code: '1100', name: 'Account Receivable',    category: 'asset',     debit: '100000.00', credit: '0.00' },
      { code: '1200', name: 'Equipment',             category: 'asset',     debit: '300000.00', credit: '0.00' },
      { code: '1400', name: 'Prepaid Asset',          category: 'asset',     debit: '20000.00',  credit: '0.00' },
      { code: '2000', name: 'Account Payable',       category: 'liability', debit: '0.00',      credit: '100000.00' },
      { code: '2100', name: 'Loan Payable',          category: 'liability', debit: '0.00',      credit: '200000.00' },
      { code: '3000', name: 'Common Stock Equity',   category: 'equity',    debit: '0.00',      credit: '150000.00' },
      { code: '4000', name: 'Service Revenue',       category: 'revenue',   debit: '0.00',      credit: '400000.00' },
      { code: '5000', name: 'Salary Expense',        category: 'expense',   debit: '150000.00', credit: '0.00' },
      { code: '5100', name: 'Rent Expense',          category: 'expense',   debit: '60000.00',  credit: '0.00' },
      { code: '5200', name: 'Depreciation Expense',  category: 'expense',   debit: '40000.00',  credit: '0.00' },
    ]),

    // S32: Revenue Decline 25%
    // D: 150000+75000+300000+150000+50000+25000=750000
    // C: 100000+200000+150000+300000=750000 ✓
    varianceScenario(32, 'Revenue Decline 25%', priorBase, [
      { code: '1000', name: 'Cash at Bank',         category: 'asset',     debit: '150000.00', credit: '0.00' },
      { code: '1100', name: 'Account Receivable',    category: 'asset',     debit: '75000.00',  credit: '0.00' },
      { code: '1200', name: 'Equipment',             category: 'asset',     debit: '300000.00', credit: '0.00' },
      { code: '2000', name: 'Account Payable',       category: 'liability', debit: '0.00',      credit: '100000.00' },
      { code: '2100', name: 'Loan Payable',          category: 'liability', debit: '0.00',      credit: '200000.00' },
      { code: '3000', name: 'Common Stock Equity',   category: 'equity',    debit: '0.00',      credit: '150000.00' },
      { code: '4000', name: 'Service Revenue',       category: 'revenue',   debit: '0.00',      credit: '300000.00' },
      { code: '5000', name: 'Salary Expense',        category: 'expense',   debit: '150000.00', credit: '0.00' },
      { code: '5100', name: 'Rent Expense',          category: 'expense',   debit: '50000.00',  credit: '0.00' },
      { code: '5200', name: 'Depreciation Expense',  category: 'expense',   debit: '25000.00',  credit: '0.00' },
    ]),

    // S33: Comprehensive Variance All Accounts
    // D: 250000+120000+350000+160000+70000+10000=960000
    // C: 130000+180000+150000+500000=960000 ✓
    varianceScenario(33, 'Comprehensive Variance All Accounts', priorBase, [
      { code: '1000', name: 'Cash at Bank',         category: 'asset',     debit: '250000.00', credit: '0.00' },
      { code: '1100', name: 'Account Receivable',    category: 'asset',     debit: '120000.00', credit: '0.00' },
      { code: '1200', name: 'Equipment',             category: 'asset',     debit: '350000.00', credit: '0.00' },
      { code: '2000', name: 'Account Payable',       category: 'liability', debit: '0.00',      credit: '130000.00' },
      { code: '2100', name: 'Loan Payable',          category: 'liability', debit: '0.00',      credit: '180000.00' },
      { code: '3000', name: 'Common Stock Equity',   category: 'equity',    debit: '0.00',      credit: '150000.00' },
      { code: '4000', name: 'Service Revenue',       category: 'revenue',   debit: '0.00',      credit: '500000.00' },
      { code: '5000', name: 'Salary Expense',        category: 'expense',   debit: '160000.00', credit: '0.00' },
      { code: '5100', name: 'Rent Expense',          category: 'expense',   debit: '70000.00',  credit: '0.00' },
      { code: '5200', name: 'Depreciation Expense',  category: 'expense',   debit: '10000.00',  credit: '0.00' },
    ]),

    // S34: Zero Change Flat Period (identical to prior)
    varianceScenario(34, 'Zero Change Flat Period', priorBase, [...priorBase]),

    // S35: Account Removed in Current (no depreciation expense)
    // D: 240000+100000+300000+150000+60000=850000
    // C: 100000+200000+150000+400000=850000 ✓
    varianceScenario(35, 'Account Removed in Current Period', priorBase, [
      { code: '1000', name: 'Cash at Bank',         category: 'asset',     debit: '240000.00', credit: '0.00' },
      { code: '1100', name: 'Account Receivable',    category: 'asset',     debit: '100000.00', credit: '0.00' },
      { code: '1200', name: 'Equipment',             category: 'asset',     debit: '300000.00', credit: '0.00' },
      { code: '2000', name: 'Account Payable',       category: 'liability', debit: '0.00',      credit: '100000.00' },
      { code: '2100', name: 'Loan Payable',          category: 'liability', debit: '0.00',      credit: '200000.00' },
      { code: '3000', name: 'Common Stock Equity',   category: 'equity',    debit: '0.00',      credit: '150000.00' },
      { code: '4000', name: 'Service Revenue',       category: 'revenue',   debit: '0.00',      credit: '400000.00' },
      { code: '5000', name: 'Salary Expense',        category: 'expense',   debit: '150000.00', credit: '0.00' },
      { code: '5100', name: 'Rent Expense',          category: 'expense',   debit: '60000.00',  credit: '0.00' },
    ]),

    // S36: Net Loss in Current Period
    // D: 100000+50000+300000+150000+100000+50000=750000
    // C: 200000+200000+150000+200000=750000 ✓
    // Rev: 200000, Exp: 300000, NI: -100000
    varianceScenario(36, 'Net Loss in Current Period', priorBase, [
      { code: '1000', name: 'Cash at Bank',         category: 'asset',     debit: '100000.00', credit: '0.00' },
      { code: '1100', name: 'Account Receivable',    category: 'asset',     debit: '50000.00',  credit: '0.00' },
      { code: '1200', name: 'Equipment',             category: 'asset',     debit: '300000.00', credit: '0.00' },
      { code: '2000', name: 'Account Payable',       category: 'liability', debit: '0.00',      credit: '200000.00' },
      { code: '2100', name: 'Loan Payable',          category: 'liability', debit: '0.00',      credit: '200000.00' },
      { code: '3000', name: 'Common Stock Equity',   category: 'equity',    debit: '0.00',      credit: '150000.00' },
      { code: '4000', name: 'Service Revenue',       category: 'revenue',   debit: '0.00',      credit: '200000.00' },
      { code: '5000', name: 'Salary Expense',        category: 'expense',   debit: '150000.00', credit: '0.00' },
      { code: '5100', name: 'Rent Expense',          category: 'expense',   debit: '100000.00', credit: '0.00' },
      { code: '5200', name: 'Depreciation Expense',  category: 'expense',   debit: '50000.00',  credit: '0.00' },
    ]),
  ];
}
