/**
 * Agentic DCF: revenue forecast, margin forecast, WACC calculation, valuation summary.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { DCFResult, WACCInput } from './dcf_valuation_service.js';

// ============================================================================
// Revenue Forecast Agent
// ============================================================================

export interface RevenueForecast {
  projectedRevenue: number[];
  growthRates: number[];
  assumptions: string;
  confidence: number;
}

/**
 * Projects revenue from historical data and guidance.
 */
export async function projectRevenueAgentic(
  historicals: number[],
  guidance?: string,
  industry?: string
): Promise<RevenueForecast> {
  const systemPrompt = `You are a financial analyst. Project 5-year revenue based on historical data and any available guidance.

Consider:
- Historical growth rate and trends
- Industry growth expectations
- Company-specific factors from guidance
- Mean reversion for high/low growth companies

Return JSON: { "projectedRevenue": [year1, year2, year3, year4, year5], "growthRates": [rate1, rate2, rate3, rate4, rate5], "assumptions": "...", "confidence": 0.X }`;

  const cagr = historicals.length >= 2 
    ? Math.pow(historicals[historicals.length - 1] / historicals[0], 1 / (historicals.length - 1)) - 1 
    : 0.05;

  const lastRevenue = historicals[historicals.length - 1] || 1000000;
  const defaultProjection = Array.from({ length: 5 }, (_, i) => round2(lastRevenue * Math.pow(1 + cagr * 0.8, i + 1)));

  const fallback: RevenueForecast = {
    projectedRevenue: defaultProjection,
    growthRates: Array(5).fill(cagr * 0.8),
    assumptions: 'Based on historical CAGR with slight mean reversion',
    confidence: 0.5,
  };

  const userContent = `Historical Revenue: ${JSON.stringify(historicals)}\n${guidance ? `Guidance: ${guidance}` : ''}\n${industry ? `Industry: ${industry}` : ''}`;

  return callLLMWithFallback<RevenueForecast>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 600,
    parse: (raw: string): RevenueForecast => {
      const parsed = JSON.parse(raw);
      return {
        projectedRevenue: parsed.projectedRevenue ?? defaultProjection,
        growthRates: parsed.growthRates ?? fallback.growthRates,
        assumptions: parsed.assumptions ?? 'Revenue projected',
        confidence: parsed.confidence ?? 0.5,
      };
    },
    fallback,
  });
}

// ============================================================================
// Margin Forecast Agent
// ============================================================================

export interface MarginForecast {
  projectedMargins: number[];
  fcfConversion: number[];
  assumptions: string;
}

/**
 * Projects margins and FCF conversion from revenue projections.
 */
export async function projectMarginsAgentic(
  historicalMargins: number[],
  projectedRevenue: number[],
  industry?: string
): Promise<MarginForecast> {
  const systemPrompt = `You are a financial analyst. Project operating margins and FCF conversion for a valuation model.

Consider:
- Historical margin trends
- Operating leverage as revenue scales
- Industry benchmarks
- Capex and working capital needs

Return JSON: { "projectedMargins": [margin1, margin2, ...], "fcfConversion": [conv1, conv2, ...], "assumptions": "..." }`;

  const avgMargin = historicalMargins.length > 0 
    ? historicalMargins.reduce((a, b) => a + b, 0) / historicalMargins.length 
    : 0.15;

  const fallback: MarginForecast = {
    projectedMargins: Array(5).fill(avgMargin),
    fcfConversion: Array(5).fill(0.8),
    assumptions: 'Margins held constant at historical average',
  };

  const userContent = `Historical Margins: ${JSON.stringify(historicalMargins)}\nProjected Revenue: ${JSON.stringify(projectedRevenue)}\n${industry ? `Industry: ${industry}` : ''}`;

  return callLLMWithFallback<MarginForecast>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 600,
    parse: (raw: string): MarginForecast => {
      const parsed = JSON.parse(raw);
      return {
        projectedMargins: parsed.projectedMargins ?? fallback.projectedMargins,
        fcfConversion: parsed.fcfConversion ?? fallback.fcfConversion,
        assumptions: parsed.assumptions ?? 'Margins projected',
      };
    },
    fallback,
  });
}

// ============================================================================
// WACC Calculation Agent
// ============================================================================

export interface WACCSuggestion {
  wacc: number;
  components: WACCInput;
  rationale: string;
}

/**
 * Calculates WACC from market data and company characteristics.
 */
