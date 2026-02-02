/**
 * Professional audit flags and review response (Judgment Layer).
 * Flag-only; no auto-execute. Human sign-off required.
 */

export type ProfessionalAuditFlagCategory =
  | 'substance_over_form'
  | 'revenue_recognition'
  | 'gips_ethics'
  | 'going_concern'
  | 'fraud_skepticism'
  | 'integrity_variance';

export type ProfessionalAuditFlagSeverity = 'low' | 'medium' | 'high_cam';

export type ProfessionalAuditFlagStatus = 'open' | 'acknowledged' | 'resolved';

export interface ProfessionalAuditFlag {
  id: string;
  tenantId: string;
  periodLabel?: string;
  runId?: string;
  category: ProfessionalAuditFlagCategory;
  severity: ProfessionalAuditFlagSeverity;
  message: string;
  recommendation: string;
  citationStandard: string;
  citationExcerpt?: string;
  sourceDocumentId?: string;
  sourceDocumentLine?: string;
  status: ProfessionalAuditFlagStatus;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewFlagSummary {
  flagId: string;
  category: ProfessionalAuditFlagCategory;
  severity: ProfessionalAuditFlagSeverity;
  message: string;
  recommendation: string;
  citationStandard: string;
  sourceExcerpt?: string;
}

export type ProfessionalReviewOverallRisk = 'low' | 'medium' | 'high_cam';

export interface ProfessionalReviewResponse {
  runId: string;
  periodLabel: string;
  overallRisk: ProfessionalReviewOverallRisk;
  flags: ReviewFlagSummary[];
  goingConcernConclusion?: string;
  recommendedDisclosure?: string;
}

/** Minimal covenant result for going-concern protocol. */
export interface ProfessionalReviewCovenantResult {
  debtToEbitdaBreach?: boolean;
  interestCoverageBreach?: boolean;
}

/** Minimal liquidity for going-concern protocol. */
export interface ProfessionalReviewLiquidityMetrics {
  currentRatio?: number;
  runwayMonths?: number;
  /** Optional: monthly burn for accelerating-burn check. */
  burnRate?: number;
}

/** Prior-period liquidity for deteriorating runway / accelerating burn. */
export interface ProfessionalReviewPriorLiquidity {
  runwayMonths?: number;
  burnRate?: number;
}

/** Input for running the professional review (Judgment Layer). */
export interface ProfessionalReviewInput {
  tenantId: string;
  periodLabel: string;
  runId: string;
  /** Narrative evidence state: empty string = no narrative provided (triggers QUALITATIVE_EVIDENCE_MISSING when Integration on). */
  narrativeEvidenceSummary: string;
  trialBalance?: { entries: { accountName: string; debit: number; credit: number }[] };
  balanceSheet?: { totalAssets: number; totalLiabilities: number; totalEquity: number };
  profitAndLoss?: { totalRevenue: number; totalExpenses: number; netIncome: number };
  covenantResult?: ProfessionalReviewCovenantResult;
  liquidityMetrics?: ProfessionalReviewLiquidityMetrics;
  /** Prior-period liquidity for accelerating-burn / deteriorating runway. */
  priorLiquidityMetrics?: ProfessionalReviewPriorLiquidity;
  contracts?: Array<{ contractNumber: string; description?: string; performanceObligations: Array<{ name: string; description?: string }>; totalContractValue: number }>;
  /** Optional: raw contract narrative(s) for substance-over-form (embedded lease) assessment. */
  contractText?: string | string[];
  /** Optional: lease document narrative(s) for substance-over-form (embedded lease) assessment. */
  leaseDocuments?: string | string[];
  /** Optional: revenue in final 5 business days of quarter (for channel-stuffing check). */
  revenueInLast5BusinessDays?: number;
  /** Optional: total quarterly revenue (for channel-stuffing check). */
  totalQuarterlyRevenue?: number;
  leases?: unknown[];
  portfolioPerformanceByPortfolio?: Record<string, { periodLabel: string; totalReturn?: number }[]>;
}
