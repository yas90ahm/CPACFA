/**
 * Close session: (tenant, entity, period_start, period_end, basis, standard).
 * Imports, issues, reconciliations, JEs, statements, exports attach to close_session_id.
 */

export type CloseSessionBasis = 'cash' | 'accrual';

export type CloseSessionStandard = 'GAAP' | 'IFRS' | string;

export type CloseSessionStatus =
  | 'open'
  | 'in_progress'
  | 'under_review'
  | 'certified'
  | 'subsequent_events_review'
  | 'locked';

export interface CloseSession {
  id: string;
  tenantId: string;
  entityId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  basis: CloseSessionBasis;
  standard: CloseSessionStandard;
  status: CloseSessionStatus;
  certifiedBy?: string;
  certifiedAt?: string;  // ISO
  certificationMemo?: string;
  /** Ledger snapshot id created at certification (source of truth for binder/export). */
  certifiedSnapshotId?: string;
  /** Certification artifact id (signed attestation). */
  certificationArtifactId?: string;
  /** Set when session is reopened from certified (CERTIFIED → IN_PROGRESS). */
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
  /** Set when TB changes (cascade); cleared when statements regenerated. */
  statementsStaleSince?: string;
  /** Who advanced this session to UNDER_REVIEW (for SoD enforcement). */
  advancedToReviewBy?: string | null;
  advancedToReviewAt?: string | null;
  /** Who confirmed "no subsequent events" (ASC 855). */
  subsequentEventsConfirmedBy?: string | null;
  subsequentEventsConfirmedAt?: string | null;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
}

export interface CreateCloseSessionInput {
  tenantId: string;
  entityId: string;
  periodStart: string;
  periodEnd: string;
  basis?: CloseSessionBasis;
  standard?: CloseSessionStandard;
  status?: CloseSessionStatus;
}

export interface ListCloseSessionsInput {
  tenantId: string;
  entityId?: string;
  status?: CloseSessionStatus;
}
