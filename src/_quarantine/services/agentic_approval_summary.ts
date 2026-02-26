/**
 * Agentic approval summary: one-paragraph "what is being approved and why" for approvers.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CloseAdjustment } from '../types/close_and_controls.js';

const SYSTEM = [
  'You are a CPA close specialist. Given a journal entry or close adjustment (debits and credits),',
  'write a one-paragraph approval summary for the approver: what is being approved and why. Be concise and audit-friendly.',
  'Return plain text only.',
].join(' ');

export async function generateApprovalSummaryAgentic(adjustment: CloseAdjustment): Promise<string> {
  const dr = adjustment.debits?.map((d) => `${d.account} $${d.amount}`).join(', ') ?? '—';
  const cr = adjustment.credits?.map((c) => `${c.account} $${c.amount}`).join(', ') ?? '—';
  const prompt = [
    `Period: ${adjustment.periodLabel}. Source: ${adjustment.source}.`,
    `Description: ${adjustment.description}.`,
    `Debits: ${dr}. Credits: ${cr}.`,
    'Summarize for approver: what is being approved and why.',
  ].join('\n');

  const fallback = `JE adjustment: ${adjustment.debits?.length ?? 0} debits, ${adjustment.credits?.length ?? 0} credits for period ${adjustment.periodLabel}.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
