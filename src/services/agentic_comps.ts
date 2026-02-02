/**
 * Agentic comparable analysis: peer selection, multiple selection, adjustments, memo.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { ComparableAnalysisResult } from './comparable_analysis_service.js';

// ============================================================================
// Peer Selection Agent
// ============================================================================

export interface SuggestedPeer {
  name: string;
  ticker: string;
  rationale: string;
  similarity: number; // 0-1
}

/**
 * Suggests comparable companies based on target characteristics.
 */
export async function suggestComparablesAgentic(
  targetCompany: string,
  industry: string,
  size: number,
  businessDescription?: string
): Promise<{ suggestedComps: SuggestedPeer[]; rationale: string }> {
  const systemPrompt = `You are an investment banking analyst. Suggest comparable companies for a trading comps analysis.

Selection criteria:
- Similar business model and industry
- Comparable size (revenue, market cap)
- Similar growth profile
- Geographic presence
- Competitive positioning

Return JSON: { "suggestedComps": [{ "name": "...", "ticker": "...", "rationale": "...", "similarity": 0.X }], "rationale": "..." }

Suggest 5-10 public companies with their tickers.`;

  const fallback = { suggestedComps: [] as SuggestedPeer[], rationale: 'Unable to suggest comparables' };

  const userContent = `Target: ${targetCompany}\nIndustry: ${industry}\nSize (Revenue): $${(size / 1e6).toFixed(0)}M\n${businessDescription ? `Description: ${businessDescription}` : ''}`;

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 1000,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        suggestedComps: parsed.suggestedComps ?? [],
        rationale: parsed.rationale ?? 'Comparables suggested',
      };
    },
    fallback,
  });
}

// ============================================================================
// Multiple Selection Agent
// ============================================================================

export interface MultipleRecommendation {
  primaryMultiple: string;
  secondaryMultiples: string[];
  rationale: string;
}

/**
 * Suggests relevant multiples based on industry and growth stage.
 */
export async function suggestMultiplesAgentic(
  industry: string,
  growthStage: 'early' | 'growth' | 'mature' | 'declining',
  isProfitable: boolean
): Promise<MultipleRecommendation> {
  const systemPrompt = `You are a valuation specialist. Suggest the most relevant trading multiples for a comparable analysis.

Common multiples by industry:
- Tech/SaaS: EV/Revenue, EV/ARR (if unprofitable), EV/EBITDA
- Industrial/Manufacturing: EV/EBITDA, P/E
- Financial Services: P/E, P/B, P/TBV
- Real Estate: P/FFO, P/NAV
- Healthcare: EV/Revenue, EV/EBITDA
- Retail: EV/EBITDA, P/E

Growth stage considerations:
- Early stage: Revenue multiples (may not be profitable)
- Mature: EBITDA or earnings multiples

Return JSON: { "primaryMultiple": "...", "secondaryMultiples": ["..."], "rationale": "..." }`;

  const fallback: MultipleRecommendation = {
    primaryMultiple: 'EV/EBITDA',
    secondaryMultiples: ['EV/Revenue', 'P/E'],
    rationale: 'Standard multiples applied',
  };

  const userContent = `Industry: ${industry}\nGrowth Stage: ${growthStage}\nProfitable: ${isProfitable}`;

  return callLLMWithFallback<MultipleRecommendation>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 500,
    parse: (raw: string): MultipleRecommendation => {
      const parsed = JSON.parse(raw);
      return {
        primaryMultiple: parsed.primaryMultiple ?? 'EV/EBITDA',
        secondaryMultiples: parsed.secondaryMultiples ?? [],
        rationale: parsed.rationale ?? 'Multiples selected',
      };
    },
    fallback,
  });
}

// ============================================================================
// Adjustment Recommendations Agent
// ============================================================================

export interface AdjustmentRecommendation {
  adjustments: Array<{
    type: 'premium' | 'discount';
    factor: string;
    percentChange: number;
    rationale: string;
  }>;
  netAdjustment: number;
  rationale: string;
}

/**
 * Suggests adjustments to comps-derived valuation.
 */
