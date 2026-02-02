/**
 * CFO Dashboard — Agentic sensitivity question parsing (what-if variable + shock).
 * Extracts variable and shock from free-form questions when regex fails.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';

export type SensitivityVariable = 'COGS' | 'OPEX' | 'REVENUE';

export interface ParsedSensitivityQuestion {
  variable: SensitivityVariable;
  shockPercent: number;
  rawInterpretation?: string;
}

const SYSTEM = [
  'You are a CFO analyst parsing "what-if" sensitivity questions.',
  'Extract the financial variable (COGS, OPEX, or REVENUE) and the percentage change (positive = increase, negative = decrease).',
  'Return ONLY valid JSON: { "variable": "COGS"|"OPEX"|"REVENUE", "shockPercent": number }.',
  'Examples: "What if COGS goes up 15%" -> { "variable": "COGS", "shockPercent": 15 }.',
  '"Revenue drops 10%" -> { "variable": "REVENUE", "shockPercent": -10 }.',
  '"Operating expenses increase by 20%" -> { "variable": "OPEX", "shockPercent": 20 }.',
  'If unclear, prefer COGS and use 10 as default shockPercent.',
].join(' ');

/**
 * Parse a free-form sensitivity question using LLM. Returns null on failure.
 */
export async function parsePointedQuestionAgentic(
  question: string
): Promise<ParsedSensitivityQuestion | null> {
  if (!question || typeof question !== 'string' || question.trim().length === 0) return null;

  const prompt = `Question: "${question.trim()}"\nReturn JSON only.`;

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 128,
    parse: (raw) => {
      const parsed = parseJsonResponse(raw);
      if (!parsed || !parsed.variable || !['COGS', 'OPEX', 'REVENUE'].includes(parsed.variable)) return null;
      const shockPercent = typeof parsed.shockPercent === 'number' ? parsed.shockPercent : 10;
      return {
        variable: parsed.variable as SensitivityVariable,
        shockPercent,
        rawInterpretation: parsed.rawInterpretation,
      };
    },
    fallback: null,
  });
}

function parseJsonResponse(raw: string): { variable?: string; shockPercent?: number; rawInterpretation?: string } | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    return JSON.parse(raw.slice(start, end + 1)) as { variable?: string; shockPercent?: number };
  } catch {
    return null;
  }
}
