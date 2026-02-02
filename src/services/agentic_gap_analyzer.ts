/**
 * Agentic anomaly and gap analyzer (LLM-driven).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { DataGap } from '../agents/cpa_brain.js';

const SYSTEM = [
  'You are a CPA-grade reviewer.',
  'Given ledger summaries and metadata, propose missing-information gaps.',
  'Return ONLY JSON array of gap objects with fields:',
  '{ type, title, description, urgency, suggestion }.',
  'type must be one of: missing_liability, missing_asset, missing_identity, missing_transactions, agentic_anomaly.',
  'urgency must be high or medium.',
].join(' ');

export async function analyzeGapsAgentic(input: {
  ledgerSummary: string;
  metadata: { taxId?: string; businessNumber?: string; transactionCount?: number };
}): Promise<DataGap[]> {
  const prompt = [
    `ledgerSummary=${input.ledgerSummary}`,
    `metadata=${JSON.stringify(input.metadata)}`,
    'Return JSON only.',
  ].join('\n');
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 500,
    parse: (raw) =>
      parseGaps(raw).map((g) => ({
        id: `gap-agentic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: g.type,
        title: g.title,
        description: g.description,
        urgency: g.urgency,
        suggestion: g.suggestion,
      })),
    fallback: [],
  });
}

function parseGaps(raw: string): Array<Omit<DataGap, 'id'>> {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as Array<Omit<DataGap, 'id'>>;
  } catch {
    return [];
  }
}
