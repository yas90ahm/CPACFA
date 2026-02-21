import type { TemplateFrequency } from '@/lib/types/journal-entry';

export interface TemplateLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface TemplateApplication {
  periodLabel: string;
  appliedAt: string;
  appliedBy: string;
  jeNumber: string | null;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  frequency: TemplateFrequency;
  lines: TemplateLine[];
  defaultMemo: string;
  active: boolean;
  lastApplied: string | null;
  createdBy: string;
  applicationHistory: TemplateApplication[];
}

export const mockTemplateDefinitions: TemplateDefinition[] = [
  {
    id: 'tpl-def-1',
    name: 'Monthly Depreciation — Equipment',
    description: 'Monthly straight-line depreciation on manufacturing equipment per fixed asset schedule.',
    frequency: 'Monthly',
    lines: [
      { id: 'l1', accountCode: '6400', accountName: 'Depreciation Expense', debit: '45000.00', credit: '0' },
      { id: 'l2', accountCode: '1510', accountName: 'Accumulated Depreciation', debit: '0', credit: '45000.00' },
    ],
    defaultMemo: 'Monthly depreciation — equipment per schedule',
    active: true,
    lastApplied: '2026-02-05',
    createdBy: 'Sarah Chen',
    applicationHistory: [
      { periodLabel: 'January 2026', appliedAt: '2026-02-05T10:00:00Z', appliedBy: 'Sarah Chen', jeNumber: 'JE-1038' },
      { periodLabel: 'December 2025', appliedAt: '2026-01-06T10:00:00Z', appliedBy: 'Sarah Chen', jeNumber: 'JE-0982' },
    ],
  },
  {
    id: 'tpl-def-2',
    name: 'Monthly Depreciation — Building',
    description: 'Monthly straight-line depreciation on building per fixed asset schedule.',
    frequency: 'Monthly',
    lines: [
      { id: 'l1', accountCode: '6400', accountName: 'Depreciation Expense', debit: '12500.00', credit: '0' },
      { id: 'l2', accountCode: '1510', accountName: 'Accumulated Depreciation', debit: '0', credit: '12500.00' },
    ],
    defaultMemo: 'Monthly depreciation — building',
    active: true,
    lastApplied: '2026-02-05',
    createdBy: 'Sarah Chen',
    applicationHistory: [{ periodLabel: 'January 2026', appliedAt: '2026-02-05T10:05:00Z', appliedBy: 'Sarah Chen', jeNumber: 'JE-1039' }],
  },
  {
    id: 'tpl-def-3',
    name: 'Prepaid Insurance Amortization',
    description: 'Monthly amortization of prepaid insurance policy.',
    frequency: 'Monthly',
    lines: [
      { id: 'l1', accountCode: '6500', accountName: 'Insurance Expense', debit: '8333.33', credit: '0' },
      { id: 'l2', accountCode: '1300', accountName: 'Prepaid Expenses', debit: '0', credit: '8333.33' },
    ],
    defaultMemo: 'Prepaid insurance amortization',
    active: true,
    lastApplied: null,
    createdBy: 'Sarah Chen',
    applicationHistory: [],
  },
  {
    id: 'tpl-def-4',
    name: 'Accrued Interest — Term Loan',
    description: 'Monthly interest accrual on term loan.',
    frequency: 'Monthly',
    lines: [
      { id: 'l1', accountCode: '7100', accountName: 'Interest Expense', debit: '33333.33', credit: '0' },
      { id: 'l2', accountCode: '2100', accountName: 'Accrued Expenses', debit: '0', credit: '33333.33' },
    ],
    defaultMemo: 'Accrued interest — term loan',
    active: true,
    lastApplied: null,
    createdBy: 'Sarah Chen',
    applicationHistory: [],
  },
  {
    id: 'tpl-def-5',
    name: 'Accrued Payroll',
    description: 'Monthly accrued payroll and related expenses.',
    frequency: 'Monthly',
    lines: [
      { id: 'l1', accountCode: '6100', accountName: 'Salaries & Wages', debit: '425000.00', credit: '0' },
      { id: 'l2', accountCode: '2100', accountName: 'Accrued Expenses', debit: '0', credit: '425000.00' },
    ],
    defaultMemo: 'Accrued payroll',
    active: true,
    lastApplied: null,
    createdBy: 'Sarah Chen',
    applicationHistory: [],
  },
  {
    id: 'tpl-def-6',
    name: 'Sales Tax Accrual',
    description: 'Sales tax liability accrual when applicable.',
    frequency: 'Monthly',
    lines: [
      { id: 'l1', accountCode: '2100', accountName: 'Accrued Expenses', debit: '0', credit: '0' },
      { id: 'l2', accountCode: '4100', accountName: 'Revenue - Product Sales', debit: '0', credit: '0' },
    ],
    defaultMemo: 'Sales tax accrual',
    active: true,
    lastApplied: null,
    createdBy: 'Sarah Chen',
    applicationHistory: [],
  },
];

export function getTemplateDefinitionsByEntity(_entityId: string): TemplateDefinition[] {
  return mockTemplateDefinitions;
}
