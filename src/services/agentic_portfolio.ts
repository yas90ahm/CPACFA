/**
 * Agentic portfolio analytics: allocation suggestions, rebalancing, risk narrative.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { AllocationAnalysis, PerformanceAttribution } from './portfolio_analytics_service.js';

export interface AllocationSuggestion {
  suggestedAllocation: Record<string, number>;
  rationale: string;
  riskProfile: 'conservative' | 'moderate' | 'aggressive';
}

export async function suggestAllocationAgentic(investorProfile: { age: number; riskTolerance: 'low' | 'medium' | 'high'; investmentHorizon: number }): Promise<AllocationSuggestion> {
  const systemPrompt = `You are a financial advisor. Suggest an asset allocation based on investor profile.

Guidelines:
- Conservative: 20-40% equities, 40-60% fixed income, 10-20% alternatives/cash
- Moderate: 40-60% equities, 30-40% fixed income, 10-20% alternatives
- Aggressive: 60-80% equities, 10-20% fixed income, 10-20% alternatives

Consider age (100 - age rule for equities), risk tolerance, and investment horizon.

Return JSON: { "suggestedAllocation": { "equities": 0.X, "fixed_income": 0.X, "alternatives": 0.X, "cash": 0.X }, "rationale": "...", "riskProfile": "conservative|moderate|aggressive" }`;

  const equityWeight = Math.min(0.8, Math.max(0.2, (100 - investorProfile.age) / 100));
  const fallback: AllocationSuggestion = { suggestedAllocation: { equities: equityWeight, fixed_income: 0.3, alternatives: 0.1, cash: 0.6 - equityWeight }, rationale: 'Based on age and risk tolerance', riskProfile: investorProfile.riskTolerance === 'high' ? 'aggressive' : (investorProfile.riskTolerance === 'low' ? 'conservative' : 'moderate') };
  return callLLMWithFallback<AllocationSuggestion>({ system: systemPrompt, prompt: JSON.stringify(investorProfile), maxTokens: 600, parse: (raw: string): AllocationSuggestion => { const p = JSON.parse(raw); return { suggestedAllocation: p.suggestedAllocation ?? fallback.suggestedAllocation, rationale: p.rationale ?? '', riskProfile: p.riskProfile ?? fallback.riskProfile }; }, fallback });
}

export interface RebalancingRecommendation {
  urgency: 'low' | 'medium' | 'high';
  trades: Array<{ assetClass: string; action: 'buy' | 'sell'; amount: number; priority: number }>;
  taxConsiderations: string;
  rationale: string;
}

export async function suggestRebalancingAgentic(allocationAnalysis: AllocationAnalysis, taxLotInfo?: string): Promise<RebalancingRecommendation> {
  const systemPrompt = `You are a portfolio manager. Recommend a rebalancing strategy.

Consider:
- Drift magnitude (>5% typically triggers rebalance)
- Transaction costs vs tracking error
- Tax-loss harvesting opportunities
- Wash sale rules

Return JSON: { "urgency": "low|medium|high", "trades": [{ "assetClass": "...", "action": "buy|sell", "amount": X, "priority": 1 }], "taxConsiderations": "...", "rationale": "..." }`;

  const fallback: RebalancingRecommendation = { urgency: allocationAnalysis.rebalanceNeeded ? 'medium' : 'low', trades: allocationAnalysis.rebalanceTrades.map((t, i) => ({ ...t, priority: i + 1 })), taxConsiderations: 'Consider tax implications before executing', rationale: 'Based on allocation drift' };
  return callLLMWithFallback<RebalancingRecommendation>({ system: systemPrompt, prompt: JSON.stringify({ allocationAnalysis, taxLotInfo }), maxTokens: 700, parse: (raw: string): RebalancingRecommendation => { const p = JSON.parse(raw); return { urgency: p.urgency ?? fallback.urgency, trades: p.trades ?? fallback.trades, taxConsiderations: p.taxConsiderations ?? '', rationale: p.rationale ?? '' }; }, fallback });
}

export interface RiskNarrative {
  summary: string;
  keyRisks: string[];
  recommendations: string[];
  outlook: string;
}

export async function generateRiskNarrativeAgentic(performanceData: { sharpeRatio: number; sortinoRatio: number; maxDrawdown: number; volatility: number; beta: number }): Promise<RiskNarrative> {
  const systemPrompt = `You are a risk analyst. Generate a risk narrative for a portfolio.

Interpret:
- Sharpe Ratio: >1 good, >2 excellent, <0 underperforming risk-free
- Sortino Ratio: >2 good, focuses on downside risk
- Max Drawdown: <20% moderate, >30% significant
- Volatility: compare to benchmark
- Beta: <1 defensive, >1 aggressive

Return JSON: { "summary": "...", "keyRisks": ["..."], "recommendations": ["..."], "outlook": "..." }`;

  const fallback: RiskNarrative = { summary: 'Risk analysis pending.', keyRisks: [], recommendations: [], outlook: '' };
  return callLLMWithFallback<RiskNarrative>({ system: systemPrompt, prompt: JSON.stringify(performanceData), maxTokens: 800, parse: (raw: string): RiskNarrative => { const p = JSON.parse(raw); return { summary: p.summary ?? '', keyRisks: p.keyRisks ?? [], recommendations: p.recommendations ?? [], outlook: p.outlook ?? '' }; }, fallback });
}

export interface AttributionNarrative {
  summary: string;
  allocationImpact: string;
  selectionImpact: string;
  keyTakeaways: string[];
}

export async function generateAttributionNarrativeAgentic(attribution: PerformanceAttribution): Promise<AttributionNarrative> {
  const systemPrompt = `You are a performance analyst. Generate a narrative explaining portfolio performance attribution.

Explain:
- Allocation effect: over/underweight impact
- Selection effect: security selection impact
- Interaction effect: combined impact

Return JSON: { "summary": "...", "allocationImpact": "...", "selectionImpact": "...", "keyTakeaways": ["..."] }`;

  const fallback: AttributionNarrative = { summary: 'Attribution analysis pending.', allocationImpact: '', selectionImpact: '', keyTakeaways: [] };
  return callLLMWithFallback<AttributionNarrative>({ system: systemPrompt, prompt: JSON.stringify(attribution), maxTokens: 700, parse: (raw: string): AttributionNarrative => { const p = JSON.parse(raw); return { summary: p.summary ?? '', allocationImpact: p.allocationImpact ?? '', selectionImpact: p.selectionImpact ?? '', keyTakeaways: p.keyTakeaways ?? [] }; }, fallback });
}
