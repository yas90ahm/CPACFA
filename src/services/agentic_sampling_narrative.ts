/**
 * Optional agentic narrative for a sampling run: population, method, sample size, materiality, results summary.
 * Fallback = empty string. Do not use for sign-off or status.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { SamplingResultWithId } from '../types/audit_evidence.js';

const SYSTEM = [
  'You are an audit specialist. Given a sampling run (population, method, sample size, optional materiality, test results),',
  'write one short paragraph (2-3 sentences): what was sampled, how, and a brief summary of test results if any.',
  'Return plain text only, no JSON.',
].join(' ');

/**
 * Generate a short narrative for a sampling run. Returns empty string on failure or when no API key.
 */
export async function generateSamplingNarrativeAgentic(run: SamplingResultWithId): Promise<string> {
  const parts = [
    `Population: ${run.population}. Method: ${run.method}. Sample size: ${run.sampleSize}.`,
    run.periodLabel ? `Period: ${run.periodLabel}.` : '',
    run.materialityThreshold != null ? `Materiality threshold: ${run.materialityThreshold}.` : '',
    run.populationCount != null ? `Population count: ${run.populationCount}.` : '',
  ].filter(Boolean);
  const results = run.testResults;
  if (results && results.length > 0) {
    const pass = results.filter((r) => r.result === 'pass').length;
    const fail = results.filter((r) => r.result === 'fail').length;
    const exc = results.filter((r) => r.result === 'exception').length;
    parts.push(`Test results: ${pass} pass, ${fail} fail, ${exc} exception.`);
  }
  const prompt = `Sampling run:\n${parts.join(' ')}\n\nWrite one short paragraph for the audit file.`;
  const fallback = '';
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
