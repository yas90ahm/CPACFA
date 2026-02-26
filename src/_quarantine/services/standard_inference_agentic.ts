/**
 * Agentic standard inference with confidence and user prompt.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { AccountingStandard } from '../constants/accounting/index.js';

export interface StandardInferenceResult {
  standard?: AccountingStandard;
  confidence: number;
  rationale: string;
  promptForUser?: string;
}

const SYSTEM = [
  'You are a CPA-grade assistant.',
  'Infer the most likely accounting standard for an entity.',
  'Return ONLY JSON: { standard, confidence, rationale, promptForUser }.',
  'standard must be one of: ASPE, IFRS, FRS102, US_GAAP, or null.',
  'confidence is 0-1.',
  'If confidence < 0.6, provide promptForUser asking for confirmation.',
].join(' ');

export async function inferStandardAgentic(input: {
  country?: string;
  jurisdiction?: string;
  currency?: string;
  taxId?: string;
  businessNumber?: string;
}): Promise<StandardInferenceResult | null> {
  const prompt = [
    `country=${input.country ?? ''}`,
    `jurisdiction=${input.jurisdiction ?? ''}`,
    `currency=${input.currency ?? ''}`,
    `taxId=${input.taxId ?? ''}`,
    `businessNumber=${input.businessNumber ?? ''}`,
  ].join('\n');
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 300,
    parse: parseResult,
    fallback: null,
  });
}

function parseResult(raw: string): StandardInferenceResult | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(slice) as StandardInferenceResult;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}
