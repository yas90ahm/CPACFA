/**
 * Journal Entry system: lifecycle (draft → proposed → approved/posted/exported/rejected),
 * lines, attachments. Segregation: approved_by cannot equal created_by (configurable override).
 * Amount provenance is required at API for non-zero amounts and persisted on each line for audit trail.
 */

import type { AmountProvenance } from './amount_provenance.js';

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
  /** Persisted amount provenance for audit trail (required for non-zero at API). */
  amountProvenance?: AmountProvenance;
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
  lines: {
    accountRef: string;
    debit?: number;
    credit?: number;
    description?: string;
    /** Required for non-zero amounts; persisted on line for audit trail. */
    amountProvenance?: AmountProvenance;
  }[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}
