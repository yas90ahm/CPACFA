/**
 * FinOS Agent — Financial types (CPA/CFA compliant)
 * Traceable to FASB ASC / IASB where noted.
 */

/** Source of account classification (deterministic, agentic suggestion, or user-confirmed override). */
export type ClassificationSource = 'deterministic' | 'agentic' | 'user_confirmed';

/** Account classification for TB → BS / P&L mapping (ASC 210, IAS 1) */
export type AccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE';

/** Single trial balance line (must participate in double-entry) */
export interface TrialBalanceEntry {
  /** Stable identifier assigned at parse/ingest (UUID); durable for audit trail and snapshot. */
  lineId?: string;
  accountCode?: string;
  accountName: string;
  debit: number;
  credit: number;
  /** Set during classification */
  accountType?: AccountType;
  /** FS line from COA mapping (statement-line taxonomy); when set, statement builder groups by this. */
  fsLineId?: string;
  fsLineCode?: string;
  mappingExplanation?: string;
  ruleVersion?: number;
  /** Codification reference for this line (compliance) */
  codificationRef?: CodificationRef;
  /** Line-item evidence: link to source row/chunk for audit */
  sourceDocumentId?: string;
  sourceSheet?: string;
  sourceRowIndex?: number;
  sourceChunkId?: string;
  /** Source of classification (deterministic, agentic, or user_confirmed) */
  classificationSource?: ClassificationSource;
  /** Auditable rationale for classification (deposition-ready). */
  classificationRationale?: string;
  /** Opening balance (prior period closing balance). Only applicable to BS accounts. */
  openingBalance?: number;
}

/** Reference to authoritative standard (FASB or IASB) */
export interface CodificationRef {
  framework: 'FASB' | 'IASB';
  /** e.g. "ASC 210-10-45" or "IAS 1.54" */
  citation: string;
  description?: string;
}

/** Structured Balance Sheet (ASC 210-10-45, IAS 1.49) */
export interface BalanceSheet {
  reportDate?: string;
  assets: FinancialStatementLine[];
  liabilities: FinancialStatementLine[];
  equity: FinancialStatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  /** Current/Non-Current classified sub-arrays (when accounts use detailed taxonomy). */
  currentAssets?: FinancialStatementLine[];
  noncurrentAssets?: FinancialStatementLine[];
  unclassifiedAssets?: FinancialStatementLine[];
  currentLiabilities?: FinancialStatementLine[];
  noncurrentLiabilities?: FinancialStatementLine[];
  unclassifiedLiabilities?: FinancialStatementLine[];
  totalCurrentAssets?: number;
  totalNoncurrentAssets?: number;
  totalCurrentLiabilities?: number;
  totalNoncurrentLiabilities?: number;
  /** Accumulated Other Comprehensive Income (ASC 220). Included in totalEquity when present. */
  oci?: { items: FinancialStatementLine[]; total: number };
  /** Verification: Assets = Liabilities + Equity */
  balances: boolean;
  codificationRef: CodificationRef;
}

