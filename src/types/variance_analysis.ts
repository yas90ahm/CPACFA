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
  currentAmount: number;
  priorAmount: number;
  changeAmount: number;
  changePercentage: number | null;
  materialThresholdPct: number;
  explanation?: string;
  /** AI-generated draft explanation (advisory; human edits and submits final). */
  aiDraftExplanation?: string;
  /** How the explanation was created: manual, ai_draft (accepted as-is), ai_edited (AI draft modified by human). */
  explanationSource?: 'manual' | 'ai_draft' | 'ai_edited';
  approvedAt?: string;
  approvedBy?: string;
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
