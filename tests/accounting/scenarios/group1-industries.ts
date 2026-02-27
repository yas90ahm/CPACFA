// tests/accounting/scenarios/group1-industries.ts — Scenarios 1-10: Clean industry GLs
import { ScenarioDef } from './types';
import { computeExpectedTotals } from '../lib';

function mkScenario(partial: Omit<ScenarioDef, 'expected'> & { expected?: Partial<ScenarioDef['expected']> }): ScenarioDef {
  const totals = computeExpectedTotals(partial.accounts);
  return {
    ...partial,
    expected: {
      totals,
      balanceSheetEquation: true,
      ...partial.expected,
    },
  } as ScenarioDef;
}

export function getGroup1Scenarios(): ScenarioDef[] {
  return [
    // S01: SaaS Company
    // D: 500000+250000+60000+150000+400000+60000+45000+80000+30000+5000+65000=1645000
    // C: 30000+120000+45000+200000+100000+200000+950000=1645000 ✓
    mkScenario({
      id: 1, name: 'SaaS Company', group: 'Group 1: Industries',
      entityId: 'ind-saas-s01', period: '2040-01',
      accounts: [
        { code: '1000', name: 'Cash at Bank',             category: 'asset',     debit: '500000.00', credit: '0.00' },
        { code: '1100', name: 'Account Receivable',        category: 'asset',     debit: '250000.00', credit: '0.00' },
        { code: '1200', name: 'Prepaid Software Asset',    category: 'asset',     debit: '60000.00',  credit: '0.00' },
        { code: '1300', name: 'Equipment',                 category: 'asset',     debit: '150000.00', credit: '0.00' },
        { code: '1301', name: 'Equipment Accum Depr',      category: 'asset',     debit: '0.00',      credit: '30000.00' },
        { code: '2000', name: 'Account Payable',           category: 'liability', debit: '0.00',      credit: '120000.00' },
        { code: '2100', name: 'Accrued Salary Payable',    category: 'liability', debit: '0.00',      credit: '45000.00' },
        { code: '2200', name: 'Deferred Revenue Liability',category: 'liability', debit: '0.00',      credit: '200000.00' },
        { code: '2300', name: 'Loan Payable',              category: 'liability', debit: '0.00',      credit: '100000.00' },
        { code: '3000', name: 'Common Stock Equity',       category: 'equity',    debit: '0.00',      credit: '200000.00' },
        { code: '4000', name: 'Subscription Revenue',      category: 'revenue',   debit: '0.00',      credit: '950000.00' },
        { code: '5000', name: 'Salary Expense',            category: 'expense',   debit: '400000.00', credit: '0.00' },
        { code: '5100', name: 'Rent Expense',              category: 'expense',   debit: '60000.00',  credit: '0.00' },
        { code: '5200', name: 'Software Expense',          category: 'expense',   debit: '45000.00',  credit: '0.00' },
        { code: '5300', name: 'Marketing Expense',         category: 'expense',   debit: '80000.00',  credit: '0.00' },
        { code: '5400', name: 'Depreciation Expense',      category: 'expense',   debit: '30000.00',  credit: '0.00' },
        { code: '5500', name: 'Interest Expense',          category: 'expense',   debit: '5000.00',   credit: '0.00' },
        { code: '5600', name: 'Tax Expense',               category: 'expense',   debit: '65000.00',  credit: '0.00' },
      ],
    }),

    // S02: Manufacturing
    // D: 300000+400000+500000+1200000+1200000+300000+50000+50000=4000000
    // C: 200000+350000+100000+600000+500000+250000+2000000=4000000 ✓
    mkScenario({
      id: 2, name: 'Manufacturing Company', group: 'Group 1: Industries',
      entityId: 'ind-mfg-s02', period: '2040-02',
      accounts: [
        { code: '1000', name: 'Cash at Bank',             category: 'asset',     debit: '300000.00', credit: '0.00' },
        { code: '1100', name: 'Account Receivable',        category: 'asset',     debit: '400000.00', credit: '0.00' },
        { code: '1200', name: 'Inventory',                  category: 'asset',     debit: '500000.00', credit: '0.00' },
        { code: '1300', name: 'Property Plant Equipment',   category: 'asset',     debit: '1200000.00',credit: '0.00' },
        { code: '1301', name: 'Equipment Accum Depr',       category: 'asset',     debit: '0.00',      credit: '200000.00' },
        { code: '2000', name: 'Account Payable',            category: 'liability', debit: '0.00',      credit: '350000.00' },
        { code: '2100', name: 'Accrued Liability',           category: 'liability', debit: '0.00',      credit: '100000.00' },
        { code: '2200', name: 'Long Term Debt Payable',     category: 'liability', debit: '0.00',      credit: '600000.00' },
        { code: '3000', name: 'Common Stock Equity',        category: 'equity',    debit: '0.00',      credit: '500000.00' },
        { code: '3100', name: 'Retained Earnings',          category: 'equity',    debit: '0.00',      credit: '250000.00' },
        { code: '4000', name: 'Product Sales Revenue',      category: 'revenue',   debit: '0.00',      credit: '2000000.00' },
        { code: '5000', name: 'Cost of Goods Sold Expense', category: 'expense',   debit: '1200000.00',credit: '0.00' },
        { code: '5100', name: 'Salary Expense',             category: 'expense',   debit: '300000.00', credit: '0.00' },
        { code: '5200', name: 'Rent Expense',               category: 'expense',   debit: '50000.00',  credit: '0.00' },
        { code: '5300', name: 'Depreciation Expense',       category: 'expense',   debit: '50000.00',  credit: '0.00' },
      ],
    }),

    // S03: Professional Services
    // D: 200000+350000+25000+75000+500000+350000+120000+30000=1650000
    // C: 80000+120000+150000+900000+400000=1650000 ✓
    mkScenario({
      id: 3, name: 'Professional Services Firm', group: 'Group 1: Industries',
      entityId: 'ind-prof-s03', period: '2040-03',
      accounts: [
        { code: '1000', name: 'Cash at Bank',              category: 'asset',     debit: '200000.00', credit: '0.00' },
        { code: '1100', name: 'Account Receivable',         category: 'asset',     debit: '350000.00', credit: '0.00' },
        { code: '1200', name: 'Prepaid Insurance Asset',    category: 'asset',     debit: '25000.00',  credit: '0.00' },
        { code: '1300', name: 'Office Equipment',           category: 'asset',     debit: '75000.00',  credit: '0.00' },
        { code: '2000', name: 'Account Payable',            category: 'liability', debit: '0.00',      credit: '80000.00' },
        { code: '2100', name: 'Accrued Salary Payable',     category: 'liability', debit: '0.00',      credit: '120000.00' },
        { code: '3000', name: 'Partners Capital Equity',    category: 'equity',    debit: '0.00',      credit: '150000.00' },
        { code: '4000', name: 'Consulting Fee Income',      category: 'revenue',   debit: '0.00',      credit: '900000.00' },
        { code: '4100', name: 'Audit Fee Income',           category: 'revenue',   debit: '0.00',      credit: '400000.00' },
        { code: '5000', name: 'Partner Salary Expense',     category: 'expense',   debit: '500000.00', credit: '0.00' },
        { code: '5100', name: 'Staff Salary Expense',       category: 'expense',   debit: '350000.00', credit: '0.00' },
        { code: '5200', name: 'Office Rent Expense',        category: 'expense',   debit: '120000.00', credit: '0.00' },
        { code: '5300', name: 'Professional Coverage Expense', category: 'expense', debit: '30000.00', credit: '0.00' },
      ],
    }),

    // S04: Real Estate
    // D: 400000+150000+5000000+150000+100000+50000+100000+150000=6100000
    // C: 500000+200000+3000000+1000000+400000+1000000=6100000 ✓
    mkScenario({
      id: 4, name: 'Real Estate Company', group: 'Group 1: Industries',
      entityId: 'ind-re-s04', period: '2040-04',
      accounts: [
        { code: '1000', name: 'Cash at Bank',              category: 'asset',     debit: '400000.00', credit: '0.00' },
        { code: '1100', name: 'Account Receivable',         category: 'asset',     debit: '150000.00', credit: '0.00' },
        { code: '1200', name: 'Property Asset',             category: 'asset',     debit: '5000000.00',credit: '0.00' },
        { code: '1201', name: 'Property Accum Depr',        category: 'asset',     debit: '0.00',      credit: '500000.00' },
        { code: '2000', name: 'Account Payable',            category: 'liability', debit: '0.00',      credit: '200000.00' },
        { code: '2100', name: 'Mortgage Loan Payable',      category: 'liability', debit: '0.00',      credit: '3000000.00' },
        { code: '3000', name: 'Common Stock Equity',        category: 'equity',    debit: '0.00',      credit: '1000000.00' },
        { code: '3100', name: 'Retained Earnings',          category: 'equity',    debit: '0.00',      credit: '400000.00' },
        { code: '4000', name: 'Rental Revenue',             category: 'revenue',   debit: '0.00',      credit: '1000000.00' },
        { code: '5000', name: 'Real Estate Tax Expense',     category: 'expense',   debit: '150000.00', credit: '0.00' },
        { code: '5100', name: 'Maintenance Expense',        category: 'expense',   debit: '100000.00', credit: '0.00' },
        { code: '5200', name: 'Insurance Expense',          category: 'expense',   debit: '50000.00',  credit: '0.00' },
        { code: '5300', name: 'Depreciation Expense',       category: 'expense',   debit: '100000.00', credit: '0.00' },
        { code: '5400', name: 'Interest Expense',           category: 'expense',   debit: '150000.00', credit: '0.00' },
      ],
    }),

    // S05: Healthcare
    // D: 350000+600000+800000+40000+800000+400000+200000+50000+50000=3290000
    // C: 160000+250000+180000+400000+300000+2000000=3290000 ✓
    mkScenario({
      id: 5, name: 'Healthcare Provider', group: 'Group 1: Industries',
      entityId: 'ind-health-s05', period: '2040-05',
      accounts: [
        { code: '1000', name: 'Cash at Bank',               category: 'asset',     debit: '350000.00', credit: '0.00' },
        { code: '1100', name: 'Patient Account Receivable',  category: 'asset',     debit: '600000.00', credit: '0.00' },
        { code: '1200', name: 'Medical Equipment',           category: 'asset',     debit: '800000.00', credit: '0.00' },
        { code: '1201', name: 'Equipment Accum Depr',        category: 'asset',     debit: '0.00',      credit: '160000.00' },
        { code: '1300', name: 'Prepaid Insurance Asset',     category: 'asset',     debit: '40000.00',  credit: '0.00' },
        { code: '2000', name: 'Account Payable',             category: 'liability', debit: '0.00',      credit: '250000.00' },
        { code: '2100', name: 'Accrued Salary Payable',      category: 'liability', debit: '0.00',      credit: '180000.00' },
        { code: '2200', name: 'Loan Payable',                category: 'liability', debit: '0.00',      credit: '400000.00' },
        { code: '3000', name: 'Common Stock Equity',         category: 'equity',    debit: '0.00',      credit: '300000.00' },
        { code: '4000', name: 'Patient Services Revenue',    category: 'revenue',   debit: '0.00',      credit: '2000000.00' },
        { code: '5000', name: 'Physician Salary Expense',    category: 'expense',   debit: '800000.00', credit: '0.00' },
        { code: '5100', name: 'Nursing Staff Salary Expense',category: 'expense',   debit: '400000.00', credit: '0.00' },
        { code: '5200', name: 'Medical Supply Expense',      category: 'expense',   debit: '200000.00', credit: '0.00' },
        { code: '5300', name: 'Insurance Expense',           category: 'expense',   debit: '50000.00',  credit: '0.00' },
        { code: '5400', name: 'Depreciation Expense',        category: 'expense',   debit: '50000.00',  credit: '0.00' },
      ],
    }),

    // S06: Retail
    // D: 150000+100000+800000+200000+1800000+400000+120000+30000+50000=3650000
    // C: 40000+300000+60000+250000+3000000=3650000 ✓
    mkScenario({
      id: 6, name: 'Retail Company', group: 'Group 1: Industries',
      entityId: 'ind-retail-s06', period: '2040-06',
      accounts: [
        { code: '1000', name: 'Cash at Bank',              category: 'asset',     debit: '150000.00', credit: '0.00' },
        { code: '1100', name: 'Account Receivable',         category: 'asset',     debit: '100000.00', credit: '0.00' },
        { code: '1200', name: 'Inventory',                   category: 'asset',     debit: '800000.00', credit: '0.00' },
        { code: '1300', name: 'Store Equipment',             category: 'asset',     debit: '200000.00', credit: '0.00' },
        { code: '1301', name: 'Equipment Accum Depr',        category: 'asset',     debit: '0.00',      credit: '40000.00' },
        { code: '2000', name: 'Account Payable',             category: 'liability', debit: '0.00',      credit: '300000.00' },
        { code: '2100', name: 'Accrued Payable',             category: 'liability', debit: '0.00',      credit: '60000.00' },
        { code: '3000', name: 'Common Stock Equity',         category: 'equity',    debit: '0.00',      credit: '250000.00' },
        { code: '4000', name: 'Retail Sales Revenue',        category: 'revenue',   debit: '0.00',      credit: '3000000.00' },
        { code: '5000', name: 'Cost of Goods Sold Expense',  category: 'expense',   debit: '1800000.00',credit: '0.00' },
        { code: '5100', name: 'Staff Salary Expense',        category: 'expense',   debit: '400000.00', credit: '0.00' },
        { code: '5200', name: 'Store Rent Expense',          category: 'expense',   debit: '120000.00', credit: '0.00' },
        { code: '5300', name: 'Utility Expense',             category: 'expense',   debit: '30000.00',  credit: '0.00' },
        { code: '5400', name: 'Depreciation Expense',        category: 'expense',   debit: '50000.00',  credit: '0.00' },
      ],
    }),

    // S07: Tech Startup (Pre-Revenue, net loss)
    // D: 2000000+50000+100000+300000+50000+80000+20000=2600000
    // C: 80000+20000+2500000=2600000 ✓
    mkScenario({
      id: 7, name: 'Tech Startup Pre-Revenue', group: 'Group 1: Industries',
      entityId: 'ind-startup-s07', period: '2040-07',
      accounts: [
        { code: '1000', name: 'Cash at Bank',              category: 'asset',     debit: '2000000.00',credit: '0.00' },
        { code: '1100', name: 'Prepaid Rent Asset',         category: 'asset',     debit: '50000.00',  credit: '0.00' },
        { code: '1200', name: 'Office Equipment',            category: 'asset',     debit: '100000.00', credit: '0.00' },
        { code: '2000', name: 'Account Payable',             category: 'liability', debit: '0.00',      credit: '80000.00' },
        { code: '2100', name: 'Accrued Liability',            category: 'liability', debit: '0.00',      credit: '20000.00' },
        { code: '3000', name: 'Common Stock Equity',         category: 'equity',    debit: '0.00',      credit: '2500000.00' },
        { code: '5000', name: 'Engineering Salary Expense',  category: 'expense',   debit: '300000.00', credit: '0.00' },
        { code: '5100', name: 'Cloud Hosting Expense',       category: 'expense',   debit: '50000.00',  credit: '0.00' },
        { code: '5200', name: 'Office Rent Expense',         category: 'expense',   debit: '80000.00',  credit: '0.00' },
        { code: '5300', name: 'Legal Expense',               category: 'expense',   debit: '20000.00',  credit: '0.00' },
      ],
    }),

    // S08: Construction
    // D: 250000+700000+1500000+50000+1200000+800000+200000+150000=4850000
    // C: 300000+400000+150000+500000+400000+100000+3000000=4850000 ✓
    mkScenario({
      id: 8, name: 'Construction Company', group: 'Group 1: Industries',
      entityId: 'ind-constr-s08', period: '2040-08',
      accounts: [
        { code: '1000', name: 'Cash at Bank',               category: 'asset',     debit: '250000.00', credit: '0.00' },
        { code: '1100', name: 'Account Receivable',          category: 'asset',     debit: '700000.00', credit: '0.00' },
        { code: '1200', name: 'Equipment',                    category: 'asset',     debit: '1500000.00',credit: '0.00' },
        { code: '1201', name: 'Equipment Accum Depr',         category: 'asset',     debit: '0.00',      credit: '300000.00' },
        { code: '1300', name: 'Prepaid Insurance Asset',      category: 'asset',     debit: '50000.00',  credit: '0.00' },
        { code: '2000', name: 'Account Payable',              category: 'liability', debit: '0.00',      credit: '400000.00' },
        { code: '2100', name: 'Accrued Payable',              category: 'liability', debit: '0.00',      credit: '150000.00' },
        { code: '2200', name: 'Long Term Loan Payable',       category: 'liability', debit: '0.00',      credit: '500000.00' },
        { code: '3000', name: 'Common Stock Equity',          category: 'equity',    debit: '0.00',      credit: '400000.00' },
        { code: '3100', name: 'Retained Earnings',            category: 'equity',    debit: '0.00',      credit: '100000.00' },
        { code: '4000', name: 'Construction Revenue',         category: 'revenue',   debit: '0.00',      credit: '3000000.00' },
        { code: '5000', name: 'Material Cost Expense',        category: 'expense',   debit: '1200000.00',credit: '0.00' },
        { code: '5100', name: 'Labor Salary Expense',         category: 'expense',   debit: '800000.00', credit: '0.00' },
        { code: '5200', name: 'Machine Rental Expense',       category: 'expense',   debit: '200000.00', credit: '0.00' },
        { code: '5300', name: 'Insurance Expense',            category: 'expense',   debit: '150000.00', credit: '0.00' },
      ],
    }),

    // S09: E-Commerce
    // D: 400000+200000+600000+30000+1500000+200000+300000+100000+200000=3530000
    // C: 350000+380000+300000+2500000=3530000 ✓
    mkScenario({
      id: 9, name: 'E-Commerce Company', group: 'Group 1: Industries',
      entityId: 'ind-ecom-s09', period: '2040-09',
      accounts: [
        { code: '1000', name: 'Cash at Bank',              category: 'asset',     debit: '400000.00', credit: '0.00' },
        { code: '1100', name: 'Account Receivable',         category: 'asset',     debit: '200000.00', credit: '0.00' },
        { code: '1200', name: 'Inventory',                   category: 'asset',     debit: '600000.00', credit: '0.00' },
        { code: '1300', name: 'Prepaid Asset',               category: 'asset',     debit: '30000.00',  credit: '0.00' },
        { code: '2000', name: 'Account Payable',             category: 'liability', debit: '0.00',      credit: '350000.00' },
        { code: '2100', name: 'Accrued Liability',            category: 'liability', debit: '0.00',      credit: '380000.00' },
        { code: '3000', name: 'Common Stock Equity',         category: 'equity',    debit: '0.00',      credit: '300000.00' },
        { code: '4000', name: 'Online Sales Revenue',        category: 'revenue',   debit: '0.00',      credit: '2500000.00' },
        { code: '5000', name: 'Cost of Goods Sold Expense',  category: 'expense',   debit: '1500000.00',credit: '0.00' },
        { code: '5100', name: 'Shipping Expense',            category: 'expense',   debit: '200000.00', credit: '0.00' },
        { code: '5200', name: 'Marketing Expense',           category: 'expense',   debit: '300000.00', credit: '0.00' },
        { code: '5300', name: 'Technology Expense',           category: 'expense',   debit: '100000.00', credit: '0.00' },
        { code: '5400', name: 'Salary Expense',              category: 'expense',   debit: '200000.00', credit: '0.00' },
      ],
    }),

    // S10: Financial Services
    // D: 1000000+5000000+300000+100000+800000+150000+100000+150000=7600000
    // C: 200000+100000+3000000+2000000+500000+1500000+300000=7600000 ✓
    mkScenario({
      id: 10, name: 'Financial Services Company', group: 'Group 1: Industries',
      entityId: 'ind-fin-s10', period: '2040-10',
      accounts: [
        { code: '1000', name: 'Cash at Bank',               category: 'asset',     debit: '1000000.00',credit: '0.00' },
        { code: '1100', name: 'Investment Asset',            category: 'asset',     debit: '5000000.00',credit: '0.00' },
        { code: '1200', name: 'Account Receivable',          category: 'asset',     debit: '300000.00', credit: '0.00' },
        { code: '1300', name: 'Office Equipment',             category: 'asset',     debit: '100000.00', credit: '0.00' },
        { code: '2000', name: 'Account Payable',              category: 'liability', debit: '0.00',      credit: '200000.00' },
        { code: '2100', name: 'Accrued Liability',             category: 'liability', debit: '0.00',      credit: '100000.00' },
        { code: '2200', name: 'Client Deposit Liability',      category: 'liability', debit: '0.00',      credit: '3000000.00' },
        { code: '3000', name: 'Common Stock Equity',          category: 'equity',    debit: '0.00',      credit: '2000000.00' },
        { code: '3100', name: 'Retained Earnings',            category: 'equity',    debit: '0.00',      credit: '500000.00' },
        { code: '4000', name: 'Advisory Fee Income',          category: 'revenue',   debit: '0.00',      credit: '1500000.00' },
        { code: '4100', name: 'Interest Income',              category: 'revenue',   debit: '0.00',      credit: '300000.00' },
        { code: '5000', name: 'Salary Expense',               category: 'expense',   debit: '800000.00', credit: '0.00' },
        { code: '5100', name: 'Office Rent Expense',          category: 'expense',   debit: '150000.00', credit: '0.00' },
        { code: '5200', name: 'Technology Expense',            category: 'expense',   debit: '100000.00', credit: '0.00' },
        { code: '5300', name: 'Regulatory Expense',            category: 'expense',   debit: '150000.00', credit: '0.00' },
      ],
    }),
  ];
}
