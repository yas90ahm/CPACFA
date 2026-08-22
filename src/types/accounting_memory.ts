import type { AmountProvenance } from './amount_provenance.js';
import type { JournalEntrySource, JournalEntryStatus } from './journal_entry.js';

export type AccountingCorrectionApplicability = 'one_time' | 'recurring' | 'policy_candidate';
export type AccountingMemoryScope = 'transaction_pattern' | 'account' | 'entity';
export type AccountingMemoryStatus = 'candidate' | 'approved' | 'superseded' | 'revoked';
export type AccountingMemoryApplicationOutcome =
  | 'context_supplied'
  | 'consistent'
  | 'conflict_blocked'
  | 'suggested'
  | 'accepted'
  | 'rejected';

export interface AccountingJournalSnapshotLine {
  accountRef: string;
  debit: string;
  credit: string;
  description?: string;
  amountProvenance?: AmountProvenance;
}

export interface AccountingJournalSnapshot {
  journalEntryId: string;
  status: JournalEntryStatus;
  memo?: string;
  source: JournalEntrySource;
  lines: AccountingJournalSnapshotLine[];
}

export interface JournalTreatmentLinePattern {
  accountRef: string;
  side: 'debit' | 'credit';
  descriptionTokens: string[];
}

export interface JournalTreatmentSubject {
  memoTokens: string[];
  originalLinePattern: JournalTreatmentLinePattern[];
  originalSource: JournalEntrySource;
}

export interface JournalTreatment {
  correctedMemo: string;
  correctedMemoTokens: string[];
  correctedLinePattern: JournalTreatmentLinePattern[];
  amountPolicy: 'recalculate_from_current_period_source';
  requiresCurrentPeriodEvidence: true;
  reusableAmountsStored: false;
}

export interface AccountingCorrectionEvent {
  id: string;
  tenantId: string;
  entityId: string;
  closeSessionId: string;
  periodLabel: string;
  framework: 'ASPE';
  correctionType: 'journal_entry';
  originalJournalEntryId: string;
  replacementJournalEntryId: string;
  beforeSnapshot: AccountingJournalSnapshot;
  afterSnapshot: AccountingJournalSnapshot;
  rationale: string;
  applicability: AccountingCorrectionApplicability;
  memoryScope: AccountingMemoryScope;
  correctedBy: string;
  createdAt: string;
}

export interface AccountingMemory {
  id: string;
  tenantId: string;
  entityId: string;
  framework: 'ASPE';
  memoryType: 'journal_treatment';
  status: AccountingMemoryStatus;
  patternSignature: string;
  subject: JournalTreatmentSubject;
  treatment: JournalTreatment;
  rationale: string;
  applicability: AccountingCorrectionApplicability;
  memoryScope: AccountingMemoryScope;
  effectiveFromPeriod: string;
  effectiveToPeriod?: string;
  sourceCorrectionEventId: string;
  supersedesMemoryId?: string;
  conflictsWithMemoryId?: string;
  approvedBy?: string;
  approvedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionReason?: string;
  createdAt: string;
}

export interface AccountingMemoryApplication {
  id: string;
  tenantId: string;
  entityId: string;
  closeSessionId: string;
  memoryId: string;
  targetType: 'journal_entry' | 'runbook_task' | 'close_session';
  targetId: string;
  taskExecutionId?: string;
  outcome: AccountingMemoryApplicationOutcome;
  similarity: number;
  detail: Record<string, unknown>;
  appliedBy: string;
  createdAt: string;
}

export interface AccountingMemoryMatch {
  memory: AccountingMemory;
  similarity: number;
  relationship: 'consistent' | 'conflict' | 'context';
  reason: string;
}

export interface CorrectJournalEntryInput {
  tenantId: string;
  journalEntryId: string;
  correctedBy: string;
  rationale: string;
  applicability: AccountingCorrectionApplicability;
  memoryScope: AccountingMemoryScope;
  memo: string;
  lines: Array<{
    accountRef: string;
    debit?: number;
    credit?: number;
    description?: string;
  }>;
}

export interface CorrectJournalEntryResult {
  correction: AccountingCorrectionEvent;
  memory: AccountingMemory;
  replacementJournalEntryId: string;
  memoryConflictRequiresApproval: boolean;
}
