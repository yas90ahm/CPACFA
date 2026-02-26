/**
 * Agentic stock compensation: grant recognition, fair value params, forfeiture estimation, dilution explanation.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';

// ============================================================================
// Grant Recognition Agent
// ============================================================================

export interface SuggestedGrant {
  recipientName: string;
  grantType: 'rsu' | 'option' | 'espp' | 'sar';
  shares: number;
  grantDate: string;
  vestingPeriodMonths?: number;
  confidence: number;
}

const GRANT_FALLBACK = { suggestedGrants: [] as SuggestedGrant[], rationale: 'Failed to parse LLM response' };

/**
 * Suggests grants to recognize from board minutes, offer letters, or equity plan documents.
 */
export async function suggestGrantRecognitionAgentic(documentText: string): Promise<{ suggestedGrants: SuggestedGrant[]; rationale: string }> {
  const systemPrompt = `You are an equity compensation specialist. Given a document (board minutes, offer letter, or equity plan),
identify any stock grants that should be recognized. Extract:
- Recipient name
- Grant type (rsu, option, espp, sar)
- Number of shares
- Grant date
- Vesting period if mentioned
- Confidence score (0-1)

Return JSON: { "suggestedGrants": [...], "rationale": "..." }`;

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: documentText.slice(0, 8000),
    maxTokens: 1000,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        suggestedGrants: parsed.suggestedGrants ?? [],
        rationale: parsed.rationale ?? 'Unable to parse grants from document',
      };
    },
    fallback: GRANT_FALLBACK,
  });
}

// ============================================================================
// Black-Scholes Parameters Agent
// ============================================================================

export interface BlackScholesParamsSuggestion {
  volatility: number;
  riskFreeRate: number;
  expectedTerm: number;
  dividendYield: number;
  rationale: string;
}

const BS_DEFAULT: BlackScholesParamsSuggestion = {
  volatility: 0.45,
  riskFreeRate: 0.04,
  expectedTerm: 6,
  dividendYield: 0,
  rationale: 'Default parameters for private technology company',
};

/**
 * Suggests Black-Scholes parameters based on company info and market data.
 */
export async function suggestBlackScholesParamsAgentic(companyInfo: {
  ticker?: string;
  industry: string;
  marketCap: number;
  isPublic?: boolean;
}): Promise<BlackScholesParamsSuggestion> {
  const systemPrompt = `You are an options valuation specialist. Given company information, suggest appropriate Black-Scholes parameters.

Guidelines:
- Volatility: Use industry benchmarks. Tech/biotech: 40-80%, Utilities: 15-25%, Retail: 30-50%
- Risk-free rate: Use current 10-year Treasury yield (assume ~4% in 2024-2025)
- Expected term: Typically 5-7 years for employee options (simplified method: (vesting + contractual) / 2)
- Dividend yield: 0 for most tech companies, 2-4% for mature dividend payers

Return JSON: { "volatility": 0.XX, "riskFreeRate": 0.XX, "expectedTerm": X.X, "dividendYield": 0.XX, "rationale": "..." }`;

  const userContent = `Company: ${companyInfo.ticker ?? 'Private'}, Industry: ${companyInfo.industry}, Market Cap: $${(companyInfo.marketCap / 1e6).toFixed(0)}M, Public: ${companyInfo.isPublic ?? false}`;

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 500,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        volatility: parsed.volatility ?? 0.4,
        riskFreeRate: parsed.riskFreeRate ?? 0.04,
        expectedTerm: parsed.expectedTerm ?? 6,
        dividendYield: parsed.dividendYield ?? 0,
        rationale: parsed.rationale ?? 'Default parameters applied',
      };
    },
    fallback: BS_DEFAULT,
  });
}

// ============================================================================
// Forfeiture Rate Estimation Agent
// ============================================================================

export interface ForfeitureEstimate {
  estimatedRate: number;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

/**
 * Estimates forfeiture rate based on historical data and company characteristics.
 */
export async function estimateForfeitureRateAgentic(historicalData: {
  totalGrants: number;
  forfeitedGrants: number;
  avgTenureYears: number;
  industryTurnoverRate?: number;
}): Promise<ForfeitureEstimate> {
  const systemPrompt = `You are an equity compensation actuary. Estimate the forfeiture rate for stock grants.

Guidelines:
- Historical forfeiture rate is the primary input
- Adjust based on industry turnover (tech: higher, utilities: lower)
- Consider average tenure (longer = lower forfeiture)
- Typical ranges: 5-15% for stable companies, 15-30% for high-growth startups

Return JSON: { "estimatedRate": 0.XX, "confidence": "high|medium|low", "rationale": "..." }`;

  const historicalRate = historicalData.totalGrants > 0 ? historicalData.forfeitedGrants / historicalData.totalGrants : 0.1;
  const userContent = `Historical forfeiture rate: ${(historicalRate * 100).toFixed(1)}%, Total grants: ${historicalData.totalGrants}, Avg tenure: ${historicalData.avgTenureYears} years, Industry turnover: ${historicalData.industryTurnoverRate ?? 'unknown'}`;

  const fallback: ForfeitureEstimate = {
    estimatedRate: historicalRate > 0 ? historicalRate : 0.1,
    confidence: 'low',
    rationale: 'Defaulted to historical rate or 10% assumption',
  };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 400,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        estimatedRate: parsed.estimatedRate ?? historicalRate,
        confidence: parsed.confidence ?? 'medium',
        rationale: parsed.rationale ?? 'Based on historical data',
      };
    },
    fallback,
  });
}

