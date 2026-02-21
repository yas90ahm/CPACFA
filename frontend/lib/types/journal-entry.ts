export type TemplateFrequency = 'Monthly' | 'Quarterly' | 'Annual';

export type TemplatePeriodStatus = 'pending' | 'applied' | 'skipped';

export interface AJETemplate {
  id: string;
  sessionId: string;
  name: string;
  frequency: TemplateFrequency;
  debitAccountCode: string;
  debitAccountName: string;
  creditAccountCode: string;
  creditAccountName: string;
  amount: number;
  periodStatus: TemplatePeriodStatus;
  appliedOrSkippedBy: string | null;
  appliedOrSkippedAt: string | null;
  resultingJeId: string | null;
  skipReason: string | null;
}

export type JournalEntryStatus = 'draft' | 'proposed' | 'approved' | 'posted' | 'rejected';

export type JournalEntrySource = 'template' | 'manual';

export interface JournalEntryLine {
  id: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  sessionId: string;
  jeNumber: number;
  date: string;
  memo: string;
  status: JournalEntryStatus;
  source: JournalEntrySource;
  templateId: string | null;
  templateName: string | null;
  lines: JournalEntryLine[];
  evidenceCount: number;
  createdBy: string;
  createdAt: string;
  proposedBy: string | null;
  proposedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  postedBy: string | null;
  postedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

export const MATERIALITY_THRESHOLD = 10_000;
