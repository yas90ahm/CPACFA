/**
 * Accrual and deferral suggestions for period-end close (rule-based + agentic).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { AccrualSuggestion, AccrualSuggestionInput } from '../types/accrual_deferral.js';

function uuid(): string {
  return `acc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Rule-based accrual suggestions from open AR/AP and payroll amounts.
 */
export function buildAccrualSuggestions(input: AccrualSuggestionInput): AccrualSuggestion[] {
  const suggestions: AccrualSuggestion[] = [];
  const { periodEnd, openArAmount = 0, openApAmount = 0, payrollAccrualAmount = 0 } = input;

  if (openArAmount > 0) {
    suggestions.push({
      id: uuid(),
      type: 'accrual',
      description: 'Revenue accrual (unbilled / open AR)',
      debitAccount: 'Accounts Receivable',
      creditAccount: 'Revenue',
      amount: openArAmount,
      periodEnd,
      source: 'open_ar',
      sourceDetail: 'From open AR balance',
      confidence: 0.8,
    });
  }
  if (openApAmount > 0) {
    suggestions.push({
      id: uuid(),
      type: 'accrual',
      description: 'Expense accrual (invoices not yet recorded)',
      debitAccount: 'Expense',
      creditAccount: 'Accounts Payable',
      amount: openApAmount,
      periodEnd,
      source: 'open_ap',
      sourceDetail: 'From open AP balance',
      confidence: 0.8,
    });
  }
  if (payrollAccrualAmount > 0) {
    suggestions.push({
      id: uuid(),
      type: 'accrual',
      description: 'Payroll accrual (earned but not yet paid)',
      debitAccount: 'Salaries and Wages Expense',
      creditAccount: 'Salaries and Wages Payable',
      amount: payrollAccrualAmount,
      periodEnd,
      source: 'payroll',
      sourceDetail: 'From payroll accrual summary',
      confidence: 0.85,
    });
  }
  return suggestions;
}

const SYSTEM = [
  'You are a CPA close specialist. Given period-end and optional open AR/AP/payroll amounts and context (or trial balance summary),',
  'suggest 1–4 accrual or deferral journal entries only when supported by the data provided. Return a JSON array of objects:',
  '[{"type":"accrual"|"deferral","description":"...","debitAccount":"...","creditAccount":"...","amount":number}]',
  'Use only these keys. Amounts must be non-negative. Be concise.',
  'Suggest only accruals/deferrals supported by the trial balance and open items in the prompt. Do not invent accounts or amounts not present in that data. If no trial balance or open items are provided, return [].',
].join(' ');

/**
 * Agentic accrual/deferral suggestions from context.
 */
export async function suggestAccrualsAgentic(input: AccrualSuggestionInput): Promise<AccrualSuggestion[]> {
  const ruleBased = buildAccrualSuggestions(input);
  const prompt = [
    `Period end: ${input.periodEnd}.`,
    input.openArAmount != null ? `Open AR: ${input.openArAmount}.` : '',
    input.openApAmount != null ? `Open AP: ${input.openApAmount}.` : '',
    input.payrollAccrualAmount != null ? `Payroll accrual: ${input.payrollAccrualAmount}.` : '',
    input.context ? `Context: ${input.context}` : '',
    'Suggest accrual or deferral entries (additional to standard AR/AP/payroll if any).',
  ]
    .filter(Boolean)
    .join('\n');

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 512,
    parse: (raw) => {
      const match = raw.match(/\[[\s\S]*?\]/);
      const arr = match ? JSON.parse(match[0]) : [];
      const agentic: AccrualSuggestion[] = (Array.isArray(arr) ? arr : []).slice(0, 4).map((o: Record<string, unknown>) => ({
        id: uuid(),
        type: (o.type === 'deferral' ? 'deferral' : 'accrual') as AccrualSuggestion['type'],
        description: String(o.description ?? 'Adjustment'),
        debitAccount: String(o.debitAccount ?? 'TBD'),
        creditAccount: String(o.creditAccount ?? 'TBD'),
        amount: Number(o.amount) || 0,
        periodEnd: input.periodEnd,
        source: 'agentic' as const,
        sourceDetail: 'LLM-suggested',
        confidence: 0.6,
      }));
      return [...ruleBased, ...agentic.filter((a) => a.amount > 0)];
    },
    fallback: ruleBased,
  });
}
