/**
 * Agentic explainer for intercompany reconciliation variance.
 * Explains possible causes (timing, currency, reclass) and suggests follow-up.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { IntercompanyReconciliationResult } from '../types/intercompany.js';

const SYSTEM = [
  'You are a consolidation specialist. Given an intercompany reconciliation result with a variance',
  '(entity A receivable vs entity B payable), explain possible causes (e.g. timing differences, FX, reclassifications)',
  'and suggest 1–2 follow-up actions (e.g. re-run after B month-end, check FX rate). Return plain text only, 2–4 sentences.',
].join(' ');

export async function explainIntercompanyVarianceAgentic(
  result: IntercompanyReconciliationResult
): Promise<string> {
  if (result.status === 'matched') {
    return `Intercompany reconciliation for period ${result.periodLabel} is matched; no variance to explain.`;
  }
  const prompt = [
    `Period: ${result.periodLabel}.`,
    `Entity A balance: ${result.balanceA.toFixed(2)}, Entity B balance: ${result.balanceB.toFixed(2)}.`,
    `Variance: ${result.variance.toFixed(2)}. Status: ${result.status}.`,
    result.varianceDetail ? `Detail: ${result.varianceDetail}.` : '',
    'Explain possible causes and suggest follow-up actions.',
  ]
    .filter(Boolean)
    .join('\n');

  const fallback = `Intercompany variance for ${result.periodLabel}: ${result.variance.toFixed(2)} (A: ${result.balanceA.toFixed(2)}, B: ${result.balanceB.toFixed(2)}). Review timing, FX, and reclassifications.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
