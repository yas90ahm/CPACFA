/**
 * Task Decomposition orchestrator types: Plan, Workers, Self-Correction, Final Output.
 */

import type { TrialBalanceResult, BalanceSheet, ProfitAndLoss } from './financial.js';

/** Plan steps for "Prepare the Q4 Financials" */
export type PlanStepId =
  | 'verify_gl'
  | 'reconcile_banks'
  | 'adjust_accruals'
  | 'generate_pl'
  | 'run_cfa_ratios';

export interface PlanStep {
  id: PlanStepId;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface Plan {
  id: string;
  label: string;
  steps: PlanStep[];
  startedAt: string;
  completedAt?: string;
}

/** Reconciliation Worker: flags mismatches (TB, bank rec, BS equation) */
export interface ReconciliationMismatch {
  type: 'trial_balance' | 'balance_sheet_equation' | 'bank_reconciliation';
  message: string;
  detail?: string;
  suggestedAction?: string;
}

export interface ReconciliationResult {
  passed: boolean;
  mismatches: ReconciliationMismatch[];
}

/** Self-correction: discrepancy found when Assets != Liabilities + Equity */
export interface DiscrepancyFinding {
  accountCode?: string;
  accountName: string;
  debit: number;
  credit: number;
  suggestedFix?: string;
}

export interface SelfCorrectionResult {
  corrected: boolean;
  discrepancyAmount: number;
  findings: DiscrepancyFinding[];
  message: string;
}

/** CFA ratios (for Run CFA Ratios step) */
export interface CFARatios {
  currentRatio?: number;
  quickRatio?: number;
  roe?: number;
  liquidityRiskLevel?: string;
}

/** Structured JSON output for frontend */
export interface Q4FinancialsOutput {
  plan: Plan;
  trialBalance: TrialBalanceResult;
  balanceSheet: BalanceSheet;
  profitAndLoss: ProfitAndLoss;
  reconciliation: ReconciliationResult;
  selfCorrection?: SelfCorrectionResult;
  cfaRatios?: CFARatios;
  financialHealthSummary: string;
  generatedAt: string;
}

/** Lead Partner CoT: sub-task (CPA or CFA) */
export interface CotSubTask {
  id: string;
  label: string;
  type: 'cpa' | 'cfa';
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
}

/** Lead Partner CoT: capability (tool) required */
export type ToolCapability = 'python' | 'rag' | 'erp';

/** Lead Partner CoT: conflict / variance note (e.g. Market vs. Historical Cost). citationStandard: e.g. ASC 205-40, IAS 1.25. */
export interface ConflictVariance {
  reason: string;
  cpa_summary?: string;
  cfa_summary?: string;
  recommendation: string;
  /** Optional standard citation (e.g. ASC 205-40, IAS 1.25, valuation guidance). */
  citationStandard?: string;
}

/** Lead Partner CoT: reasonability check after major calculation */
export interface ReasonabilityCheck {
  metric: string;
  value: number | string;
  passed: boolean;
  industry_note?: string;
  re_trace_recommendation?: string;
}

/** Lead Partner orchestrator output: thought_process + final answer */
export interface LeadPartnerOutput {
  thought_process: string;
  thought_process_xml: string;
  final_answer: string;
  cpa_sub_tasks: CotSubTask[];
  cfa_sub_tasks: CotSubTask[];
  tools_used: ToolCapability[];
  conflict_variance?: ConflictVariance;
  reasonability_checks: ReasonabilityCheck[];
  plan?: Plan;
  balance_sheet_summary?: { totalAssets: number; totalLiabilities: number; totalEquity: number };
  income_statement_summary?: { totalRevenue: number; totalExpenses: number; netIncome: number };
  cfa_ratios?: CFARatios;
  generatedAt: string;
}
