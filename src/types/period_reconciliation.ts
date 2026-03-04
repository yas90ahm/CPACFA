/**
 * Period reconciliation types (Step 5).
 * Requirements are per entity; period recons are per close period per account.
 */

export type ReconExpectedSource =
  | 'bank_statement'
  | 'subledger'
  | 'aging_report'
  | 'amortization_schedule'
  | 'loan_statement'
  | 'physical_count'
  | 'rollforward'
  | 'schedule'
  | 'other';

export type ReconToleranceType = 'absolute' | 'percentage';

export type PeriodReconStatus = 'not_started' | 'in_progress' | 'completed' | 'approved';

export type ReconItemType =
  | 'outstanding_check'
  | 'deposit_in_transit'
  | 'bank_fee'
  | 'timing_difference'
  | 'error_correction'
  | 'accrual'
  | 'amortization'
  | 'depreciation'
  | 'addition'
  | 'disposal'
  | 'reclassification'
  | 'write_off'
  | 'payment'
  | 'collection'
  | 'intercompany'
  | 'other';

export interface ReconRequirement {
  requirementId: string;
  tenantId: string;
  entityId: string;
  accountCode: string;
  accountName: string | null;
  isRequired: boolean;
  toleranceAmount: string;
  toleranceType: ReconToleranceType;
  tolerancePercentage: string | null;
  expectedSource: ReconExpectedSource;
  requiresReviewerApproval: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface PeriodReconciliation {
  reconId: string;
  tenantId: string;
  periodId: string;
  entityId: string;
  requirementId: string;
  accountCode: string;
  accountName: string | null;
  glBalance: string | null;
  supportingBalance: string | null;
  variance: string | null;
  toleranceAmount: string;
  isWithinTolerance: boolean | null;
  reconcilingItemsTotal: string;
  unexplainedVariance: string | null;
  supportingSource: string | null;
  supportingDocumentRefs: string[];
  varianceExplanation: string | null;
  status: PeriodReconStatus;
  preparedBy: string | null;
  preparedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: string | null;
  priorPeriodSessionId: string | null;
  priorPeriodGlBalance: string | null;
  priorPeriodSupportingBalance: string | null;
  copiedFromPrior: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReconItem {
  itemId: string;
  reconId: string;
  description: string;
  amount: string;
  itemType: ReconItemType;
  needsAje: boolean;
  ajeId: string | null;
  createdAt: string;
  createdBy: string | null;
}
