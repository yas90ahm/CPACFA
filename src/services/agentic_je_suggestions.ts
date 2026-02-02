/**
 * Agentic narrative for journal entry suggestions (from gaps / reconciliation)
 * and JE suggestions generated from natural language text.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { JournalEntrySuggestion } from '../types/close_and_controls.js';

const SYSTEM = [
  'You are a CPA close specialist. Given a list of suggested journal entries (from data gaps or reconciliation mismatches),',
  'write a short narrative (2–4 sentences) summarizing what adjustments are proposed and why. Be concise and audit-friendly.',
  'Return only the narrative text, no JSON.',
].join(' ');

const SYSTEM_FROM_TEXT = [
  'You are a CPA close specialist. Given a natural language request (e.g. "Accrue $15k legal expense", "Record dividend declaration $50k"),',
  'output one or more journal entry suggestions as a JSON array. Each item must have: description (string),',
  'debits (array of { account: string, amount: number }), credits (array of { account: string, amount: number }).',
  'Use standard account names (e.g. Legal Expense, Dividends Payable, Retained Earnings, Cash). Amounts must be numbers. Return only the JSON array, no markdown.',
].join(' ');

/**
 * Generate an agentic narrative summarizing the JE suggestions for close documentation.
 */
export async function explainJESuggestionsAgentic(
  suggestions: JournalEntrySuggestion[]
): Promise<string> {
  if (!suggestions?.length) {
    return 'No journal entry suggestions.';
  }

  const lines = suggestions.map((s) => {
    const dr = s.debits?.map((d) => `${d.account} $${d.amount}`).join(', ') ?? '';
    const cr = s.credits?.map((c) => `${c.account} $${c.amount}`).join(', ') ?? '';
    return `- ${s.description} (source: ${s.source}) Debits: ${dr || '—'}; Credits: ${cr || '—'}`;
  });

  const prompt = `Suggested journal entries:\n${lines.join('\n')}\n\nSummarize for close documentation.`;

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 1500) || 'JE suggestions summarized for close.',
    fallback: `Close includes ${suggestions.length} suggested adjustment(s) from gaps and reconciliation (see list for details).`,
  });
}

/** LLM response shape for from-text parsing */
interface LLMJEItem {
  description?: string;
  debits?: { account?: string; amount?: number }[];
  credits?: { account?: string; amount?: number }[];
}

/**
 * Generate journal entry suggestions from natural language (e.g. "Accrue $15k legal expense").
 * Returns same shape as other JE suggestions so they can be queued with rule-based ones.
 */
export async function suggestJEsFromTextAgentic(options: {
  text: string;
  periodEnd?: string;
}): Promise<JournalEntrySuggestion[]> {
  const { text, periodEnd } = options;
  if (!text?.trim()) {
    return [];
  }

  const date = periodEnd ?? new Date().toISOString().slice(0, 10);

  const prompt = `User request: "${text.trim()}"\n\nOutput a JSON array of journal entries. Each object: description, debits: [{ account, amount }], credits: [{ account, amount }].`;

  return callLLMWithFallback({
    system: SYSTEM_FROM_TEXT,
    prompt,
    maxTokens: 1024,
    parse: (raw) => {
      const trimmed = raw?.trim() ?? '';
      const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
      let arr: LLMJEItem[];
      try {
        arr = JSON.parse(jsonStr) as LLMJEItem[];
      } catch {
        return [];
      }
      if (!Array.isArray(arr) || arr.length === 0) return [];
      return arr.map((item, i) => {
        const debits = (item.debits ?? []).filter((d) => d?.account != null && typeof d.amount === 'number');
        const credits = (item.credits ?? []).filter((c) => c?.account != null && typeof c.amount === 'number');
        return {
          id: `je-text-${i + 1}`,
          date,
          description: typeof item.description === 'string' ? item.description : 'Adjustment from natural language',
          debits: debits.map((d) => ({ account: String(d.account), amount: Number(d.amount) })),
          credits: credits.map((c) => ({ account: String(c.account), amount: Number(c.amount) })),
          source: 'manual' as const,
          sourceDetail: 'From natural language',
        } satisfies JournalEntrySuggestion;
      });
    },
    fallback: [],
  });
}
