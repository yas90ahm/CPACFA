/**
 * Agentic narrative summary of a catalog query result.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CatalogQueryResult } from '../types/data_catalog.js';

const SYSTEM = [
  'You are a financial analyst. Given a table (columns and sample rows), write a 2–4 sentence narrative summary.',
  'Mention key numbers (e.g. revenue, expenses, net income, runway). Return plain text only.',
].join(' ');

export async function summarizeQueryResultAgentic(result: CatalogQueryResult): Promise<string> {
  const sample = result.rows.slice(0, 15);
  const colNames = result.columns.map((c) => c.name).join(', ');
  const rowLines = sample.map((r) => Object.values(r).join(', '));
  const prompt = [
    `Columns: ${colNames}.`,
    'Sample rows:',
    ...rowLines,
    `Total rows: ${result.rows.length}.`,
    'Write a short narrative summary.',
  ].join('\n');

  const fallback = `Query returned ${result.rows.length} row(s) with columns: ${colNames}. See table for details.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
