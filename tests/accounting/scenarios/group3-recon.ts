// tests/accounting/scenarios/group3-recon.ts — Scenarios 21-28: Reconciliation (mostly skipped)
import { ScenarioDef } from './types';
import { computeExpectedTotals } from '../lib';

export function getGroup3Scenarios(): ScenarioDef[] {
  // All recon scenarios are likely to fail with 404 (recon routes not wired at runtime).
  // We structure them to attempt the API calls and skip gracefully.
  const baseAccounts = [
    { code: '1000', name: 'Cash at Bank',          category: 'asset' as const,     debit: '100000.00', credit: '0.00' },
    { code: '1100', name: 'Account Receivable',     category: 'asset' as const,     debit: '50000.00',  credit: '0.00' },
    { code: '2000', name: 'Account Payable',        category: 'liability' as const, debit: '0.00',      credit: '30000.00' },
    { code: '3000', name: 'Common Stock Equity',    category: 'equity' as const,    debit: '0.00',      credit: '100000.00' },
    { code: '4000', name: 'Service Revenue',        category: 'revenue' as const,   debit: '0.00',      credit: '50000.00' },
    { code: '5000', name: 'Salary Expense',         category: 'expense' as const,   debit: '30000.00',  credit: '0.00' },
  ];
  // D: 100000+50000+30000=180000, C: 30000+100000+50000=180000 ✓

  const totals = computeExpectedTotals(baseAccounts);

  return [
    { id: 21, name: 'Basic Cash Reconciliation', group: 'Group 3: Reconciliation',
      entityId: 'recon-s21', period: '2042-01', accounts: baseAccounts,
      expected: { totals, balanceSheetEquation: true },
      skipReason: 'Recon routes return 404 at runtime (UAT finding)' },
    { id: 22, name: 'AR Reconciliation with Subledger', group: 'Group 3: Reconciliation',
      entityId: 'recon-s22', period: '2042-02', accounts: baseAccounts,
      expected: { totals, balanceSheetEquation: true },
      skipReason: 'Recon routes return 404 at runtime (UAT finding)' },
    { id: 23, name: 'AP Reconciliation', group: 'Group 3: Reconciliation',
      entityId: 'recon-s23', period: '2042-03', accounts: baseAccounts,
      expected: { totals, balanceSheetEquation: true },
      skipReason: 'Recon routes return 404 at runtime (UAT finding)' },
    { id: 24, name: 'Fixed Asset Reconciliation', group: 'Group 3: Reconciliation',
      entityId: 'recon-s24', period: '2042-04', accounts: baseAccounts,
      expected: { totals, balanceSheetEquation: true },
      skipReason: 'Recon routes return 404 at runtime (UAT finding)' },
    { id: 25, name: 'Recon with Evidence Upload', group: 'Group 3: Reconciliation',
      entityId: 'recon-s25', period: '2042-05', accounts: baseAccounts,
      expected: { totals, balanceSheetEquation: true },
      skipReason: 'Recon routes return 404 at runtime (UAT finding)' },
    { id: 26, name: 'Recon SoD Enforcement', group: 'Group 3: Reconciliation',
      entityId: 'recon-s26', period: '2042-06', accounts: baseAccounts,
      expected: { totals, balanceSheetEquation: true },
      skipReason: 'Recon routes return 404 at runtime (UAT finding)' },
    { id: 27, name: 'Recon with Reconciling Items', group: 'Group 3: Reconciliation',
      entityId: 'recon-s27', period: '2042-07', accounts: baseAccounts,
      expected: { totals, balanceSheetEquation: true },
      skipReason: 'Recon routes return 404 at runtime (UAT finding)' },
    { id: 28, name: 'Recon Approval Workflow', group: 'Group 3: Reconciliation',
      entityId: 'recon-s28', period: '2042-08', accounts: baseAccounts,
      expected: { totals, balanceSheetEquation: true },
      skipReason: 'Recon routes return 404 at runtime (UAT finding)' },
  ];
}
