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
