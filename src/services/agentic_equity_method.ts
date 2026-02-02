/**
 * Agentic equity method: influence assessment, basis reconciliation, impairment indicators.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';

export interface InfluenceAssessment {
  hasSignificantInfluence: boolean;
  influenceFactors: string[];
  recommendation: 'equity_method' | 'fair_value' | 'consolidation';
  rationale: string;
}

export async function assessInfluenceAgentic(ownershipPercent: number, factors: { hasBoardSeat?: boolean; hasMaterialTransactions?: boolean; sharesKeyPersonnel?: boolean }): Promise<InfluenceAssessment> {
  const systemPrompt = `You are an accounting specialist. Assess whether significant influence exists for an equity investment under IAS 28 / ASC 323.

Significant influence indicators:
- Ownership 20-50% (presumed)
- Board representation
- Participation in policy-making
- Material inter-company transactions
- Interchange of managerial personnel
- Provision of essential technical information

Return JSON: { "hasSignificantInfluence": true/false, "influenceFactors": ["..."], "recommendation": "equity_method|fair_value|consolidation", "rationale": "..." }`;

  const fallback: InfluenceAssessment = { hasSignificantInfluence: ownershipPercent >= 0.2 && ownershipPercent < 0.5, influenceFactors: [], recommendation: ownershipPercent >= 0.5 ? 'consolidation' : (ownershipPercent >= 0.2 ? 'equity_method' : 'fair_value'), rationale: 'Based on ownership percentage' };
  return callLLMWithFallback<InfluenceAssessment>({ system: systemPrompt, prompt: JSON.stringify({ ownershipPercent, factors }), maxTokens: 600, parse: (raw: string): InfluenceAssessment => { const p = JSON.parse(raw); return { hasSignificantInfluence: p.hasSignificantInfluence ?? fallback.hasSignificantInfluence, influenceFactors: p.influenceFactors ?? [], recommendation: p.recommendation ?? fallback.recommendation, rationale: p.rationale ?? '' }; }, fallback });
}

export interface BasisReconciliation {
  components: Array<{ description: string; amount: number; amortizationYears: number }>;
  totalBasisDifference: number;
  annualAmortization: number;
  rationale: string;
}

export async function reconcileBasisDifferenceAgentic(purchasePrice: number, bookValueShare: number, fairValueAdjustments?: string): Promise<BasisReconciliation> {
  const systemPrompt = `You are an accounting specialist. Reconcile basis difference in an equity method investment.

Basis difference = Purchase price - Share of book value
Components typically include:
- Land (no amortization)
- PP&E adjustments (depreciate over useful life)
- Intangibles (amortize)
- Goodwill (test for impairment)

Return JSON: { "components": [{ "description": "...", "amount": X, "amortizationYears": X }], "totalBasisDifference": X, "annualAmortization": X, "rationale": "..." }`;

  const basisDiff = purchasePrice - bookValueShare;
  const fallback: BasisReconciliation = { components: [{ description: 'Unallocated basis difference', amount: basisDiff, amortizationYears: 10 }], totalBasisDifference: basisDiff, annualAmortization: basisDiff / 10, rationale: 'Default allocation' };
  return callLLMWithFallback<BasisReconciliation>({ system: systemPrompt, prompt: `Purchase Price: ${purchasePrice}, Book Value Share: ${bookValueShare}, Adjustments: ${fairValueAdjustments ?? 'None'}`, maxTokens: 700, parse: (raw: string): BasisReconciliation => { const p = JSON.parse(raw); return { components: p.components ?? fallback.components, totalBasisDifference: p.totalBasisDifference ?? basisDiff, annualAmortization: p.annualAmortization ?? fallback.annualAmortization, rationale: p.rationale ?? '' }; }, fallback });
}

export interface ImpairmentIndicators {
  indicatorsPresent: boolean;
  indicators: string[];
  recommendation: string;
}

export async function assessImpairmentIndicatorsAgentic(investeePerformance: { revenueChange: number; marginChange: number; lossYears: number }): Promise<ImpairmentIndicators> {
  const systemPrompt = `You are an accounting specialist. Assess impairment indicators for an equity method investment.

Indicators of impairment:
- Significant financial difficulty of investee
- Breach of contract (default, delinquency)
- Restructuring of debt terms
- Probability of bankruptcy
- Disappearance of active market
- Prolonged losses

Return JSON: { "indicatorsPresent": true/false, "indicators": ["..."], "recommendation": "..." }`;

  const fallback: ImpairmentIndicators = { indicatorsPresent: investeePerformance.lossYears >= 2, indicators: investeePerformance.lossYears >= 2 ? ['Sustained losses'] : [], recommendation: investeePerformance.lossYears >= 2 ? 'Perform impairment test' : 'No impairment test required' };
  return callLLMWithFallback<ImpairmentIndicators>({ system: systemPrompt, prompt: JSON.stringify(investeePerformance), maxTokens: 500, parse: (raw: string): ImpairmentIndicators => { const p = JSON.parse(raw); return { indicatorsPresent: p.indicatorsPresent ?? fallback.indicatorsPresent, indicators: p.indicators ?? fallback.indicators, recommendation: p.recommendation ?? fallback.recommendation }; }, fallback });
}
