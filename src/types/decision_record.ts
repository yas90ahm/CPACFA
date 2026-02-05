/**
 * Decision records: append-only "why" for automated/assisted decisions (explainability).
 */

export type DecisionType =
  | 'classification'
  | 'coa_mapping'
  | 'recon_match'
  | 'je_suggestion'
  | 'anomaly_flag';

export interface DecisionRecord {
  id: string;
  closeSessionId: string | null;
  tenantId: string;
  decisionType: DecisionType;
  subjectRef: Record<string, unknown>;
  inputHash: string | null;
  inputSnapshot: Record<string, unknown> | null;
  outputSnapshot: Record<string, unknown> | null;
  confidenceScore: number | null;
  rationaleText: string | null;
  engineVersion: string | null;
  promptSnapshot: string | null;
  createdAt: string;
}

export interface CreateDecisionRecordInput {
  closeSessionId?: string | null;
  tenantId: string;
  decisionType: DecisionType;
  subjectRef: Record<string, unknown>;
  inputHash?: string | null;
  inputSnapshot?: Record<string, unknown> | null;
  outputSnapshot?: Record<string, unknown> | null;
  confidenceScore?: number | null;
  rationaleText?: string | null;
  engineVersion?: string | null;
  promptSnapshot?: string | null;
}
