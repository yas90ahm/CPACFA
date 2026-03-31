export type IssueSeverity = 'CRITICAL' | 'BLOCKING' | 'WARNING' | 'INFO';
export type IssueStatus =
  | 'DETECTED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'VERIFIED';

export interface CloseIssue {
  id: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  category: string;
  affectedAccounts: string[];
  assignedTo: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  navigateTo: string;
}
