/**
 * Types for trial-balance ingest response (POST /api/trial-balance/ingest).
 * Mirrors backend response shape for statements, quality, audit links.
 */

import type {
  QualityCheck,
  DataGap,
  PolicyProposal,
  HITLStatus,
  AgenticQualityAssessment,
  AccountingStandard,
  AuditLinks,
} from '@/lib/agentic-types';

/** Single line on a financial statement */
export interface FinancialStatementLine {
  label: string;
  amount: number;
  accountCode?: string;
}

/** Balance Sheet (assets, liabilities, equity) */
export interface BalanceSheet {
  assets: FinancialStatementLine[];
  liabilities: FinancialStatementLine[];
  equity: FinancialStatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balances: boolean;
  reportDate?: string;
  codificationRef?: { framework: string; citation: string };
}

/** P&L (revenue, expenses, net income) */
export interface ProfitAndLoss {
  revenue: FinancialStatementLine[];
  expenses: FinancialStatementLine[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  reportDate?: string;
  codificationRef?: { framework: string; citation: string };
}

/** Reasoning chain from Plan-Execute-Verify */
export interface ReasoningChain {
  plan: string;
  executedAt: string;
  verification: { passed: boolean; checks: string[] };
  verificationSummary?: string;
  lineRationales?: Array<{ lineIndex: number; label: string; accountType: string; rationale: string }>;
}

/** Trial balance result (entries + totals) */
export interface TrialBalanceResult {
  entries: Array<{
    accountName: string;
    debit: number;
    credit: number;
    accountType?: string;
  }>;
  totalDebits: number;
  totalCredits: number;
  balances: boolean;
  errors: string[];
}

/** Audit links returned by ingest */
export interface IngestAudit {
  binderUrl?: string;
  gaapConsistencyUrl?: string;
  reconciliationSummaryUrl?: string;
  todosUrl?: string;
  sourceDocumentName?: string;
  sourceDocumentId?: string;
}

/** Full ingest API response */
export interface IngestResult {
  reasoningChain: ReasoningChain;
  trialBalance: TrialBalanceResult;
  balanceSheet: BalanceSheet;
  profitAndLoss: ProfitAndLoss;
  standard?: AccountingStandard;
  cashFlow?: {
    operating?: Array<{ label: string; amount: number }>;
    investing?: Array<{ label: string; amount: number }>;
    financing?: Array<{ label: string; amount: number }>;
    netChangeInCash?: number;
    beginningCash?: number;
    endingCash?: number;
  };
  equityChanges?: {
    openingEquity?: number;
    changes?: Array<{ label: string; amount: number }>;
    closingEquity?: number;
  };
  notesAndPolicies?: { standard: string; notes: Array<{ title: string; content: string }> };
  ratios?: Record<string, number>;
  executiveMemo?: string;
  qualityChecks?: QualityCheck[];
  dataGaps?: DataGap[];
  policyProposals?: PolicyProposal[];
  agenticAssessment?: AgenticQualityAssessment;
  hitl?: HITLStatus;
  similarPrecedent?: string;
  professionalReview?: Record<string, unknown>;
  audit?: IngestAudit;
  standardInference?: { standard: AccountingStandard | null; confidence: number; reasoning?: string };
}
