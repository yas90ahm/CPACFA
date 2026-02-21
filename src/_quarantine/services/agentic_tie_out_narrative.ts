/**
 * Agentic narrative for reconciliation tie-out (close/audit docs).
 * Used when POST /api/close/tie-out/narrative.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { ReconciliationTieOutResult } from './reconciliation_tie_out_service.js';

const SYSTEM = [
  'You are a CPA close/audit specialist. Given a reconciliation tie-out result (period, tied or not, list of open reconciliations),',
  'write one or two short sentences suitable for close or audit documentation: state whether tie-out is complete and, if not, which recs are open and what to do next.',
  'Return plain text only, no JSON. Be concise.',
].join(' ');

function serializeTieOut(tieOut: ReconciliationTieOutResult): string {
  const parts: string[] = [`Period: ${tieOut.periodLabel}.`, tieOut.tied ? 'Tie-out complete; all reconciliations passed or waived.' : 'Tie-out incomplete.'];
  if (tieOut.openOrPending?.length) {
    parts.push('Open: ' + tieOut.openOrPending.map((r) => r.reconciliationType).join(', ') + '.');
  }
  if (tieOut.reason) parts.push(tieOut.reason);
  return parts.join(' ');
}

/**
 * Generate narrative for tie-out. Returns existing reason or one sentence as fallback on failure.
 */
export async function generateTieOutNarrativeAgentic(tieOut: ReconciliationTieOutResult): Promise<string> {
  if (tieOut.tied && !tieOut.openOrPending?.length) {
    return `Reconciliation tie-out for period ${tieOut.periodLabel} is complete; all reconciliations passed or waived.`;
  }
  const prompt = `Tie-out:\n${serializeTieOut(tieOut)}\n\nWrite one or two sentences for close/audit documentation.`;
  const fallback =
    tieOut.reason ??
    (tieOut.openOrPending?.length
      ? `Tie-out incomplete for ${tieOut.periodLabel}: ${tieOut.openOrPending.map((r) => r.reconciliationType).join(', ')} open.`
      : `Reconciliation tie-out for period ${tieOut.periodLabel}.`);
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 800) || fallback,
    fallback,
  });
}
