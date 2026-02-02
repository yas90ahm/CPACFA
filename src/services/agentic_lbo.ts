import { callLLMWithFallback } from '../llm/callWithFallback.js';

export interface ExitMultipleSuggestion {
  suggestedMultipleLow: number;
  suggestedMultipleHigh: number;
  metric: string;
  rationale: string;
  confidence: number;
}

export async function suggestExitMultipleAgentic(params: {
  industry: string;
  growth?: number;
  margins?: number;
}): Promise<ExitMultipleSuggestion> {
  const fallback: ExitMultipleSuggestion = {
    suggestedMultipleLow: 6,
    suggestedMultipleHigh: 10,
    metric: 'EV/EBITDA',
    rationale: 'Typical range; adjust for sector.',
    confidence: 0.5,
  };
  return callLLMWithFallback({
    system: 'You are an LBO specialist. Suggest exit EV/EBITDA range. Return JSON: { suggestedMultipleLow, suggestedMultipleHigh, metric, rationale, confidence }',
    prompt: `Industry: ${params.industry}\nGrowth: ${params.growth ?? 'N/A'}\nMargins: ${params.margins ?? 'N/A'}`,
    maxTokens: 400,
    parse: (raw: string) => {
      const p = JSON.parse(raw);
      return { suggestedMultipleLow: p.suggestedMultipleLow ?? fallback.suggestedMultipleLow, suggestedMultipleHigh: p.suggestedMultipleHigh ?? fallback.suggestedMultipleHigh, metric: p.metric ?? fallback.metric, rationale: p.rationale ?? fallback.rationale, confidence: p.confidence ?? 0.5 };
    },
    fallback,
  });
}

export interface DebtCapacitySuggestion {
  suggestedLeverageX: number;
  suggestedRate: number;
  rationale: string;
  confidence: number;
}

export async function suggestDebtCapacityAgentic(params: { ebitda: number; industry: string }): Promise<DebtCapacitySuggestion> {
  const fallback: DebtCapacitySuggestion = { suggestedLeverageX: 4, suggestedRate: 0.06, rationale: 'Typical LBO leverage.', confidence: 0.5 };
  return callLLMWithFallback({
    system: 'You are an LBO specialist. Suggest leverage (x EBITDA) and cost of debt. Return JSON: { suggestedLeverageX, suggestedRate, rationale, confidence }',
    prompt: `EBITDA: ${params.ebitda}\nIndustry: ${params.industry}`,
    maxTokens: 350,
    parse: (raw: string) => {
      const p = JSON.parse(raw);
      return { suggestedLeverageX: p.suggestedLeverageX ?? fallback.suggestedLeverageX, suggestedRate: p.suggestedRate ?? fallback.suggestedRate, rationale: p.rationale ?? fallback.rationale, confidence: p.confidence ?? 0.5 };
    },
    fallback,
  });
}

export interface LboMemoResult {
  memo: string;
  summary: string;
}

export async function generateLboMemoAgentic(result: { irr: number; moic: number; exitYear: number; entryEv: number; equityValueAtExit: number }): Promise<LboMemoResult> {
  const fallback: LboMemoResult = { memo: `LBO: ${(result.irr * 100).toFixed(2)}% IRR, ${result.moic}x MOIC over ${result.exitYear} years.`, summary: `${(result.irr * 100).toFixed(2)}% IRR, ${result.moic}x MOIC.` };
  return callLLMWithFallback({
    system: 'You are an LBO analyst. Generate a one-page memo. Return JSON: { memo, summary }',
    prompt: `IRR: ${(result.irr * 100).toFixed(2)}%\nMOIC: ${result.moic}x\nExit year: ${result.exitYear}\nEntry EV: ${result.entryEv}\nEquity at exit: ${result.equityValueAtExit}`,
    maxTokens: 1000,
    parse: (raw: string) => {
      const p = JSON.parse(raw);
      return { memo: p.memo ?? fallback.memo, summary: p.summary ?? fallback.summary };
    },
    fallback,
  });
}
