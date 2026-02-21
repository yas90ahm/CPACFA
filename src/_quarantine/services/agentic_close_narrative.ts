/**
 * Optional agentic close narrative: given close package summary (JSON), return one short paragraph
 * ("Period X closed on date Y by Z; N recs passed; N controls evidenced.").
 * Used only when generating package narrative; fallback = empty string. Do not use LLM for sign-off or status.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { ClosePackage } from './close_package_service.js';

const SYSTEM = [
  'You are an audit/close specialist. Given a close package summary (period, status, recs, controls, checklist),',
  'write one short paragraph (2-4 sentences): when the period was closed, by whom, how many recs passed, how many controls evidenced.',
  'Return plain text only, no JSON.',
].join(' ');

/**
 * Generate one-sentence close/audit package narrative. Returns empty string on failure or when no API key.
 */
export async function generateCloseNarrativeAgentic(pkg: ClosePackage): Promise<string> {
  const summary = [
    `Period: ${pkg.periodLabel}.`,
    pkg.periodClose
      ? `Status: ${pkg.periodClose.status}. Closed: ${pkg.periodClose.closedAt ?? '—'} by ${pkg.periodClose.closedBy ?? '—'}.`
      : 'Status: not closed.',
    `Reconciliation resolutions: ${pkg.reconciliationResolutions.length}.`,
    `Control evidence entries: ${Array.isArray(pkg.controlEvidenceSummary) ? pkg.controlEvidenceSummary.length : 0}.`,
    `Checklist steps with sign-off: ${pkg.checklistStepsWithSignOff.length}.`,
  ].join(' ');
  const prompt = `Close package summary:\n${summary}\n\nWrite one short paragraph for the close/audit package.`;
  const fallback = '';
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
