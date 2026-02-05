/**
 * Issue (Exception) items tied to close_session_id.
 * Anomalies, low-confidence classification, imbalance, missing data, recon mismatch become Issues.
 */

export type IssueCategory =
  | 'intake'
  | 'classification'
  | 'reconciliation'
  | 'posting'
  | 'policy'
  | 'presentation'
  | 'export_blocker';

export type IssueSeverity = 'low' | 'med' | 'high' | 'critical';

export type IssueStatus =
  | 'open'
  | 'in_progress'
  | 'needs_info'
  | 'needs_approval'
  | 'resolved'
  | 'wont_fix';

export interface IssueItem {
  id: string;
  closeSessionId: string;
  tenantId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: IssueStatus;
  title: string;
  description?: string;
  impactPl?: number;
  impactBs?: number;
  impactCash?: number;
  currency?: string;
  materialityEstimate?: number;
  materialityThresholdUsed?: number;
  confidenceScore?: number;
  sourceRef?: Record<string, unknown>;
  assignedTo?: string;
  dueDate?: string; // YYYY-MM-DD
  createdBy?: string;
  updatedBy?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface CreateIssueInput {
  closeSessionId: string;
  tenantId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description?: string;
  impactPl?: number;
  impactBs?: number;
  impactCash?: number;
  currency?: string;
  materialityEstimate?: number;
  materialityThresholdUsed?: number;
  confidenceScore?: number;
  sourceRef?: Record<string, unknown>;
  assignedTo?: string;
  dueDate?: string;
  createdBy?: string;
  status?: IssueStatus;
}

export interface ListIssuesFilters {
  tenantId: string;
  closeSessionId?: string;
  category?: IssueCategory;
  severity?: IssueSeverity;
  status?: IssueStatus;
  assignedTo?: string;
}
