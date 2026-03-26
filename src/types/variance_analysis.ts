/**
 * Variance analysis: period-over-period changes. change_amount and change_percentage are DB-generated.
 */

export interface VarianceRecord {
  id: string;
  tenantId: string;
  closeSessionId: string;
  periodLabel: string;
  fsLineId: string;
  statement: string;
  label?: string;
  currentAmount: string;
  priorAmount: string;
  changeAmount: string;
  changePercentage: string | null;
  materialThresholdPct: string;
  isMaterial: boolean;
  explanation?: string;
  /** AI-generated draft explanation (advisory; human edits and submits final). */
  aiDraftExplanation?: string;
  /** How the explanation was created: manual, ai_draft (accepted as-is), ai_edited (AI draft modified by human). */
  explanationSource?: 'manual' | 'ai_draft' | 'ai_edited';
  approvedAt?: string;
  approvedBy?: string;
  /** User who explicitly attested they reviewed an AI-drafted explanation. */
  humanReviewedBy?: string;
  humanReviewedAt?: string;
  /** Classification of the variance (e.g. 'volume', 'price', 'timing', 'one-time', 'structural'). */
  varianceType?: string;
  /** Projected full-year impact = monthly variance x remaining months. */
  fullYearImpact?: string;
  createdAt: string;
}

export interface ComputeVariancesInput {
  tenantId: string;
  closeSessionId: string;
  periodLabel: string;
  currentLines: Array<{ fsLineId: string; amount: number; statement: string; label?: string }>;
  priorLines: Array<{ fsLineId: string; amount: number; statement: string; label?: string }>;
  materialThresholdPct?: number;
}
