/**
 * Agentic FX currency: functional currency suggestion, FX footnote (ASC 830 / IAS 21).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';

export interface FunctionalCurrencySuggestion {
  suggestedCurrency: string;
  rationale: string;
  confidence: number;
}

export async function suggestFunctionalCurrencyAgentic(params: {
  operationsSummary: string;
  primaryEconomicEnvironment?: string;
}): Promise<FunctionalCurrencySuggestion> {
  const systemPrompt = `You are a foreign currency accounting specialist (ASC 830 / IAS 21). Suggest the functional currency for an entity based on its operations and primary economic environment. Return JSON: { "suggestedCurrency": "XXX", "rationale": "...", "confidence": 0.X }`;
  const userContent = `Operations: ${params.operationsSummary}\nEnvironment: ${params.primaryEconomicEnvironment ?? 'not specified'}`;
  const fallback: FunctionalCurrencySuggestion = {
    suggestedCurrency: 'USD',
    rationale: 'Default; determine based on entity facts.',
    confidence: 0.5,
  };
  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 400,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        suggestedCurrency: typeof parsed.suggestedCurrency === 'string' ? parsed.suggestedCurrency : fallback.suggestedCurrency,
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale : fallback.rationale,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    },
    fallback,
  });
}

export interface FxFootnoteResult {
  footnote: string;
  summary: string;
}

export async function generateFxFootnoteAgentic(summary: {
  translationSummary?: string;
  cta?: number;
  remeasurementGainLoss?: number;
  reportingCurrency: string;
  functionalCurrency?: string;
  /** Resolved topic standard for citation (asc830 → ASC 830, ias21 → IAS 21). */
  topicStandard?: 'asc830' | 'ias21';
}): Promise<FxFootnoteResult> {
  const citation = summary.topicStandard === 'ias21' ? 'IAS 21' : 'ASC 830';
  const systemPrompt = `You are a financial reporting specialist. Generate a concise footnote for foreign currency (${citation}). Return JSON: { "footnote": "...", "summary": "..." }`;
  const userContent = `CTA: ${summary.cta ?? 'N/A'}\nRemeasurement: ${summary.remeasurementGainLoss ?? 'N/A'}\nReporting: ${summary.reportingCurrency}\nFunctional: ${summary.functionalCurrency ?? 'N/A'}`;
  const fallback: FxFootnoteResult = {
    footnote: `Functional currency is ${summary.functionalCurrency ?? summary.reportingCurrency}. Translation differences in OCI (CTA). Applicable standard: ${citation}.`,
    summary: `FX translation to ${summary.reportingCurrency}.`,
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
