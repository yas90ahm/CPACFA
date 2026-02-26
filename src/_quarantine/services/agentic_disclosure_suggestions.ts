/**
 * Optional agentic disclosure suggestions: given notes/BS/P&L text summary,
 * suggest which disclosure items might be missing or need review.
 * Output = list of topic IDs + short reason. Used only when user requests "suggest disclosures";
 * fallback = empty list. Do not auto-change checklist status from LLM.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { DisclosureItem } from '../types/disclosure_checklist.js';

const SYSTEM_EVIDENCE =
  'You are an audit specialist. Given a disclosure item and optional notes excerpt, suggest what evidence or workpaper would satisfy it. Respond in 1–2 sentences only.';
const SYSTEM_REVIEW =
  'You are an audit specialist. Given a disclosure checklist (topic, standard, status), write a short review summary paragraph.';

export interface DisclosureSuggestion {
  topicId: string;
  standard?: string;
  reason: string;
}

const SYSTEM = [
  'You are an audit/assurance specialist. Given notes and financial statement summaries (balance sheet, P&L),',
  'suggest which disclosure checklist topics might be missing or need review (e.g. ASC 205 discontinued operations, ASC 210 liquidity).',
  'Respond with a JSON array only: [ { "topicId": "string (short id e.g. asc205-discontinued)", "standard": "ASC 205" (optional), "reason": "one sentence" }, ... ].',
  'Return only the JSON array, no markdown. If nothing material to add, return [].',
].join(' ');

/**
 * Suggest disclosure items that might be missing or need review. Returns empty array on failure or when no API key.
 */
export async function suggestDisclosuresAgentic(notesAndSummary: string): Promise<DisclosureSuggestion[]> {
  if (!notesAndSummary?.trim()) return [];

  const prompt = `Notes and financial summary:\n${notesAndSummary}\n\nSuggest disclosure topics that may be missing or need review (JSON array only).`;
  const fallback = '[]';

  const raw = await callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 512,
    parse: (r) => r?.trim() ?? fallback,
    fallback,
  });

  if (!raw || raw === '[]') return [];
  try {
    const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, '').trim()) as unknown;
    if (!Array.isArray(parsed)) return [];
    const result: DisclosureSuggestion[] = [];
    for (const item of parsed) {
      if (item && typeof item === 'object' && 'topicId' in item && typeof (item as { topicId: unknown }).topicId === 'string' && 'reason' in item && typeof (item as { reason: unknown }).reason === 'string') {
        result.push({
          topicId: (item as { topicId: string }).topicId,
          standard: typeof (item as { standard?: string }).standard === 'string' ? (item as { standard: string }).standard : undefined,
          reason: (item as { reason: string }).reason,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

/** Input shape for per-item evidence suggestion */
export interface DisclosureItemInput {
  topic: string;
  standard: string;
  description: string;
}

/**
 * Suggest what evidence or workpaper would satisfy a disclosure item. Returns 1–2 sentences; fallback empty string.
 */
export async function suggestEvidenceForDisclosureItemAgentic(
  item: DisclosureItemInput,
  notesExcerpt?: string
): Promise<string> {
  if (!item?.topic && !item?.description) return '';

  const prompt = [
    `Disclosure item: ${item.topic ?? ''} (${item.standard ?? ''}).`,
    item.description ? `Description: ${item.description}` : '',
    notesExcerpt ? `Relevant notes excerpt: ${notesExcerpt}` : '',
    'What evidence or workpaper would satisfy this? (1–2 sentences only.)',
  ]
    .filter(Boolean)
    .join('\n');

  return callLLMWithFallback({
    system: SYSTEM_EVIDENCE,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 500) || '',
    fallback: '',
  });
}

/**
 * Generate a short review summary for the disclosure checklist (e.g. "US_GAAP: 2 items pending; ASC 220 needs evidence.").
 */
export async function generateDisclosureReviewSummaryAgentic(items: DisclosureItem[]): Promise<string> {
  if (!items?.length) return '';

  const lines = items.map((i) => `- ${i.topic} (${i.standard}): ${i.status}`);

  const prompt = `Disclosure checklist:\n${lines.join('\n')}\n\nWrite a short review summary paragraph.`;

  return callLLMWithFallback({
    system: SYSTEM_REVIEW,
    prompt,
    maxTokens: 512,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 1000) || '',
    fallback: '',
  });
}
