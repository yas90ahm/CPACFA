/**
 * Financial Memory — Types for three-tier hierarchy and hybrid search.
 */

/** Storage tier: Global (FASB/IFRS/Tax), Firm (CoA, policies), Session (uploaded files). */
export type MemoryTier = 'global' | 'firm' | 'session';

/** Source within Global tier */
export type GlobalSource = 'FASB' | 'IFRS' | 'Tax';

/** A single memory entry (chunk) in any tier. */
export interface MemoryEntry {
  id: string;
  tier: MemoryTier;
  /** For global: FASB | IFRS | Tax. For firm: 'chart_of_accounts' | 'policy' | 'invoice_treatment'. For session: 'upload'. */
  source: string;
  /** Searchable text (e.g. citation + text, or description). */
  text: string;
  /** Optional structured payload (e.g. account code, policy id). */
  payload?: Record<string, unknown>;
  /** When this entry was stored (ISO). */
  storedAt: string;
}

/** Chart of Accounts line (Firm tier). */
export interface ChartOfAccountsLine {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'other';
  parentCode?: string;
  description?: string;
}

/** Historical accounting policy (Firm tier). */
export interface HistoricalPolicy {
  id: string;
  topic: string;
  policy: string;
  citation?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

/** How a similar invoice was treated in a prior period (for consistency of reporting). */
export interface InvoiceTreatment {
  id: string;
  /** Vendor or payee name. */
  vendor: string;
  /** Invoice description or line item. */
  description: string;
  /** Amount (e.g. total or line amount). */
  amount: number;
  /** Currency. */
  currency: string;
  /** Account code(s) used (e.g. expense account). */
  accountCode: string;
  /** Optional second account (e.g. prepaid, accrual). */
  accountCode2?: string;
  /** Fiscal year or period (e.g. "FY2023", "2023-Q2"). */
  period: string;
  /** Citation or policy applied (e.g. ASC 606, internal policy). */
  citation?: string;
  /** Optional reasoning (e.g. "Capitalized per ASC 350-40"). */
  reasoning?: string;
  storedAt: string;
}

/** Session upload: reference to a file or content in the current conversation. */
export interface SessionUpload {
  id: string;
  filename: string;
  /** MIME or type hint. */
  contentType?: string;
  /** Extracted or summary text for search. */
  summaryText: string;
  /** Optional structured metadata (e.g. sheet names, line count). */
  metadata?: Record<string, unknown>;
  uploadedAt: string;
}

/** Result of hybrid search across tiers. */
export interface HybridSearchResult {
  entry: MemoryEntry;
  /** Combined score (keyword + optional semantic). */
  score: number;
  /** Which part of hybrid contributed (e.g. keyword, semantic). */
  scoreBreakdown?: { keyword: number; semantic?: number };
  tier: MemoryTier;
}

/** Options for hybrid search. */
export interface HybridSearchOptions {
  /** Which tiers to search (default: all). */
  tiers?: MemoryTier[];
  /** Max results per tier or total (default: 20). */
  topK?: number;
  /** For invoice consistency: only return InvoiceTreatment from firm tier. */
  invoiceConsistencyOnly?: boolean;
}

/** Response for "similar invoices" (consistency of reporting). */
export interface SimilarInvoicesResult {
  /** The query (e.g. current invoice description/vendor). */
  query: string;
  /** Similar past treatments. */
  treatments: InvoiceTreatment[];
  /** Suggested account / treatment for consistency. */
  consistencyNote?: string;
}
