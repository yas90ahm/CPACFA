/**
 * Agentic cash flow driver narrative: explain operating/investing/financing drivers from a built CashFlowStatement.
 * Used when displaying cash flow (e.g. POST /api/trial-balance/cash-flow-narrative).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CashFlowStatement } from '../types/financial.js';

const SYSTEM = [
  'You are a CPA/cash flow specialist. Given a cash flow statement (operating, investing, financing sections with line items and amounts),',
  'write a short narrative (2-4 sentences) explaining the key drivers: what drove operating cash flow, and any significant investing or financing activity.',
  'Return plain text only, no JSON. Be concise and suitable for management or audit documentation.',
].join(' ');

function serializeCashFlow(cfs: CashFlowStatement): string {
  const parts: string[] = [];
  if (cfs.beginningCash != null) parts.push(`Beginning cash: ${cfs.beginningCash}.`);
  if (cfs.operating?.length) {
    parts.push('Operating: ' + cfs.operating.map((l) => `${l.label} ${l.amount}`).join('; '));
  }
  if (cfs.investing?.length) {
    parts.push('Investing: ' + cfs.investing.map((l) => `${l.label} ${l.amount}`).join('; '));
  }
  if (cfs.financing?.length) {
    parts.push('Financing: ' + cfs.financing.map((l) => `${l.label} ${l.amount}`).join('; '));
  }
  parts.push(`Net change in cash: ${cfs.netChangeInCash}.`);
  if (cfs.endingCash != null) parts.push(`Ending cash: ${cfs.endingCash}.`);
  return parts.join(' ');
}

const FALLBACK = 'Cash flow statement prepared from trial balance; reconcile to general ledger for audit.';

/**
 * Generate narrative explaining cash flow drivers. Returns fallback on failure or missing API key.
 */
export async function generateCashFlowNarrativeAgentic(
  cashFlowStatement: CashFlowStatement,
  periodLabel?: string
): Promise<string> {
  const prompt = periodLabel
    ? `Period: ${periodLabel}.\n${serializeCashFlow(cashFlowStatement)}\n\nWrite a short narrative of the cash flow drivers.`
    : `Cash flow:\n${serializeCashFlow(cashFlowStatement)}\n\nWrite a short narrative of the cash flow drivers.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 384,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 1500) || FALLBACK,
    fallback: FALLBACK,
  });
}