/** Income Statement / P&L (ASC 220-10-45, IAS 1.81–82) */
export interface ProfitAndLoss {
  reportDate?: string;
  revenue: FinancialStatementLine[];
  expenses: FinancialStatementLine[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  /** PE-standard subtotal hierarchy (populated when detailed taxonomy used). */
  cogs?: FinancialStatementLine[];
  totalCogs?: number;
  grossProfit?: number;
  operatingExpenses?: FinancialStatementLine[];
  totalOperatingExpenses?: number;
  operatingIncome?: number;
  otherIncomeExpense?: FinancialStatementLine[];
  totalOtherIncomeExpense?: number;
  incomeBeforeTax?: number;
  taxExpense?: FinancialStatementLine[];
  totalTaxExpense?: number;
  /** EBITDA = Net Income + Tax + Interest Expense + D&A */
  ebitda?: number;
  /** Discontinued operations (ASC 205-20). When present, netIncome is from continuing operations only. */
  discontinuedOperations?: { items: FinancialStatementLine[]; total: number };
  codificationRef: CodificationRef;
}

export interface FinancialStatementLine {
  accountCode?: string;
  label: string;
  amount: number;
  /** Stable line ID (UUID) from TB parse for audit trail and binder */
  lineId?: string;
  /** FS taxonomy line id/code when built from COA mapping */
  fsLineId?: string;
  fsLineCode?: string;
  codificationRef?: CodificationRef;
  /** Source of classification (deterministic, agentic, or user_confirmed) */
  classificationSource?: ClassificationSource;
  /** Auditable rationale for classification */
  classificationRationale?: string;
  /** Audit binder: source document (PDF/CSV) for this line */
  sourceDocumentId?: string;
  sourceDocumentUrl?: string;
  /** Line-item evidence: actual source row/chunk within document */
  sourceSheet?: string;
  sourceRowIndex?: number;
  sourceChunkId?: string;
  /** Timestamped reasoning monologue the AI used to categorize this line */
  reasoningMonologueId?: string;
  reasoningMonologueTimestamp?: string;
}

/** Result of TB ingestion + validation */
export interface TrialBalanceResult {
  entries: TrialBalanceEntry[];
  totalDebits: number;
  totalCredits: number;
  balances: boolean;
  errors: string[];
}

/** Per-line classification rationale for deposition-ready trace. */
export interface LineRationaleEntry {
  lineIndex: number;
  label: string;
  accountType: AccountType;
  rationale: string;
}

/** Full output of Plan-Execute-Verify: TB → BS + P&L (+ optional full set) */
export interface FinancialStatementsOutput {
  reasoningChain: {
    plan: string;
    executedAt: string;
    verification: { passed: boolean; checks: string[] };
    /** Optional one-sentence verification summary (agentic PEV). */
    verificationSummary?: string;
    /** Optional per-line classification rationales (deposition-ready). */
    lineRationales?: LineRationaleEntry[];
  };
  trialBalance: TrialBalanceResult;
  balanceSheet: BalanceSheet;
  profitAndLoss: ProfitAndLoss;
  cashFlow?: CashFlowStatement;
  equityChanges?: EquityChangesStatement;
  notesAndPolicies?: NotesAndPolicies;
  standard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';
  standardMetadata?: {
    depreciationMethod?: 'straight-line';
    leaseLiability?: number;
    rightOfUseAsset?: number;
    citation?: string;
  };
}

/** Cash Flow Statement (indirect method; may be estimated if data is incomplete). */
export interface CashFlowStatement {
  operating: Array<{ label: string; amount: number }>;
  investing: Array<{ label: string; amount: number }>;
  financing: Array<{ label: string; amount: number }>;
  netChangeInCash: number;
  beginningCash?: number;
  endingCash?: number;
  estimated?: boolean;
  note?: string;
}

/** Statement of Changes in Equity (summary form). */
export interface EquityChangesStatement {
  openingEquity?: number;
  changes: Array<{ label: string; amount: number }>;
  /** Other Comprehensive Income component of equity changes (ASC 220). */
  ociChanges?: Array<{ label: string; amount: number }>;
  closingEquity?: number;
  estimated?: boolean;
  note?: string;
}

/** Notes and Accounting Policies (auto-generated). */
export interface NotesAndPolicies {
  standard: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';
  notes: Array<{ title: string; content: string; citation?: string }>;
}

/**
 * Boundary between Fact Data (deterministic) and Inferred Data (agentic).
 * Integrity gate and audit ledger hash input use Fact Data only.
 */
export interface FactData {
  /** Deterministic totals, TB entries, contract totals, ledger snapshots. */
  _brand: 'FactData';
}

export interface InferredData {
  /** Agent suggestions, narratives, classifications before user confirmation. */
  _brand: 'InferredData';
}
