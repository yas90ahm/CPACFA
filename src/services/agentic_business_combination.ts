/**
 * Agentic business combination: intangible identification, fair value methods, earn-out modeling.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { PPAResult } from './business_combination_service.js';

export interface SuggestedIntangible {
  description: string;
  type: 'customer_relationships' | 'technology' | 'trade_name' | 'non_compete' | 'backlog' | 'other';
  valuationMethod: string;
  usefulLife: number;
  rationale: string;
}

export async function identifyIntangiblesAgentic(acquireeBusiness: string, industry: string): Promise<{ suggestedIntangibles: SuggestedIntangible[]; rationale: string }> {
  const systemPrompt = `You are a PPA specialist. Identify intangible assets to be recognized in a business combination under ASC 805.

Common intangibles:
- Customer relationships (income approach)
- Developed technology (relief from royalty or cost approach)
- Trade name/trademark (relief from royalty)
- Non-compete agreements (with/without method)
- Backlog (income approach)
- Favorable contracts

Return JSON: { "suggestedIntangibles": [{ "description": "...", "type": "...", "valuationMethod": "...", "usefulLife": X, "rationale": "..." }], "rationale": "..." }`;

  const fallback = { suggestedIntangibles: [] as SuggestedIntangible[], rationale: 'Unable to identify intangibles' };
  return callLLMWithFallback({ system: systemPrompt, prompt: `Business: ${acquireeBusiness}\nIndustry: ${industry}`, maxTokens: 1000, parse: (raw: string) => { const p = JSON.parse(raw); return { suggestedIntangibles: p.suggestedIntangibles ?? [], rationale: p.rationale ?? '' }; }, fallback });
}

export interface EarnOutValuation {
  fairValue: number;
  scenarios: Array<{ description: string; probability: number; payout: number }>;
  rationale: string;
}

export async function valueEarnOutAgentic(earnOutTerms: { type: string; targetMetric: string; maxPayout: number }, historicalPerformance: number): Promise<EarnOutValuation> {
  const systemPrompt = `You are a valuation specialist. Value contingent consideration (earn-out) using probability-weighted scenarios.

Consider:
- Historical performance vs target
- Industry volatility
- Management retention
- Achievability of milestones

Return JSON: { "fairValue": X, "scenarios": [{ "description": "...", "probability": 0.X, "payout": X }], "rationale": "..." }`;

  const fallback: EarnOutValuation = { fairValue: earnOutTerms.maxPayout * 0.5, scenarios: [{ description: 'Base case', probability: 0.5, payout: earnOutTerms.maxPayout }], rationale: 'Default 50% probability applied' };
  return callLLMWithFallback<EarnOutValuation>({ system: systemPrompt, prompt: JSON.stringify({ earnOutTerms, historicalPerformance }), maxTokens: 700, parse: (raw: string): EarnOutValuation => { const p = JSON.parse(raw); return { fairValue: p.fairValue ?? fallback.fairValue, scenarios: p.scenarios ?? fallback.scenarios, rationale: p.rationale ?? '' }; }, fallback });
}

export interface PPAFootnote {
  summary: string;
  purchasePriceAllocation: string;
  intangibleAssetsDisclosure: string;
  goodwillDisclosure: string;
  contingentConsiderationDisclosure: string;
}

export async function generatePPAFootnoteAgentic(ppaResult: PPAResult): Promise<PPAFootnote> {
  const systemPrompt = `You are a financial reporting expert. Generate a business combination footnote disclosure under ASC 805.

Include:
1. Transaction summary
2. Purchase price allocation table reference
3. Intangible assets identified and valuation methods
4. Goodwill attribution and tax deductibility
5. Contingent consideration accounting

Return JSON: { "summary": "...", "purchasePriceAllocation": "...", "intangibleAssetsDisclosure": "...", "goodwillDisclosure": "...", "contingentConsiderationDisclosure": "..." }`;

  const fallback: PPAFootnote = { summary: 'PPA footnote pending.', purchasePriceAllocation: '', intangibleAssetsDisclosure: '', goodwillDisclosure: '', contingentConsiderationDisclosure: '' };
  return callLLMWithFallback<PPAFootnote>({ system: systemPrompt, prompt: JSON.stringify(ppaResult, null, 2), maxTokens: 1200, parse: (raw: string): PPAFootnote => { const p = JSON.parse(raw); return { summary: p.summary ?? '', purchasePriceAllocation: p.purchasePriceAllocation ?? '', intangibleAssetsDisclosure: p.intangibleAssetsDisclosure ?? '', goodwillDisclosure: p.goodwillDisclosure ?? '', contingentConsiderationDisclosure: p.contingentConsiderationDisclosure ?? '' }; }, fallback });
}
