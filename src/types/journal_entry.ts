/**
 * Journal Entry system: lifecycle (draft → proposed → approved/posted/exported/rejected),
 * lines, attachments. Segregation: approved_by cannot equal created_by (configurable override).
 */

export type JournalEntryStatus =
  | 'draft'
  | 'proposed'
  | 'approved'
  | 'posted'
  | 'exported'
  | 'rejected';

export type JournalEntrySource = 'manual' | 'suggestion' | 'recon' | 'accrual';

export interface JournalEntry {
  id: string;
  closeSessionId: string;
  tenantId: string;
  status: JournalEntryStatus;
  memo?: string;
  source: JournalEntrySource;
  createdBy?: string;
  approvedBy?: string;
  postedAt?: string;
  reversalDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryLine {
  jeId: string;
  lineIndex: number;
  accountRef: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntryAttachment {
  id: string;
  jeId: string;
  fileRef: string;
  uploadedAt: string;
}

export interface CreateDraftJEInput {
  closeSessionId: string;
  tenantId: string;
  memo?: string;
  source: JournalEntrySource;
  createdBy?: string;
  lines: { accountRef: string; debit?: number; credit?: number; description?: string }[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}
