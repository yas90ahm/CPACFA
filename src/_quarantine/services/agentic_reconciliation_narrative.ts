/**
 * Optional agentic narrative for reconciliation summary: TB/BS/CF/equity ties and failed checks.
 * Fallback = empty string. Do not use for sign-off or status.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { ReconciliationSummary } from './reconciliation_summary_service.js';

const SYSTEM = [
  'You are an audit specialist. Given a reconciliation summary (trial balance, balance sheet, cash flow tie, equity, quality checks),',
  'write one short paragraph (2-3 sentences): whether the books tie and a brief summary of any failed checks.',
  'Return plain text only, no JSON.',
].join(' ');

/**
 * Generate a short narrative for a reconciliation summary. Returns empty string on failure or when no API key.
 */
export async function generateReconciliationNarrativeAgentic(summary: ReconciliationSummary): Promise<string> {
  const parts = [
    `Trial balance balances: ${summary.trialBalanceBalances}.`,
    `Balance sheet balances: ${summary.balanceSheetBalances}.`,
    summary.cashFlowTiesToBS != null ? `Cash flow ties to BS: ${summary.cashFlowTiesToBS}.` : '',
    summary.equityConsistent != null ? `Equity consistent: ${summary.equityConsistent}.` : '',
    `Overall passed: ${summary.passed}.`,
  ].filter(Boolean);
  if (summary.failedChecks.length > 0) {
    parts.push(`Failed checks: ${summary.failedChecks.map((c) => c.title).join(', ')}.`);
  }
  const prompt = `Reconciliation summary:\n${parts.join(' ')}\n\nWrite one short paragraph for the audit file.`;
  const fallback = '';
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
