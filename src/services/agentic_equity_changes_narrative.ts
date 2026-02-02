/**
 * Agentic narrative for statement of changes in equity (residual / other movements).
 * Used when residual (equity change other than net income) is material.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { EquityChangesStatement } from '../types/financial.js';

const THRESHOLD = 0.01;

const SYSTEM = [
  'You are a CPA financial reporting specialist. Given a statement of changes in equity (opening, net income, other changes, closing),',
  'write one or two short sentences explaining the change in equity in excess of net income (e.g. dividends, capital injection, other comprehensive income).',
  'Return plain text only, no JSON. Be concise and suitable for footnote or management discussion.',
].join(' ');

/**
 * Compute residual (closing - opening - net income) from equity changes statement.
 */
function getResidual(stmt: EquityChangesStatement): number {
  const opening = stmt.openingEquity ?? 0;
  const closing = stmt.closingEquity ?? 0;
  const netIncome = stmt.changes?.find((c) => c.label.toLowerCase().includes('net income'))?.amount ?? 0;
  return closing - opening - netIncome;
}

const FALLBACK = '';

/**
 * Generate narrative for equity changes (residual). Returns empty string when residual is negligible or on failure.
 */
export async function generateEquityChangesNarrativeAgentic(
  equityChangesStatement: EquityChangesStatement
): Promise<string> {
  const residual = getResidual(equityChangesStatement);
  if (Math.abs(residual) <= THRESHOLD) return FALLBACK;

  const prompt = [
    `Opening equity: ${equityChangesStatement.openingEquity ?? '—'}.`,
    `Closing equity: ${equityChangesStatement.closingEquity ?? '—'}.`,
    `Changes: ${equityChangesStatement.changes?.map((c) => `${c.label} ${c.amount}`).join('; ') ?? '—'}.`,
    `Residual (other than net income): ${residual}.`,
    '\nWrite one or two sentences explaining this residual (e.g. dividends, contributions, OCI).',
  ].join(' ');

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 800) || FALLBACK,
    fallback: FALLBACK,
  });
}
