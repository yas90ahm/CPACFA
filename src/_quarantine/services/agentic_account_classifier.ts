/**
 * Agentic account classifier for GL/TB account names.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import type { AccountType } from '../types/financial.js';

const SYSTEM = [
  'You are a CPA-grade classifier.',
  'Classify account names into Asset, Liability, Equity, Revenue, or Expense.',
  'Return ONLY JSON array of types in the same order.',
  'Use types: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE.',
].join(' ');

export async function classifyAccountsAgentic(names: string[]): Promise<AccountType[] | null> {
  const prompt = [
    'Account names:',
    ...names.map((n, i) => `${i + 1}. ${n}`),
    'Return JSON array of types only.',
  ].join('\n');
  const result = await callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 400,
    parse: (raw) => parseTypes(raw, names.length),
    fallback: null,
  });
  if (result) assertNoNumericAmountsInAgentOutput(result, 'agentic_account_classifier');
  return result;
}

function parseTypes(raw: string, expected: number): AccountType[] | null {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed)) return null;
    const normalized = parsed.map((v) => normalizeType(v));
    if (normalized.some((v) => !v)) return null;
    if (normalized.length !== expected) return null;
    return normalized as AccountType[];
  } catch {
    return null;
  }
}

function normalizeType(value: unknown): AccountType | null {
  if (value === 'ASSET' || value === 'LIABILITY' || value === 'EQUITY' || value === 'REVENUE' || value === 'EXPENSE') {
    return value;
  }
  if (typeof value === 'string') {
    const v = value.trim().toUpperCase();
    if (v === 'ASSET' || v === 'LIABILITY' || v === 'EQUITY' || v === 'REVENUE' || v === 'EXPENSE') {
      return v as AccountType;
    }
  }
  return null;
}
