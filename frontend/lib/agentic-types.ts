/**
 * Agentic upgrade types — quality checks, data gaps, policy proposals, HITL, standard inference.
 * Mirrors backend response shapes from trial-balance/ingest and result_generator.
 */

export type QualitySeverity = 'info' | 'warning' | 'critical';

export interface QualityCheck {
  id: string;
  severity: QualitySeverity;
  title: string;
  message: string;
  metric?: number;
}

export type DataGapType =
  | 'missing_liability'
  | 'missing_asset'
  | 'missing_identity'
  | 'missing_transactions'
  | 'agentic_anomaly';

export interface DataGap {
  id: string;
  type: DataGapType;
  title: string;
  description: string;
  urgency: 'high' | 'medium';
  suggestion?: string;
}

export interface PolicyProposal {
  policyArea: string;
  changeDescription: string;
  reasoning: string;
  citation?: string;
  confidence: number;
}

export interface HITLStatus {
  escalated: boolean;
  stagingId?: string;
}

export interface AgenticAssessmentItem {
  id: string;
  type: 'quality' | 'gap';
  severity: QualitySeverity;
  rationale: string;
  recommendedAction: string;
}

export interface AgenticQualityAssessment {
  overallSeverity: QualitySeverity;
  summary: string;
  recommendedActions: string[];
  items: AgenticAssessmentItem[];
}

export type AccountingStandard = 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';

export interface StandardInference {
  standard: AccountingStandard | null;
  confidence: number;
  reasoning?: string;
}

export interface AuditLinks {
  binderUrl?: string;
  gaapConsistencyUrl?: string;
  sourceDocumentName?: string;
  sourceDocumentId?: string;
}
