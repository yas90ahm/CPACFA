/**
 * Triage assessment: materiality threshold, risk score, top risk drivers.
 * Deterministic: same TB + issues => same output.
 */

export type MaterialityMethod = 'pct_revenue' | 'pct_expenses' | 'fixed';

export interface MaterialityOptions {
  /** For pct_revenue / pct_expenses: percentage 0–1 (e.g. 0.05 = 5%) */
  percentage?: number;
  /** For fixed: absolute threshold */
  fixedAmount?: number;
}

export interface TbSummary {
  totalRevenue: number;
  totalExpenses: number;
  totalDebits: number;
  totalCredits: number;
}

export interface MaterialityResult {
  materialityThreshold: number;
  basisUsed: string;
}

export interface RiskDriver {
  driver: string;
  contribution: number;
  detail?: string;
}

export interface RiskScoreResult {
  riskScore: number;
  topRiskDrivers: RiskDriver[];
}

export interface TriageAssessment {
  id: string;
  closeSessionId: string;
  riskScore: number;
  materialityThreshold: number;
  basisUsed: string;
  summaryJson: TriageSummaryJson;
  createdAt: string;
}

export interface TriageSummaryJson {
  materiality?: MaterialityResult;
  risk?: RiskScoreResult;
  issueCount?: number;
  unresolvedCount?: number;
}