export async function suggestAdjustmentsAgentic(
  targetCharacteristics: {
    growthRate: number;
    margins: number;
    marketPosition: string;
    size: 'larger' | 'similar' | 'smaller';
  },
  compMedianGrowth: number,
  compMedianMargin: number
): Promise<AdjustmentRecommendation> {
  const systemPrompt = `You are a valuation specialist. Suggest adjustments to a trading comps valuation based on target vs comp characteristics.

Common adjustments:
- Growth premium/discount (higher growth = premium)
- Margin premium/discount (higher margins = premium)
- Size discount (smaller = discount for liquidity)
- Market position (leader = premium)
- Geographic mix

Return JSON: { "adjustments": [{ "type": "premium|discount", "factor": "...", "percentChange": X, "rationale": "..." }], "netAdjustment": X, "rationale": "..." }`;

  const fallback: AdjustmentRecommendation = {
    adjustments: [],
    netAdjustment: 0,
    rationale: 'No adjustments recommended',
  };

  const userContent = `Target Growth: ${(targetCharacteristics.growthRate * 100).toFixed(1)}% vs Comp Median: ${(compMedianGrowth * 100).toFixed(1)}%\nTarget Margin: ${(targetCharacteristics.margins * 100).toFixed(1)}% vs Comp Median: ${(compMedianMargin * 100).toFixed(1)}%\nMarket Position: ${targetCharacteristics.marketPosition}\nRelative Size: ${targetCharacteristics.size}`;

  return callLLMWithFallback<AdjustmentRecommendation>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 700,
    parse: (raw: string): AdjustmentRecommendation => {
      const parsed = JSON.parse(raw);
      return {
        adjustments: parsed.adjustments ?? [],
        netAdjustment: parsed.netAdjustment ?? 0,
        rationale: parsed.rationale ?? 'Adjustments analyzed',
      };
    },
    fallback,
  });
}

// ============================================================================
// Comps Memo Agent
// ============================================================================

export interface CompsMemo {
  summary: string;
  peerSelectionRationale: string;
  valuationConclusion: string;
  keyConsiderations: string[];
  limitations: string[];
}

/**
 * Generates comparable analysis memo/summary.
 */
export async function generateCompsMemoAgentic(
  analysis: ComparableAnalysisResult
): Promise<CompsMemo> {
  const systemPrompt = `You are an investment banking analyst. Generate a trading comps analysis memo.

Include:
1. Executive summary with valuation range
2. Peer selection rationale
3. Valuation conclusion with multiple perspectives
4. Key considerations and qualitative factors
5. Limitations of the analysis

Return JSON: { "summary": "...", "peerSelectionRationale": "...", "valuationConclusion": "...", "keyConsiderations": ["..."], "limitations": ["..."] }`;

  const fallback: CompsMemo = {
    summary: 'Comps memo pending review.',
    peerSelectionRationale: '',
    valuationConclusion: '',
    keyConsiderations: [],
    limitations: [],
  };

  const userContent = JSON.stringify(analysis, null, 2);

  return callLLMWithFallback<CompsMemo>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 1000,
    parse: (raw: string): CompsMemo => {
      const parsed = JSON.parse(raw);
      return {
        summary: parsed.summary ?? '',
        peerSelectionRationale: parsed.peerSelectionRationale ?? '',
        valuationConclusion: parsed.valuationConclusion ?? '',
        keyConsiderations: parsed.keyConsiderations ?? [],
        limitations: parsed.limitations ?? [],
      };
    },
    fallback,
  });
}

// ============================================================================
// Outlier Detection Agent
// ============================================================================

export interface OutlierAnalysis {
  outliers: Array<{
    companyName: string;
    metric: string;
    value: number;
    reason: string;
  }>;
  recommendation: string;
}

/**
 * Identifies outliers in the comparable set.
 */
export async function detectOutliersAgentic(
  comparables: Array<{ companyName: string; multiples: { evEbitda: number; evRevenue: number; pe: number } }>
): Promise<OutlierAnalysis> {
  const systemPrompt = `You are a valuation specialist. Identify outliers in a comparable company set that may skew the analysis.

Consider:
- Statistical outliers (>2 standard deviations from mean)
- Business model differences
- One-time events affecting metrics
- Growth stage differences

Return JSON: { "outliers": [{ "companyName": "...", "metric": "...", "value": X, "reason": "..." }], "recommendation": "..." }`;

  const fallback: OutlierAnalysis = {
    outliers: [],
    recommendation: 'No significant outliers detected',
  };

  const userContent = JSON.stringify(comparables);

  return callLLMWithFallback<OutlierAnalysis>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 600,
    parse: (raw: string): OutlierAnalysis => {
      const parsed = JSON.parse(raw);
      return {
        outliers: parsed.outliers ?? [],
        recommendation: parsed.recommendation ?? 'Analysis complete',
      };
    },
    fallback,
  });
}
