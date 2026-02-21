import type { JournalEntry, JournalEntryLine } from '@/lib/types/journal-entry';

const SESSION = 'c925645f-3831-4d81-93a9-a12a2819cd3e';

function line(id: string, code: string, name: string, desc: string | null, debit: number, credit: number): JournalEntryLine {
  return { id, accountCode: code, accountName: name, description: desc, debit, credit };
}

function je(
  id: string,
  jeNumber: number,
  date: string,
  memo: string,
  status: JournalEntry['status'],
  source: JournalEntry['source'],
  templateId: string | null,
  templateName: string | null,
  lines: JournalEntryLine[],
  evidenceCount: number,
  createdBy: string,
  createdAt: string,
  proposedBy: string | null,
  proposedAt: string | null,
  approvedBy: string | null,
  approvedAt: string | null,
  postedBy: string | null,
  postedAt: string | null,
  rejectedBy: string | null,
  rejectedAt: string | null,
  rejectionReason: string | null
): JournalEntry {
  return {
    id,
    sessionId: SESSION,
    jeNumber,
    date,
    memo,
    status,
    source,
    templateId,
    templateName,
    lines,
    evidenceCount,
    createdBy,
    createdAt,
    proposedBy,
    proposedAt,
    approvedBy,
    approvedAt,
    postedBy,
    postedAt,
    rejectedBy,
    rejectedAt,
    rejectionReason,
  };
}

export const mockJournalEntries: JournalEntry[] = [
  je('je-1038', 1038, '2026-01-31', 'Monthly depreciation — equipment', 'posted', 'template', 'tpl-1', 'Monthly Depreciation — Equipment', [line('l-1', '6400', 'Depreciation Expense', null, 45000, 0), line('l-2', '1510', 'Accumulated Depreciation', null, 0, 45000)], 0, 'Sarah Chen', '2026-02-05T10:00:00Z', 'Sarah Chen', '2026-02-05T10:01:00Z', 'Mike Torres', '2026-02-05T11:00:00Z', 'Sarah Chen', '2026-02-05T14:00:00Z', null, null, null),
  je('je-1039', 1039, '2026-01-31', 'Monthly depreciation — building', 'posted', 'template', 'tpl-2', 'Monthly Depreciation — Building', [line('l-3', '6400', 'Depreciation Expense', null, 12500, 0), line('l-4', '1510', 'Accumulated Depreciation', null, 0, 12500)], 0, 'Sarah Chen', '2026-02-05T10:05:00Z', 'Sarah Chen', '2026-02-05T10:06:00Z', 'Mike Torres', '2026-02-05T11:05:00Z', 'Sarah Chen', '2026-02-05T14:05:00Z', null, null, null),
  je('je-1040', 1040, '2026-01-31', 'Bad debt expense accrual', 'posted', 'manual', null, null, [line('l-5', '6700', 'Bad Debt Expense', null, 18500, 0), line('l-6', '1100', 'Allowance for Doubtful Accounts', null, 0, 15000), line('l-7', '1100', 'Accounts Receivable — Trade', 'AR invoice write-off', 0, 3500)], 1, 'Sarah Chen', '2026-02-07T09:00:00Z', 'Sarah Chen', '2026-02-07T09:30:00Z', 'Mike Torres', '2026-02-07T10:00:00Z', 'Sarah Chen', '2026-02-07T15:00:00Z', null, null, null),
  je('je-1041', 1041, '2026-01-31', 'Reclassify Q4 consulting revenue per contract review.', 'posted', 'manual', null, null, [line('l-8', '4200', 'Revenue — Service Income', null, 0, 125000), line('l-9', '7200', 'Revenue — Other', null, 125000, 0)], 0, 'Sarah Chen', '2026-02-08T11:00:00Z', 'Sarah Chen', '2026-02-08T11:15:00Z', 'Mike Torres', '2026-02-08T12:00:00Z', 'Sarah Chen', '2026-02-08T16:00:00Z', null, null, null),
  je('je-1042', 1042, '2026-01-31', 'Inventory reserve adjustment per year-end analysis', 'approved', 'manual', null, null, [line('l-10', '5300', 'COGS — Overhead', null, 52000, 0), line('l-11', '1200', 'Inventory — Raw Materials', null, 0, 52000)], 1, 'Sarah Chen', '2026-02-10T09:00:00Z', 'Sarah Chen', '2026-02-10T09:30:00Z', 'Mike Torres', '2026-02-10T14:00:00Z', null, null, null, null, null),
  je('je-1043', 1043, '2026-01-31', 'Bonus accrual — Q1 management bonus', 'proposed', 'manual', null, null, [line('l-12', '6100', 'Salaries & Wages', null, 175000, 0), line('l-13', '2100', 'Accrued Expenses', null, 0, 175000)], 0, 'Sarah Chen', '2026-02-12T10:00:00Z', 'Sarah Chen', '2026-02-12T10:05:00Z', null, null, null, null, null, null, null),
  je('je-1044', 1044, '2026-01-31', 'Rent prepayment correction', 'draft', 'manual', null, null, [line('l-14', '6300', 'Rent Expense', null, 15000, 0)], 0, 'Sarah Chen', '2026-02-14T08:00:00Z', null, null, null, null, null, null, null, null, null),
  je('je-1045', 1045, '2026-01-31', 'Professional fees accrual — Deloitte', 'rejected', 'manual', null, null, [line('l-15', '6700', 'Professional Fees', null, 28000, 0), line('l-16', '2100', 'Accrued Expenses', null, 0, 28000)], 0, 'Sarah Chen', '2026-02-13T11:00:00Z', 'Sarah Chen', '2026-02-13T11:10:00Z', null, null, null, null, 'Mike Torres', '2026-02-13T15:00:00Z', 'Amount should be $32,000 — check the updated invoice from Deloitte.'),
];

export const totalPostedDebitImpact = mockJournalEntries.filter((e) => e.status === 'posted').reduce((sum, e) => sum + e.lines.reduce((s, l) => s + l.debit, 0), 0);
