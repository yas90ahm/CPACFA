import type { AJETemplate } from '@/lib/types/journal-entry';

const SESSION = 'c925645f-3831-4d81-93a9-a12a2819cd3e';

function t(
  id: string,
  name: string,
  frequency: AJETemplate['frequency'],
  debitCode: string,
  debitName: string,
  creditCode: string,
  creditName: string,
  amount: number,
  periodStatus: AJETemplate['periodStatus'],
  appliedBy: string | null,
  appliedAt: string | null,
  resultingJeId: string | null,
  skipReason: string | null
): AJETemplate {
  return {
    id,
    sessionId: SESSION,
    name,
    frequency,
    debitAccountCode: debitCode,
    debitAccountName: debitName,
    creditAccountCode: creditCode,
    creditAccountName: creditName,
    amount,
    periodStatus,
    appliedOrSkippedBy: appliedBy,
    appliedOrSkippedAt: appliedAt,
    resultingJeId,
    skipReason,
  };
}

export const mockAjeTemplates: AJETemplate[] = [
  t('tpl-1', 'Monthly Depreciation - Equipment', 'Monthly', '6400', 'Depreciation Expense', '1510', 'Accumulated Depreciation', 45000, 'applied', 'Sarah Chen', '2026-02-05T10:00:00Z', 'je-1038', null),
  t('tpl-2', 'Monthly Depreciation - Building', 'Monthly', '6400', 'Depreciation Expense', '1510', 'Accumulated Depreciation', 12500, 'applied', 'Sarah Chen', '2026-02-05T10:05:00Z', 'je-1039', null),
  t('tpl-3', 'Prepaid Insurance Amortization', 'Monthly', '6500', 'Insurance Expense', '1300', 'Prepaid Expenses', 8333.33, 'pending', null, null, null, null),
  t('tpl-4', 'Accrued Interest - Term Loan', 'Monthly', '7100', 'Interest Expense', '2100', 'Accrued Expenses', 33333.33, 'pending', null, null, null, null),
  t('tpl-5', 'Accrued Payroll', 'Monthly', '6100', 'Salaries & Wages', '2100', 'Accrued Expenses', 425000, 'pending', null, null, null, null),
  t('tpl-6', 'Sales Tax Accrual', 'Monthly', '2100', 'Accrued Expenses', '4100', 'Revenue - Product Sales', 0, 'skipped', 'Sarah Chen', '2026-02-06T14:00:00Z', null, 'No sales tax liability this period - all remitted on Jan 15.'),
];

export const templatePendingCount = mockAjeTemplates.filter((x) => x.periodStatus === 'pending').length;
export const templateResolvedCount = mockAjeTemplates.filter((x) => x.periodStatus === 'applied' || x.periodStatus === 'skipped').length;
