/**
 * Financial Memory — Main API: three-tier storage and hybrid retrieval.
 * When the CPA agent analyzes an invoice, use hybrid search to find how similar
 * invoices were treated in previous years for consistency of reporting.
 */

import type {
  ChartOfAccountsLine,
  HistoricalPolicy,
  HybridSearchOptions,
  HybridSearchResult,
  InvoiceTreatment,
  SimilarInvoicesResult,
  SessionUpload,
} from './types.js';
import { getGlobalEntries, queryGlobal } from './tiers/tier1_global.js';
import {
  setChartOfAccounts,
  getChartOfAccounts,
  addHistoricalPolicy,
  getHistoricalPolicies,
  recordInvoiceTreatment,
  getInvoiceTreatments,
  getFirmEntries,
  findSimilarTreatments,
} from './tiers/tier2_firm.js';
import {
  addSessionUpload,
  getSessionUploads,
  clearSession,
  getSessionEntries,
} from './tiers/tier3_session.js';
import { hybridSearch, findSimilarInvoiceTreatments } from './hybrid_search.js';

// --- Tier 1 (Global): read-only from FASB/IFRS/Tax ---

export { getGlobalEntries, queryGlobal };

// --- Tier 2 (Firm) ---

export {
  setChartOfAccounts,
  getChartOfAccounts,
  addHistoricalPolicy,
  getHistoricalPolicies,
  recordInvoiceTreatment,
  getInvoiceTreatments,
  getFirmEntries,
  findSimilarTreatments,
};

// --- Tier 3 (Session) ---

export { addSessionUpload, getSessionUploads, clearSession, getSessionEntries };

// --- Hybrid search and CPA invoice consistency ---

export { hybridSearch, findSimilarInvoiceTreatments };

/**
 * Single entry point for CPA agent: when analyzing an invoice, retrieve similar
 * past treatments for consistency of reporting.
 */
export function cpaInvoiceConsistencyLookup(params: {
  invoiceDescription: string;
  vendor?: string;
  accountCode?: string;
  sessionId?: string;
  topK?: number;
}): SimilarInvoicesResult {
  return findSimilarInvoiceTreatments({
    query: params.invoiceDescription,
    description: params.invoiceDescription,
    vendor: params.vendor,
    accountCode: params.accountCode,
    topK: params.topK ?? 10,
  });
}

/**
 * Run hybrid search across selected tiers (optional sessionId for Tier 3).
 */
export function searchFinancialMemory(
  query: string,
  options?: HybridSearchOptions & { sessionId?: string }
): HybridSearchResult[] {
  return hybridSearch(query, options);
}
