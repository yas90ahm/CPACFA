/**
 * GL Investigation Engine + Conversational Variance Analysis types.
 * Layer 1 (deterministic), Layer 2 (AI advisory), Layer 3 (provenance enforcement).
 */

/* ── Layer 1: GL Investigation Engine ─────────────────────────── */

export interface InvestigationParams {
  tenantId: string;
  entityId: string;
  fsLineId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  priorPeriodStart: string;
  priorPeriodEnd: string;
  closeSessionId?: string;
}

export interface AnalyticalSignals {
  /** Changes in related FS lines (e.g., Revenue → also show COGS, AR) */
  relatedLineChanges: Array<{
    fsLineId: string;
    fsLineLabel: string;
    changeAmount: string;
    changePercent: string;
  }>;
  /** Warning if a single account dominates the change (> 60%) */
  concentrationWarning: string | null;
  /** Sum of changeAmount for recurring accounts */
  recurringChangeAmount: string;
  /** Sum of changeAmount for non-recurring accounts */
  nonRecurringChangeAmount: string;
  /** Accounts new in the current period */
  newAccountCount: number;
  /** Accounts that existed in prior but not current */
  eliminatedAccountCount: number;
  /** Top keywords from GL memos (deterministic extraction) */
  topKeywords: string[];
  /** Accounts whose change direction matches the total direction */
  accountsMovingWithTotal: number;
  /** Accounts whose change direction opposes the total direction */
  accountsMovingAgainstTotal: number;
}

export interface InvestigationResult {
  fsLineId: string;
  fsLineLabel: string;
  currentTotal: string;
  priorTotal: string;
  changeAmount: string;
  changePercent: string;
  contributingAccounts: ContributingAccount[];
  analyticalSignals?: AnalyticalSignals;
  metadata: {
    accountsAnalyzed: number;
    periodLabel: string;
    generatedAt: string;
    computationMethod: 'gl_detail' | 'trial_balance_delta';
  };
}

export interface ContributingAccount {
  accountCode: string;
  accountName: string;
  currentBalance: string;
  priorBalance: string;
  changeAmount: string;
  changePercent: string;
  percentOfTotalChange: string;
  direction: 'increase' | 'decrease' | 'new' | 'eliminated';
  transactionCount?: number;
  isRecurring: boolean;
  topMemos: string[];
}

export interface AccountDrilldownParams {
  tenantId: string;
  entityId: string;
  accountCode: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  priorPeriodStart: string;
  priorPeriodEnd: string;
}

export interface AccountDrilldownResult {
  accountCode: string;
  accountName: string;
  currentBalance: string;
  priorBalance: string;
  changeAmount: string;
  entries: GLEntryDetail[];
  summary: {
    totalEntries: number;
    totalDebits: string;
    totalCredits: string;
    uniqueJournalEntries: number;
    dateRange: { earliest: string; latest: string };
  };
}

export interface GLEntryDetail {
  date: string;
  journalEntryId?: string;
  memo: string;
  debit: string;
  credit: string;
  source: string;
  entryDescription?: string;
}

/* ── Layer 2: Conversational Narration ────────────────────────── */

export interface ChatParams {
  question: string;
  investigationResult: InvestigationResult;
  accountDrilldown?: AccountDrilldownResult;
  conversationHistory?: ChatMessage[];
  tenantId: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  answer: string;
  numbersUsed: NumberReference[];
  modelVersion: string;
  provenanceValid: boolean;
}

export interface NumberReference {
  value: string;
  source: string;
  verified: boolean;
}

/* ── Layer 3: Number Provenance Validator ─────────────────────── */

export interface ProvenanceResult {
  valid: boolean;
  numbersFound: NumberReference[];
  numbersUnverified: string[];
  totalNumbersInResponse: number;
}
