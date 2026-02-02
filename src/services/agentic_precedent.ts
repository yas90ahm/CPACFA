/**
 * Agentic precedent transactions: transaction selection, synergy estimation, memo.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { PrecedentAnalysisResult } from './precedent_transaction_service.js';

export interface SuggestedTransaction {
  targetCompany: string;
  acquirer: string;
  date: string;
  rationale: string;
}

export async function suggestTransactionsAgentic(
  targetCompany: string,
  industry: string,
  size: number
): Promise<{ suggestedTransactions: SuggestedTransaction[]; rationale: string }> {
  const systemPrompt = `You are an M&A analyst. Suggest relevant precedent transactions for a valuation.

Consider:
- Similar industry and business model
- Comparable deal size
- Recent transactions (last 3-5 years)
- Strategic vs financial buyers

Return JSON: { "suggestedTransactions": [{ "targetCompany": "...", "acquirer": "...", "date": "YYYY-MM", "rationale": "..." }], "rationale": "..." }`;

  const fallback = { suggestedTransactions: [] as SuggestedTransaction[], rationale: 'Unable to suggest transactions' };
  const userContent = `Target: ${targetCompany}\nIndustry: ${industry}\nSize: $${(size / 1e6).toFixed(0)}M`;

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 1000,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return { suggestedTransactions: parsed.suggestedTransactions ?? [], rationale: parsed.rationale ?? 'Transactions suggested' };
    },
    fallback,
  });
}

export interface SynergyEstimate {
  revenueSynergies: number;
  costSynergies: number;
  totalSynergies: number;
  rationale: string;
}

export async function estimateSynergiesAgentic(
  targetRevenue: number,
  acquirerRevenue: number,
  industry: string
): Promise<SynergyEstimate> {
  const systemPrompt = `You are an M&A specialist. Estimate synergies for a potential acquisition.

Consider:
- Cost synergies: 3-5% of combined costs (typical)
- Revenue synergies: 1-3% of combined revenue (harder to achieve)
- Industry-specific opportunities

Return JSON: { "revenueSynergies": X, "costSynergies": X, "totalSynergies": X, "rationale": "..." }`;

  const fallback: SynergyEstimate = { revenueSynergies: 0, costSynergies: targetRevenue * 0.03, totalSynergies: targetRevenue * 0.03, rationale: 'Default synergy estimate' };
  const userContent = `Target Revenue: $${targetRevenue.toLocaleString()}\nAcquirer Revenue: $${acquirerRevenue.toLocaleString()}\nIndustry: ${industry}`;

  return callLLMWithFallback<SynergyEstimate>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 500,
    parse: (raw: string): SynergyEstimate => {
      const parsed = JSON.parse(raw);
      return { revenueSynergies: parsed.revenueSynergies ?? 0, costSynergies: parsed.costSynergies ?? 0, totalSynergies: parsed.totalSynergies ?? fallback.totalSynergies, rationale: parsed.rationale ?? 'Synergies estimated' };
    },
    fallback,
  });
}

export interface PrecedentMemo {
  summary: string;
  transactionOverview: string;
  valuationConclusion: string;
  controlPremiumAnalysis: string;
}

export async function generatePrecedentMemoAgentic(analysis: PrecedentAnalysisResult): Promise<PrecedentMemo> {
  const systemPrompt = `You are an M&A analyst. Generate a precedent transactions memo.

Include:
1. Executive summary with valuation range
2. Transaction selection rationale
3. Valuation conclusion
4. Control premium analysis

Return JSON: { "summary": "...", "transactionOverview": "...", "valuationConclusion": "...", "controlPremiumAnalysis": "..." }`;

  const fallback: PrecedentMemo = { summary: 'Precedent memo pending.', transactionOverview: '', valuationConclusion: '', controlPremiumAnalysis: '' };

  return callLLMWithFallback<PrecedentMemo>({
    system: systemPrompt,
    prompt: JSON.stringify(analysis, null, 2),
    maxTokens: 1000,
    parse: (raw: string): PrecedentMemo => {
      const parsed = JSON.parse(raw);
      return { summary: parsed.summary ?? '', transactionOverview: parsed.transactionOverview ?? '', valuationConclusion: parsed.valuationConclusion ?? '', controlPremiumAnalysis: parsed.controlPremiumAnalysis ?? '' };
    },
    fallback,
  });
}
