/**
 * Reconciliation state machine: runs, items, match groups, exceptions, signoffs.
 */

export type ReconRunType = 'bank' | 'ar' | 'ap' | 'interco';
export type ReconRunStatus = 'draft' | 'in_progress' | 'ready_for_review' | 'signed_off';
export type ReconItemSource = 'bank' | 'gl' | 'subledger';
export type MatchGroupStatus = 'proposed' | 'confirmed' | 'rejected';
export type ReconExceptionStatus = 'open' | 'resolved' | 'wont_fix';

export interface ReconRun {
  id: string;
  closeSessionId: string;
  type: ReconRunType;
  createdAt: string;
  status: ReconRunStatus;
}

export interface ReconItem {
  id: string;
  reconRunId: string;
  source: ReconItemSource;
  amount: number;
  itemDate?: string;
  description?: string;
  ref?: Record<string, unknown>;
  createdAt: string;
}

export interface ReconMatchGroup {
  id: string;
  reconRunId: string;
  status: MatchGroupStatus;
  matchConfidence?: number;
  decisionRecordId?: string;
  createdAt: string;
}

export interface ReconMatchGroupItem {
  matchGroupId: string;
  reconItemId: string;
}

export interface ReconException {
  id: string;
  reconRunId: string;
  reason: string;
  status: ReconExceptionStatus;
  linkedIssueId?: string;
  createdAt: string;
}

export interface ReconSignoff {
  reconRunId: string;
  signedBy: string;
  signedAt: string;
  notes?: string;
}

export interface IngestReconItemInput {
  source: ReconItemSource;
  amount: number;
  itemDate?: string;
  description?: string;
  ref?: Record<string, unknown>;
}

export interface ProposeMatchInput {
  reconItemIds: string[];
  matchConfidence?: number;
  decisionRecordId?: string;
}
