import type { Reconciliation } from '@/lib/types/reconciliation';

function r(
  id: string,
  sessionId: string,
  code: string,
  name: string,
  glBalance: number,
  supportingBalance: number | null,
  itemsTotal: number,
  tolerance: number,
  status: Reconciliation['status'],
  evidenceCount: number,
  preparer: string | null,
  reviewer: string | null,
  completedAt: string | null,
  approvedAt: string | null,
  rejectedReason: string | null,
  notes: string | null,
  sourceDoc: string
): Reconciliation {
  const variance = supportingBalance != null ? glBalance - supportingBalance : 0;
  const unexplained = supportingBalance != null ? variance - itemsTotal : 0;
  return {
    id,
    sessionId,
    accountCode: code,
    accountName: name,
    glBalance,
    supportingBalance,
    variance,
    reconcilingItemsTotal: itemsTotal,
    unexplainedVariance: unexplained,
    tolerance,
    status,
    evidenceCount,
    preparer,
    reviewer,
    completedAt,
    approvedAt,
    rejectedReason,
    notes,
    sourceDocumentType: sourceDoc,
  };
}

const SESSION = 'c925645f-3831-4d81-93a9-a12a2819cd3e';

export const mockReconciliations: Reconciliation[] = [
  r('recon-1010', SESSION, '1010', 'Chase Checking — Operating', 1245678.9, 1243338.9, 2340, 500, 'approved', 1, 'Sarah Chen', 'Mike Torres', '2026-02-10T15:00:00Z', '2026-02-11T09:00:00Z', null, null, 'bank statement'),
  r('recon-1020', SESSION, '1020', 'Chase Savings — Reserve', 500000, 500000, 0, 500, 'approved', 1, 'Sarah Chen', 'Mike Torres', '2026-02-10T15:05:00Z', '2026-02-11T09:05:00Z', null, null, 'bank statement'),
  r('recon-1100', SESSION, '1100', 'Accounts Receivable — Trade', 3456789, 3401234, 55555, 1000, 'completed', 2, 'Sarah Chen', null, '2026-02-14T16:00:00Z', null, null, null, 'subledger'),
  r('recon-1200', SESSION, '1200', 'Inventory — Raw Materials', 2100000, 2087500, 8300, 1000, 'in_progress', 1, 'Mike Torres', null, null, null, null, null, 'count sheet'),
  r('recon-1210', SESSION, '1210', 'Inventory — Finished Goods', 1800000, 1800000, 0, 1000, 'in_progress', 0, 'Sarah Chen', null, null, null, null, null, 'count sheet'),
  r('recon-1300', SESSION, '1300', 'Prepaid Expenses', 245000, null, 0, 500, 'in_progress', 0, null, null, null, null, null, null, 'schedule'),
  r('recon-1500', SESSION, '1500', 'Property, Plant & Equipment', 12500000, 12500000, 0, 500, 'approved', 1, 'Sarah Chen', 'Mike Torres', '2026-02-09T17:00:00Z', '2026-02-10T10:00:00Z', null, null, 'depreciation schedule'),
  r('recon-1510', SESSION, '1510', 'Accumulated Depreciation', -4200000, -4200000, 0, 500, 'approved', 1, 'Sarah Chen', 'Mike Torres', '2026-02-09T17:05:00Z', '2026-02-10T10:05:00Z', null, null, 'rollforward'),
  r('recon-2010', SESSION, '2010', 'Accounts Payable — Trade', -2890000, null, 0, 1000, 'not_started', 0, null, null, null, null, null, null, 'subledger'),
  r('recon-2100', SESSION, '2100', 'Accrued Expenses', -1456000, null, 0, 500, 'not_started', 0, null, null, null, null, null, null, 'schedule'),
  r('recon-2200', SESSION, '2200', 'Current Portion — Long-Term Debt', -500000, -500000, 0, 500, 'approved', 1, 'Sarah Chen', 'Mike Torres', '2026-02-08T11:00:00Z', '2026-02-09T09:00:00Z', null, null, 'loan statement'),
  r('recon-2500', SESSION, '2500', 'Long-Term Debt — Term Loan', -8000000, -8000000, 0, 500, 'completed', 1, 'Sarah Chen', null, '2026-02-08T11:05:00Z', null, null, null, 'loan statement'),
];

export const incompleteCount = mockReconciliations.filter((r) => r.status !== 'approved').length;
export const overToleranceCount = mockReconciliations.filter((r) => r.supportingBalance != null && Math.abs(r.unexplainedVariance) > r.tolerance).length;
