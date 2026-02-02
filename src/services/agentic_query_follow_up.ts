/**
 * Agentic: suggest 1–3 follow-up questions from a catalog query result.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CatalogQueryResult } from '../types/data_catalog.js';

const SYSTEM = [
  'You are a financial analyst assistant. Given a table (columns and sample rows) from a query result,',
  'suggest 1–3 short follow-up questions the user might want to ask next (e.g. "How does this compare to prior period?", "What drove the change in revenue?").',
  'Return a JSON array of strings only, e.g. ["Question one?", "Question two?"]. No other text.',
].join(' ');

export async function suggestFollowUpQuestionsAgentic(result: CatalogQueryResult): Promise<string[]> {
  const sample = result.rows.slice(0, 10);
  const colNames = result.columns.map((c) => c.name).join(', ');
  const rowLines = sample.map((r) => Object.values(r).join(', '));
  const prompt = [
    `Columns: ${colNames}.`,
    'Sample rows:',
    ...rowLines,
    `Total rows: ${result.rows.length}.`,
    'Return a JSON array of 1–3 follow-up questions (strings only).',
  ].join('\n');

  const fallback: string[] = ['How does this compare to prior period?', 'What are the main drivers?'];
  const raw = await callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (text) => {
      const t = text?.trim() ?? '';
      const arrayMatch = t.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const arr = JSON.parse(arrayMatch[0]) as unknown;
          if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) return arr.slice(0, 3);
        } catch {
          // ignore
        }
      }
      return fallback;
    },
    fallback,
  });
  return Array.isArray(raw) ? raw.slice(0, 3) : fallback;
}
