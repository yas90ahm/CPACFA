export type VarianceExplanationStatus = 'not_required' | 'pending' | 'explained' | 'approved';

export interface VarianceRecord {
  id: string;
  lineItemName: string;
  statementType: string;
  priorAmount: string;
  currentAmount: string;
  changeAmount: string;
  changePercent: string;
  isMaterial: boolean;
  materialityThreshold: string;
  explanation: string | null;
  explanationStatus: VarianceExplanationStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  aiDraftExplanation: string | null;
}
