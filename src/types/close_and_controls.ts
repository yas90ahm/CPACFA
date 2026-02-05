/**
 * Month-end close, JE suggestions, checklist, period lock, and segregation/audit log.
 */

import type { AmountProvenance, DebitCreditLineWithProvenance } from './amount_provenance.js';

export type { AmountProvenance, DebitCreditLineWithProvenance };

/** Suggested journal entry from gap or reconciliation mismatch. Amounts require valid amountProvenance to be accepted. */
export interface JournalEntrySuggestion {
  id: string;
  date: string; // ISO
  description: string;
  debits: DebitCreditLineWithProvenance[];
  credits: DebitCreditLineWithProvenance[];
  source: 'gap' | 'reconciliation' | 'manual';
  sourceDetail?: string;
  confidence?: number;
}

/** Close checklist step (with sign-off identity and task assignment) */
export interface CloseChecklistStep {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  /** Category for grouping (e.g. Cash, Receivables, Reporting) */
  category?: string;
  /** How to verify (e.g. Match bank to GL, Post invoices) */
  verificationMethod?: string;
  completedAt?: string; // ISO
  completedBy?: string;
  note?: string;
  /** Task assignment: who is responsible */
  assignee?: string;
  /** Due date (ISO) for this step */
  dueDate?: string;
  /** Sign-off: who approved (for control narrative) */
  signedOffBy?: string;
  signedOffAt?: string; // ISO
  /** Link to control (e.g. "TB review", "Bank rec") for audit trail */
  controlId?: string;
  /** FW1: Link to evidence (e.g. reconciliation ID, document ID) for "control performed → here is evidence" */
  evidenceId?: string;
  evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off';
}

/** Period lock: no edits after lock */
export interface PeriodLock {
  periodLabel: string; // e.g. "2025-01", "Q4 FY24"
  lockedAt: string; // ISO
  lockedBy: string;
  reason?: string;
}

/** Role for segregation of duties */
export type CloseRole = 'preparer' | 'reviewer' | 'approver';

/** Audit log entry (immutable) */
export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO
  actor: string; // user/role id
  action: string; // e.g. "close_checklist_complete", "period_lock", "je_post"
  resource?: string; // e.g. "period:2025-01", "checklist:step-1"
  detail?: string;
  payload?: Record<string, unknown>;
}

/** Control definition (for linking checklist to evidence) — FW4: owner, frequency, evidenceType */
export interface CloseControl {
  id: string;
  name: string; // e.g. "TB review", "Bank rec"
  description?: string;
  owner?: string;
  frequency?: 'monthly' | 'quarterly' | 'annual';
  evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off';
}

/** Assertion/risk linked to a control (audit risk mapping) */
export interface ControlAssertion {
  id: string;
  controlId: string;
  assertionLabel: string;
  riskCategory?: string;
  createdAt: string;
}

/** Task assignment for close (assignee, due date, status) */
export interface CloseTaskAssignment {
  stepId: string;
  assignee: string;
  dueDate: string; // ISO
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
}

/** Period close status (FW1: close calendar) */
export type PeriodCloseStatus = 'open' | 'in_progress' | 'locked';

/** Close progress stage for "where we are" in close */
export type CloseStage = 'no_tb' | 'unadjusted_in' | 'adjustments' | 'ready_to_close' | 'closed';

/** Close calendar entry: period + due date + status (+ optional progress for list) */
export interface CloseCalendarEntry {
  periodLabel: string;
  closeDueDate: string; // ISO date (e.g. 5th of next month)
  status: PeriodCloseStatus;
  lockedAt?: string;
  lockedBy?: string;
  /** Whether unadjusted TB exists for this period */
  hasUnadjustedTB?: boolean;
  /** Source of unadjusted TB: uploaded or synced */
  tbSource?: 'uploaded' | 'synced';
  /** When unadjusted TB was saved (ISO) */
  tbAt?: string;
  /** Derived stage for UI: no_tb | unadjusted_in | adjustments | ready_to_close | closed */
  closeStage?: CloseStage;
}

/** Unified close adjustment: JE or accrual suggestion with workflow status (FW1) */
export type CloseAdjustmentStatus = 'pending' | 'approved' | 'rejected' | 'posted';

export interface CloseAdjustment {
  id: string;
  periodLabel: string;
  source: 'gap' | 'reconciliation' | 'accrual' | 'manual';
  description: string;
  debits: { account: string; amount: number }[];
  credits: { account: string; amount: number }[];
  sourceDetail?: string;
  status: CloseAdjustmentStatus;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  postedAt?: string;
  /** GL external reference after push (idempotent post). */
  postedExternalId?: string;
}

/** Period close record — one per period with status and sign-off. */
export type PeriodCloseStatusType = 'draft' | 'in_review' | 'closed';

export interface PeriodCloseRecord {
  tenantId: string;
  periodLabel: string;
  status: PeriodCloseStatusType;
  closedAt?: string;
  closedBy?: string;
  /** Optional two-person sign-off: reviewer */
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Materiality settings — one source of truth for variance, sampling, disclosure (deterministic). */
export interface MaterialitySettings {
  overallMaterialityPercent?: number;
  overallMaterialityAmount?: number;
  performanceMaterialityPercent?: number;
  trivialThreshold?: number;
  basis?: 'net_income' | 'revenue' | 'total_assets';
}

/** FW1: Reconciliation resolution — assignee, due date, re-run when done (rec passed/failed) */
export interface ReconciliationResolution {
  id: string;
  periodLabel: string;
  reconciliationType: 'trial_balance' | 'balance_sheet_equation' | 'bank_reconciliation';
  passed: boolean;
  message?: string;
  detail?: string;
  assignee?: string;
  dueDate?: string; // ISO
  status: 'open' | 'in_progress' | 'resolved' | 're_run_pending' | 'waived';
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  waivedAt?: string;
  waivedBy?: string;
  waivedReason?: string;
}
