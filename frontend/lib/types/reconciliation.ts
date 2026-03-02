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
  /** Decimal string from backend — never convert to JS number */
  amount: string;
  type: ReconcilingItemType;
  date: string | null;
}

export interface Reconciliation {
  id: string;
  sessionId: string;
  accountCode: string;
  accountName: string;
  /** Decimal string from backend */
  glBalance: string;
  /** Decimal string from backend */
  supportingBalance: string | null;
  /** Decimal string from backend (GENERATED ALWAYS column) */
  variance: string;
  /** Decimal string from backend (GENERATED ALWAYS column) */
  reconcilingItemsTotal: string;
  /** Decimal string from backend (GENERATED ALWAYS column) */
  unexplainedVariance: string;
  /** Decimal string from backend */
  tolerance: string;
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
