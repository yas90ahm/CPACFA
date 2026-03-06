/**
 * Close checklist items: per-session required controls for readiness gating.
 * Codes: CASH_REC, NO_CRITICAL_ISSUES, MATERIAL_JES_APPROVED, INTEGRITY_CHECKS.
 */

export type CloseChecklistItemStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export type CloseChecklistItemCode =
  | 'CASH_REC'
  | 'NO_CRITICAL_ISSUES'
  | 'MATERIAL_JES_APPROVED'
  | 'INTEGRITY_CHECKS';

export interface CloseChecklistItem {
  id: string;
  closeSessionId: string;
  code: CloseChecklistItemCode;
  name: string;
  status: CloseChecklistItemStatus;
  required: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloseReadinessResult {
  ready: boolean;
  hardBlockers: string[];
  softWarnings: string[];
  checklistComplete: boolean;
  cashRecComplete: boolean;
  noCriticalIssues: boolean;
  materialJesApproved: boolean;
  integrityChecksPass: boolean;
  /** Total journal entries count (0 means none posted) */
  jeTotal: number;
}
