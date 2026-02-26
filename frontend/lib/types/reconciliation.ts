export type ReconStatus = 'not_started' | 'in_progress' | 'completed' | 'approved';

export type ReconcilingItemType =
  | 'Outstanding Check'
  | 'Deposit in Transit'
  | 'Bank Fee'
  | 'Timing Difference'
  | 'Error Correction'
  | 'Other';

export interface ReconcilingItem {
  id: string;
  reconId: string;
  description: string;
  amount: number;
  type: ReconcilingItemType;
  date: string | null;
}

export interface Reconciliation {
  id: string;
  sessionId: string;
  accountCode: string;
  accountName: string;
  glBalance: number;
  supportingBalance: number | null;
  variance: number;
  reconcilingItemsTotal: number;
  unexplainedVariance: number;
  tolerance: number;
  status: ReconStatus;
  evidenceCount: number;
  preparer: string | null;
  reviewer: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  notes: string | null;
  sourceDocumentType: string;
}
