/**
 * Agentic fixed assets: useful life suggestion, depreciation method suggestion, footnote generation.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';

export interface UsefulLifeSuggestion {
  suggestedYears: number;
  suggestedResidualPct: number;
  rationale: string;
  confidence: number;
}

/**
 * Suggests useful life and residual % for PPE by asset type and industry.
 */
export async function suggestUsefulLifeAgentic(params: {
  assetType: string;
  industry?: string;
}): Promise<UsefulLifeSuggestion> {
  const systemPrompt = `You are a fixed asset / PPE accounting specialist. Suggest a useful life (years) and residual value as a percentage of cost for property, plant and equipment.

Consider: asset type (buildings, machinery, vehicles, IT equipment, etc.), industry norms, and typical wear. Return decimal for residual (e.g. 0.1 for 10%).

Return JSON: { "suggestedYears": X, "suggestedResidualPct": 0.XX, "rationale": "...", "confidence": 0.X }`;

  const userContent = `Asset type: ${params.assetType}\nIndustry: ${params.industry ?? 'not specified'}`;

  const fallback: UsefulLifeSuggestion = {
    suggestedYears: 5,
    suggestedResidualPct: 0.1,
    rationale: 'Default; review based on entity experience.',
    confidence: 0.5,
  };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 400,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      const years = typeof parsed.suggestedYears === 'number' ? parsed.suggestedYears : 5;
      const pct = typeof parsed.suggestedResidualPct === 'number' ? parsed.suggestedResidualPct : 0.1;
      return {
        suggestedYears: Math.max(1, Math.min(50, years)),
        suggestedResidualPct: Math.max(0, Math.min(1, pct)),
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale : fallback.rationale,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    },
    fallback,
  });
}

export interface DepreciationMethodSuggestion {
  method: 'straight_line' | 'declining_balance' | 'units_of_production';
  rationale: string;
  confidence: number;
}

/**
 * Suggests depreciation method (straight-line vs declining balance) by asset type and usage pattern.
 */
export async function suggestDepreciationMethodAgentic(params: {
  assetType: string;
  usagePattern?: string;
}): Promise<DepreciationMethodSuggestion> {
  const systemPrompt = `You are a fixed asset accounting specialist. Suggest a depreciation method for PPE.

Options: straight_line (constant expense), declining_balance (front-loaded), units_of_production (usage-based; use when usage data available).

Consider: asset type, whether usage is even over time or front-loaded. Return JSON: { "method": "straight_line" | "declining_balance" | "units_of_production", "rationale": "...", "confidence": 0.X }`;

  const userContent = `Asset type: ${params.assetType}\nUsage pattern: ${params.usagePattern ?? 'not specified'}`;

  const fallback: DepreciationMethodSuggestion = {
    method: 'straight_line',
    rationale: 'Straight-line is commonly used when usage is even.',
    confidence: 0.5,
  };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 350,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      const m = parsed.method;
      const method =
        m === 'declining_balance' || m === 'units_of_production' ? m : 'straight_line';
      return {
        method,
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale : fallback.rationale,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    },
    fallback,
  });
}

export interface DepreciationFootnoteResult {
  footnote: string;
  summary: string;
}

/**
 * Generates depreciation / PPE footnote narrative for notes.
 */
export async function generateDepreciationFootnoteAgentic(summary: {
  totalDepreciation: number;
  byType?: Record<string, number>;
  periodLabel?: string;
  assetCount?: number;
}): Promise<DepreciationFootnoteResult> {
  const systemPrompt = `You are a financial reporting specialist. Generate a concise footnote disclosure for property, plant and equipment and depreciation (IAS 16 / ASC 360).

Include: depreciation expense for the period, breakdown by category if material, and policy (e.g. straight-line over useful lives). Use plain language suitable for notes to financial statements. Return JSON: { "footnote": "...", "summary": "1-2 sentence summary" }`;

  const userContent = `Depreciation expense (period): ${summary.totalDepreciation}\nBy type: ${JSON.stringify(summary.byType ?? {})}\nPeriod: ${summary.periodLabel ?? 'current'}\nAsset count: ${summary.assetCount ?? 'N/A'}`;

  const fallback: DepreciationFootnoteResult = {
    footnote: `Depreciation expense for the period was $${summary.totalDepreciation.toLocaleString()}. Property, plant and equipment are depreciated on a straight-line basis over their estimated useful lives.`,
    summary: `Depreciation expense: $${summary.totalDepreciation.toLocaleString()} for the period.`,
  };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 800,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        footnote: typeof parsed.footnote === 'string' ? parsed.footnote : fallback.footnote,
        summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
      };
    },
    fallback,
  });
}
