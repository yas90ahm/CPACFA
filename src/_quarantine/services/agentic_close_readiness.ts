/**
 * Optional agentic narrative for close readiness: ready to close or not ready because...
 * Fallback = empty string. Do not use for sign-off or status.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CloseReadinessResult } from './close_readiness_service.js';

const SYSTEM = [
  'You are a close specialist. Given a close readiness result (checklist, recs, lock),',
  'write one short paragraph (2-3 sentences): either "Ready to close" or "Not ready because X".',
  'Return plain text only, no JSON.',
].join(' ');

/**
 * Generate a short narrative for close readiness. Returns empty string on failure or when no API key.
 */
export async function generateCloseReadinessNarrativeAgentic(result: CloseReadinessResult): Promise<string> {
  const parts = [
    `Period: ${result.periodLabel}.`,
    result.ready ? 'Ready to close.' : `Not ready: ${result.reason ?? 'Pre-close checks failed'}.`,
    `Checklist done: ${result.checklistDone}. Reconciliations tied: ${result.recsTied}. Period locked: ${result.locked}.`,
  ].join(' ');
  const prompt = `Close readiness:\n${parts}\n\nWrite one short paragraph.`;
  const fallback = result.ready ? 'Period is ready to close.' : `Not ready: ${result.reason ?? 'Pre-close checks not met'}.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