// ============================================================================
// Dilution Explainer Agent
// ============================================================================

export interface DilutionExplanation {
  summary: string;
  impactOnEPS: string;
  recommendations: string[];
}

/**
 * Generates plain-language explanation of dilution impact.
 */
export async function explainDilutionAgentic(dilutionData: {
  basicShares: number;
  dilutedShares: number;
  dilutionPercent: number;
  optionsOutstanding: number;
  inTheMoneyOptions: number;
  stockPrice: number;
  eps?: number;
}): Promise<DilutionExplanation> {
  const systemPrompt = `You are a financial communications expert. Explain stock dilution impact in plain language for executives and board members.

Cover:
1. What the dilution means in practical terms
2. Impact on EPS (if provided)
3. Key drivers of dilution
4. Any recommendations or considerations

Be concise but thorough. Avoid jargon. Return JSON: { "summary": "...", "impactOnEPS": "...", "recommendations": ["..."] }`;

  const userContent = `
Basic shares: ${dilutionData.basicShares.toLocaleString()}
Diluted shares: ${dilutionData.dilutedShares.toLocaleString()}
Dilution: ${dilutionData.dilutionPercent.toFixed(2)}%
Options outstanding: ${dilutionData.optionsOutstanding.toLocaleString()}
In-the-money options: ${dilutionData.inTheMoneyOptions.toLocaleString()}
Stock price: $${dilutionData.stockPrice.toFixed(2)}
${dilutionData.eps ? `Basic EPS: $${dilutionData.eps.toFixed(2)}` : ''}`;

  const fallback: DilutionExplanation = {
    summary: 'Unable to generate dilution explanation',
    impactOnEPS: dilutionData.eps ? `Diluted EPS would be approximately $${(dilutionData.eps * dilutionData.basicShares / dilutionData.dilutedShares).toFixed(2)}` : 'EPS data not provided',
    recommendations: [],
  };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 600,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        summary: parsed.summary ?? raw,
        impactOnEPS: parsed.impactOnEPS ?? fallback.impactOnEPS,
        recommendations: parsed.recommendations ?? [],
      };
    },
    fallback,
  });
}

// ============================================================================
// Modification Detection Agent
// ============================================================================

export interface ModificationAnalysis {
  isModification: boolean;
  modificationType?: 'repricing' | 'extension' | 'vesting_change' | 'other';
  incrementalExpense?: number;
  rationale: string;
}

const MODIFICATION_FALLBACK: ModificationAnalysis = {
  isModification: false,
  rationale: 'Unable to determine modification status',
};

/**
 * Detects grant modifications and calculates incremental expense.
 */
export async function analyzeModificationAgentic(modification: {
  originalTerms: { strikePrice?: number; expirationDate?: string; vestingSchedule?: string };
  newTerms: { strikePrice?: number; expirationDate?: string; vestingSchedule?: string };
  originalFairValue: number;
  stockPriceAtModification: number;
}): Promise<ModificationAnalysis> {
  const systemPrompt = `You are an equity compensation expert. Analyze whether a change to stock grant terms constitutes an accounting modification under ASC 718.

A modification occurs when:
1. The fair value of the award changes (repricing)
2. The vesting conditions change
3. The classification changes (liability vs equity)

If it's a modification, determine the type and estimate incremental expense.

Return JSON: { "isModification": true/false, "modificationType": "...", "incrementalExpense": X, "rationale": "..." }`;

  const userContent = JSON.stringify(modification);

  return callLLMWithFallback<ModificationAnalysis>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 500,
    parse: (raw: string): ModificationAnalysis => {
      const parsed = JSON.parse(raw);
      return {
        isModification: parsed.isModification ?? false,
        modificationType: parsed.modificationType,
        incrementalExpense: parsed.incrementalExpense,
        rationale: parsed.rationale ?? 'Analysis complete',
      };
    },
    fallback: MODIFICATION_FALLBACK,
  });
}
