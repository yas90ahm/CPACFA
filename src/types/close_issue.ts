/**
 * Unified close issue (HITL) types.
 * Lifecycle: DETECTED → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED (or WAIVED).
 */

export type IssueType =
  | 'tb_imbalance'
  | 'unmapped_account'
  | 'new_account_detected'
  | 'unusual_balance_direction'
  | 'significant_period_variance'
  | 'recon_over_tolerance'
  | 'recon_not_started'
  | 'recon_incomplete'
  | 'subledger_gl_mismatch'
  | 'unposted_recurring_aje'
  | 'pending_aje_template'
  | 'aje_pending_approval'
  | 'aje_missing_documentation'
  | 'aje_rejected'
  | 'bs_imbalance'
  | 'cf_unreconciled'
  | 'cf_unclassified_change'
  | 'net_income_mismatch'
  | 'mapping_error'
  | 'missing_variance_explanation'
  | 'ratio_anomaly'
  | 'duplicate_entry'
  | 'round_number_suspicious'
  | 'period_reopened'
  | 'manual_flag'
  | 'review_rejection';

export type CloseIssueSeverity = 'critical' | 'blocking' | 'warning' | 'info';

export type CloseIssueCategory =
  | 'ingestion'
  | 'reconciliation'
  | 'adjustment'
  | 'statement'
  | 'review'
  | 'general';

export type CloseIssueStatus =
  | 'detected'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'verified'
  | 'waived';

export type ResolutionType =
  | 'aje_posted'
  | 'mapping_corrected'
  | 'reingested'
  | 'reconciling_items_added'
  | 'recon_completed'
  | 'classification_updated'
  | 'acknowledged_with_justification'
  | 'escalated_and_resolved'
  | 'documentation_added'
  | 'entry_approved'
  | 'manual_correction';

export interface CloseIssue {
  issueId: string;
  tenantId: string;
  periodId: string;
  entityId: string;
  issueType: IssueType;
  severity: CloseIssueSeverity;
  category: CloseIssueCategory;
  status: CloseIssueStatus;
  title: string;
  description: string;
  affectedAccounts: string[];
  affectedAmount: string | null;
  sourceCheck: string | null;
  sourceDetails: Record<string, unknown>;
  assignedTo: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
  resolutionType: ResolutionType | null;
  resolutionDescription: string | null;
  resolutionAjeId: string | null;
  resolutionReconId: string | null;
  resolutionMappingChange: Record<string, unknown> | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  verificationMethod: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueHistoryEntry {
  historyId: string;
  issueId: string;
  fromStatus: CloseIssueStatus;
  toStatus: CloseIssueStatus;
  changedBy: string;
  changedAt: string;
  comment: string | null;
}

export interface IssueSummary {
  critical: { open: number; resolved: number; verified: number; waived?: number };
  blocking: { open: number; resolved: number; verified: number; waived?: number };
  warning: { open: number; resolved: number; verified: number; waived: number };
  info: { open: number; resolved: number; verified: number; waived: number };
}

export interface CreateCloseIssueInput {
  tenantId: string;
  periodId: string;
  entityId: string;
  issueType: IssueType;
  severity: CloseIssueSeverity;
  category: CloseIssueCategory;
  title: string;
  description?: string;
  affectedAccounts?: string[];
  affectedAmount?: string | null;
  sourceCheck?: string | null;
  sourceDetails?: Record<string, unknown>;
}

export interface ResolveIssueInput {
  resolutionType: ResolutionType;
  resolutionDescription: string;
  resolvedBy: string;
  resolutionAjeId?: string | null;
  resolutionReconId?: string | null;
  resolutionMappingChange?: Record<string, unknown> | null;
}
