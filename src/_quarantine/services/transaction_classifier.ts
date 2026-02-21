/**
 * Agentic transaction classifier for cash flow categories.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CashTransaction, CashFlowCategory } from './cashFlow.js';
import { getTransactionCategory, setTransactionCategory } from '../memory/index.js';

const SYSTEM = [
  'You are a CPA-grade analyst. Classify cash transactions into:',
  '"operating", "investing", or "financing".',
  'Return ONLY a JSON array of categories in the same order as input.',
  'No extra text.',
].join(' ');

export async function classifyTransactionsAgentic(
  transactions: CashTransaction[],
  options: { maxBatch?: number; entityId?: string } = {}
): Promise<CashFlowCategory[]> {
  const maxBatch = options.maxBatch ?? 100;
  const results: Array<CashFlowCategory | null> = transactions.map(() => null);

  if (options.entityId) {
    for (let i = 0; i < transactions.length; i++) {
      const cached = await getTransactionCategory(options.entityId!, transactions[i].description);
      if (cached) results[i] = cached;
    }
  }

  const toClassify = transactions
    .map((tx, i) => ({ tx, i }))
    .filter((t) => results[t.i] == null);

  for (let i = 0; i < toClassify.length; i += maxBatch) {
    const batch = toClassify.slice(i, i + maxBatch);
    const batchTx = batch.map((b) => b.tx);
    const prompt = buildPrompt(batchTx);
    const parsed = await callLLMWithFallback({
      system: SYSTEM,
      prompt,
      maxTokens: 400,
      parse: (raw) => parseCategories(raw, batchTx.length),
      fallback: fallback(batchTx.length),
    });
    for (let idx = 0; idx < parsed.length; idx++) {
      const cat = parsed[idx];
      const target = batch[idx];
      results[target.i] = cat;
      if (options.entityId) {
        await setTransactionCategory(options.entityId!, target.tx.description, cat);
      }
    }
  }

  return results.map((r) => r ?? 'operating');
}

function buildPrompt(transactions: CashTransaction[]): string {
  const rows = transactions.map((t, idx) => {
    const desc = (t.description ?? '').slice(0, 120).replace(/\s+/g, ' ').trim();
    const counterparty = (t.counterparty ?? '').slice(0, 80).replace(/\s+/g, ' ').trim();
    const debit = t.debit ?? '';
    const credit = t.credit ?? '';
    return `${idx + 1}. amount=${t.amount}; debit=${debit}; credit=${credit}; counterparty="${counterparty}"; desc="${desc}"`;
  });
  return [
    'Classify each transaction:',
    ...rows,
    'Return a JSON array of categories (operating/investing/financing) in order.',
  ].join('\n');
}

function parseCategories(raw: string, expected: number): CashFlowCategory[] {
  try {
    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']');
    const slice = jsonStart >= 0 && jsonEnd >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : raw;
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed)) return fallback(expected);
    const normalized = parsed.map((v) => normalizeCategory(v));
    if (normalized.some((v) => !v)) return fallback(expected);
    return normalized as CashFlowCategory[];
  } catch {
    return fallback(expected);
  }
}

function normalizeCategory(value: unknown): CashFlowCategory | null {
  if (value === 'operating' || value === 'investing' || value === 'financing') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'operating' || v === 'investing' || v === 'financing') return v;
  }
  return null;
}

function fallback(count: number): CashFlowCategory[] {
  return Array.from({ length: count }, () => 'operating');
}
