/**
 * Agentic remediation suggestion for a data quality exception.
 * Suggests concrete remediation (e.g. suggested JE) from rule + context.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { DataQualityException } from '../types/data_quality.js';

const SYSTEM = [
  'You are a CPA close specialist. Given a data quality exception (rule failure),',
  'suggest concrete remediation in 1–3 sentences (e.g. "Post JE: Dr Expense 500, Cr Accrual 500 to clear variance.").',
  'Return plain text only. Be concise and audit-friendly.',
].join(' ');

export async function suggestRemediationAgentic(exception: DataQualityException): Promise<string> {
  const prompt = [
    `Rule: ${exception.ruleId}.`,
    `Message: ${exception.message}.`,
    exception.metric != null ? `Metric: ${exception.metric}.` : '',
    exception.periodLabel ? `Period: ${exception.periodLabel}.` : '',
    'Suggest concrete remediation (e.g. journal entry, reclassification, or follow-up).',
  ]
    .filter(Boolean)
    .join('\n');

  const fallback = 'Review and post adjustment if material. Re-run reconciliation after remediation.';
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
