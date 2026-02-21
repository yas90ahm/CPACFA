/**
 * Agentic narrative for bank reconciliation result (matched, unmatched, difference).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import type {
  BankRecResult,
  BankStatementLine,
  GLCashEntry,
} from './bank_reconciliation_service.js';

const SYSTEM = [
  'You are a CPA. Given a bank reconciliation result (matched items, unmatched statement lines, unmatched GL entries, closing balances, difference),',
  'write a short narrative (2–4 sentences) for the close file: state whether the account reconciled, and highlight any unmatched items or variance. Be concise.',
  'Return only the narrative text, no JSON.',
].join(' ');

/**
 * Generate an agentic narrative summarizing the bank reconciliation for close documentation.
 */
export async function explainBankRecAgentic(result: BankRecResult): Promise<string> {
  const parts: string[] = [
    `Matched: ${result.matched.length} pairs.`,
    `Unmatched statement lines: ${result.unmatchedStatement.length}.`,
    `Unmatched GL entries: ${result.unmatchedGL.length}.`,
    `Closing balance (statement): ${result.closingBalanceStatement}; GL: ${result.closingBalanceGL}; difference: ${result.difference}.`,
    result.reconciled ? 'Reconciled.' : 'Not reconciled.',
  ];

  const prompt = `Bank reconciliation result:\n${parts.join('\n')}\n\nSummarize for close documentation.`;

  const fallback = result.reconciled
    ? `Bank reconciled: ${result.matched.length} items matched; closing balance agreed.`
    : `Bank not reconciled: difference ${result.difference}; ${result.unmatchedStatement.length} unmatched statement, ${result.unmatchedGL.length} unmatched GL.`;

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 1200) || 'Bank reconciliation completed; see details above.',
    fallback,
  });
}

export interface SuggestedAdjustment {
  type: 'fee' | 'timing' | 'error' | 'other';
  description: string;
  amount?: number;
  rationale: string;
  confidence: number;
}

/**
 * Suggest likely one-line adjustments for unmatched statement and GL items (e.g. fees, timing).
 */
export async function suggestReconciliationAdjustmentAgentic(params: {
  unmatchedStatement: BankStatementLine[];
  unmatchedGL: GLCashEntry[];
}): Promise<{ suggestions: SuggestedAdjustment[] }> {
  const systemPrompt = `You are a CPA. Given unmatched bank statement lines and unmatched GL cash entries, suggest likely one-line adjustments (e.g. bank fees, timing differences, errors). Return JSON: { "suggestions": [ { "type": "fee"|"timing"|"error"|"other", "description": "...", "amount": X, "rationale": "...", "confidence": 0.X } ] }`;
  const userContent = `Unmatched statement: ${JSON.stringify(params.unmatchedStatement.slice(0, 20))}\nUnmatched GL: ${JSON.stringify(params.unmatchedGL.slice(0, 20))}`;
  const fallback = { suggestions: [] as SuggestedAdjustment[] };
  try {
    const result = await callLLMWithFallback({
      system: systemPrompt,
      prompt: userContent,
      maxTokens: 600,
      parse: (raw: string) => {
        try {
          const parsed = JSON.parse(raw);
          const arr = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
          return {
            suggestions: arr.map((s: Record<string, unknown>) => ({
              type: s.type === 'fee' || s.type === 'timing' || s.type === 'error' ? s.type : 'other',
              description: String(s.description ?? ''),
              amount: typeof s.amount === 'number' ? s.amount : undefined,
              rationale: String(s.rationale ?? ''),
              confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
            })),
          };
        } catch {
          return fallback;
        }
      },
      fallback,
    });
    assertNoNumericAmountsInAgentOutput(result, 'agentic_bank_rec_service.suggestReconciliationAdjustmentAgentic');
    return result;
  } catch {
    return fallback;
  }
}