export async function calculateWACCAgentic(companyInfo: {
  ticker?: string;
  industry: string;
  creditRating?: string;
  debtToEquity?: number;
}): Promise<WACCSuggestion> {
  const systemPrompt = `You are a valuation specialist. Calculate WACC for a company based on its characteristics.

Components:
- Risk-free rate: 10-year Treasury (~4% currently)
- Market risk premium: 5-6%
- Beta: Industry-specific (Tech: 1.2-1.5, Utilities: 0.6-0.8, Consumer: 0.9-1.1)
- Cost of debt: Based on credit rating or spread over risk-free
- Capital structure: D/E ratio

Return JSON: { "wacc": 0.XX, "components": { "riskFreeRate": 0.XX, "beta": X.X, "marketRiskPremium": 0.XX, "costOfDebt": 0.XX, "taxRate": 0.XX, "debtWeight": 0.XX, "equityWeight": 0.XX }, "rationale": "..." }`;

  const fallback: WACCSuggestion = {
    wacc: 0.10,
    components: {
      riskFreeRate: 0.04,
      beta: 1.0,
      marketRiskPremium: 0.055,
      costOfDebt: 0.05,
      taxRate: 0.25,
      debtWeight: 0.3,
      equityWeight: 0.7,
    },
    rationale: 'Default WACC applied for typical company',
  };

  const userContent = `Company: ${companyInfo.ticker ?? 'Private'}\nIndustry: ${companyInfo.industry}\nCredit Rating: ${companyInfo.creditRating ?? 'Not rated'}\nD/E Ratio: ${companyInfo.debtToEquity ?? 'Unknown'}`;

  return callLLMWithFallback<WACCSuggestion>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 700,
    parse: (raw: string): WACCSuggestion => {
      const parsed = JSON.parse(raw);
      return {
        wacc: parsed.wacc ?? fallback.wacc,
        components: parsed.components ?? fallback.components,
        rationale: parsed.rationale ?? 'WACC calculated',
      };
    },
    fallback,
  });
}

// ============================================================================
// Terminal Growth Rate Agent
// ============================================================================

export interface TerminalGrowthSuggestion {
  terminalGrowthRate: number;
  rationale: string;
}

/**
 * Suggests terminal growth rate based on company and economy.
 */
export async function suggestTerminalGrowthAgentic(
  industry: string,
  currentGrowthRate: number
): Promise<TerminalGrowthSuggestion> {
  const systemPrompt = `You are a valuation specialist. Suggest an appropriate terminal growth rate for a DCF model.

Guidelines:
- Terminal growth should not exceed long-term GDP growth (2-3% nominal)
- High-growth companies should mean-revert to market rate
- Declining industries may warrant lower terminal growth
- Inflation is a key component (~2%)

Return JSON: { "terminalGrowthRate": 0.XX, "rationale": "..." }`;

  const fallback: TerminalGrowthSuggestion = {
    terminalGrowthRate: 0.02,
    rationale: 'Default terminal growth rate at long-term GDP expectation',
  };

  const userContent = `Industry: ${industry}\nCurrent Growth Rate: ${(currentGrowthRate * 100).toFixed(1)}%`;

  return callLLMWithFallback<TerminalGrowthSuggestion>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 400,
    parse: (raw: string): TerminalGrowthSuggestion => {
      const parsed = JSON.parse(raw);
      return {
        terminalGrowthRate: parsed.terminalGrowthRate ?? 0.02,
        rationale: parsed.rationale ?? 'Terminal growth suggested',
      };
    },
    fallback,
  });
}

// ============================================================================
// Valuation Summary Agent
// ============================================================================

export interface ValuationSummary {
  summary: string;
  keyDrivers: string[];
  risks: string[];
  recommendation: string;
}

/**
 * Generates executive summary of DCF valuation.
 */
export async function generateValuationSummaryAgentic(
  dcfResult: DCFResult
): Promise<ValuationSummary> {
  const systemPrompt = `You are an investment banking analyst. Generate an executive summary of a DCF valuation.

Include:
1. Headline valuation and implied share price
2. Key value drivers
3. Sensitivity considerations
4. Risks to the valuation

Return JSON: { "summary": "...", "keyDrivers": ["..."], "risks": ["..."], "recommendation": "..." }`;

  const fallback: ValuationSummary = {
    summary: 'Valuation summary pending review.',
    keyDrivers: [],
    risks: [],
    recommendation: '',
  };

  const userContent = JSON.stringify(dcfResult, null, 2);

  return callLLMWithFallback<ValuationSummary>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 800,
    parse: (raw: string): ValuationSummary => {
      const parsed = JSON.parse(raw);
      return {
        summary: parsed.summary ?? '',
        keyDrivers: parsed.keyDrivers ?? [],
        risks: parsed.risks ?? [],
        recommendation: parsed.recommendation ?? '',
      };
    },
    fallback,
  });
}

// ============================================================================
// Comparable Beta Selection Agent
// ============================================================================

export interface ComparableBeta {
  suggestedBeta: number;
  peers: Array<{ name: string; beta: number }>;
  rationale: string;
}

/**
 * Suggests beta based on comparable companies.
 */
export async function suggestBetaAgentic(
  industry: string,
  companySize: 'large' | 'mid' | 'small'
): Promise<ComparableBeta> {
  const systemPrompt = `You are a valuation specialist. Suggest an appropriate beta for a company based on industry and size.

Consider:
- Industry betas (Tech: 1.2-1.5, Healthcare: 1.0-1.3, Utilities: 0.5-0.8, Consumer: 0.8-1.1)
- Size premium adjustments
- Operating vs financial leverage

Return JSON: { "suggestedBeta": X.X, "peers": [{ "name": "...", "beta": X.X }], "rationale": "..." }`;

  const fallback: ComparableBeta = {
    suggestedBeta: 1.0,
    peers: [],
    rationale: 'Default market beta applied',
  };

  const userContent = `Industry: ${industry}\nSize: ${companySize}`;

  return callLLMWithFallback<ComparableBeta>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 600,
    parse: (raw: string): ComparableBeta => {
      const parsed = JSON.parse(raw);
      return {
        suggestedBeta: parsed.suggestedBeta ?? 1.0,
        peers: parsed.peers ?? [],
        rationale: parsed.rationale ?? 'Beta suggested',
      };
    },
    fallback,
  });
}
