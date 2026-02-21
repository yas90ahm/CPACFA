/**
 * Agentic "what's blocking close?" narrative and next actions from CloseExceptionsResult.
 * Used when GET /api/close/exceptions?includeNarrative=true.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CloseExceptionsResult } from './close_exceptions_service.js';

export interface NextAction {
  label: string;
  reason: string;
}

export interface CloseExceptionsNarrativeResult {
  narrative: string;
  nextActions: NextAction[];
}

const SYSTEM = [
  'You are a CPA close specialist. Given a list of open items blocking period close (checklist, reconciliations, disclosures, DQ, DRL, PBC),',
  'write (1) a short narrative (2-4 sentences): what is blocking close and what to tackle first and why;',
  '(2) up to 3 prioritized next actions, each with a short label and reason.',
  'Respond with a JSON object only: { "narrative": "string", "nextActions": [ { "label": "string", "reason": "string" }, ... ] }.',
  'Use only these keys. Be concise and actionable. If nothing is blocking, say so in the narrative and return empty nextActions.',
].join(' ');

function serializeExceptions(ex: CloseExceptionsResult): string {
  const parts: string[] = [`Period: ${ex.periodLabel}.`];
  if (ex.checklistOverdue?.length)
    parts.push(`Checklist incomplete: ${ex.checklistOverdue.map((s) => s.label).join(', ')}.`);
  if (ex.recOpen?.length)
    parts.push(`Reconciliations open: ${ex.recOpen.map((r) => r.reconciliationType).join(', ')}.`);
  if (ex.disclosurePending?.length)
    parts.push(`Disclosures pending: ${ex.disclosurePending.map((d) => d.topic).join(', ')}.`);
  if (ex.dataQualityExceptions?.length)
    parts.push(`Data quality: ${ex.dataQualityExceptions.length} exception(s).`);
  if (ex.drlPending?.length)
    parts.push(`Document requests: ${ex.drlPending.map((d) => d.requestLabel).join(', ')}.`);
  if (ex.pbcPending?.length)
    parts.push(`PBC pending: ${ex.pbcPending.map((p) => p.label).join(', ')}.`);
  if (parts.length === 1) parts.push('No open items blocking close.');
  return parts.join(' ');
}

const FALLBACK: CloseExceptionsNarrativeResult = {
  narrative: 'Review open checklist, reconciliations, and disclosures for this period.',
  nextActions: [],
};

function parseResponse(raw: string): CloseExceptionsNarrativeResult {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return FALLBACK;
  try {
    const cleaned = trimmed.replace(/```json?\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== 'object') return FALLBACK;
    const obj = parsed as Record<string, unknown>;
    const narrative =
      typeof obj.narrative === 'string' && obj.narrative.length > 0
        ? obj.narrative.slice(0, 2000)
        : FALLBACK.narrative;
    let nextActions: NextAction[] = [];
    if (Array.isArray(obj.nextActions)) {
      nextActions = obj.nextActions
        .slice(0, 3)
        .filter(
          (a): a is NextAction =>
            a != null &&
            typeof a === 'object' &&
            typeof (a as NextAction).label === 'string' &&
            typeof (a as NextAction).reason === 'string'
        )
        .map((a) => ({ label: (a as NextAction).label.slice(0, 200), reason: (a as NextAction).reason.slice(0, 300) }));
    }
    return { narrative, nextActions };
  } catch {
    return FALLBACK;
  }
}

/**
 * Generate narrative and next actions for close exceptions. Returns fallback on failure or missing API key.
 */
export async function generateCloseExceptionsNarrativeAgentic(
  exceptions: CloseExceptionsResult
): Promise<CloseExceptionsNarrativeResult> {
  const prompt = `Open items:\n${serializeExceptions(exceptions)}\n\nRespond with JSON: { "narrative": "...", "nextActions": [ ... ] }.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 512,
    parse: parseResponse,
    fallback: FALLBACK,
  });
}
