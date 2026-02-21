/**
 * Agentic impairment testing: CGU identification, qualitative assessment, trigger detection, narrative.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { ImpairmentTestResult } from './impairment_testing_service.js';

// ============================================================================
// CGU Identification Agent
// ============================================================================

export interface SuggestedCGU {
  name: string;
  description: string;
  allocationBasis: 'revenue' | 'headcount' | 'assets';
  rationale: string;
}

/**
 * Suggests CGUs from business structure and segment information.
 */
export async function suggestCGUsAgentic(
  businessDescription: string,
  segments?: { name: string; revenue: number }[]
): Promise<{ suggestedCGUs: SuggestedCGU[]; rationale: string }> {
  const systemPrompt = `You are an impairment testing specialist. Given a business description, identify appropriate cash-generating units (CGUs) for impairment testing under IAS 36.

Guidelines:
- CGU is the smallest identifiable group of assets that generates cash inflows largely independent of other assets
- Often aligns with operating segments or one level below
- Consider geographical regions, product lines, or legal entities
- Suggest allocation basis for goodwill (revenue, headcount, or assets)

Return JSON: { "suggestedCGUs": [{ "name": "...", "description": "...", "allocationBasis": "revenue|headcount|assets", "rationale": "..." }], "rationale": "..." }`;

  const userContent = `Business Description:\n${businessDescription}\n\n${segments ? `Segments:\n${JSON.stringify(segments)}` : ''}`;

  const fallback = { suggestedCGUs: [] as SuggestedCGU[], rationale: 'Unable to identify CGUs from provided information' };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 1000,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        suggestedCGUs: parsed.suggestedCGUs ?? [],
        rationale: parsed.rationale ?? 'CGUs identified',
      };
    },
    fallback,
  });
}

// ============================================================================
// Qualitative Assessment Agent (Step 0)
// ============================================================================

export interface QualitativeAssessmentResult {
  moreLikelyThanNotImpaired: boolean;
  quantitativeTestRequired: boolean;
  factors: {
    positive: string[];
    negative: string[];
  };
  overallAssessment: string;
}

/**
 * Performs qualitative assessment (Step 0) to determine if quantitative test is needed.
 */
export async function performQualitativeAssessmentAgentic(
  cguName: string,
  marketConditions: string,
  performance: { revenue?: number; margin?: number; growthRate?: number }
): Promise<QualitativeAssessmentResult> {
  const systemPrompt = `You are an impairment testing specialist performing qualitative assessment under ASC 350/IAS 36.

Evaluate whether it is "more likely than not" (>50%) that the fair value is less than carrying amount.

Consider:
POSITIVE factors (fair value > carrying):
- Strong performance exceeding expectations
- Favorable market conditions
- Industry tailwinds
- Appreciation in value

NEGATIVE factors (impairment risk):
- Revenue decline
- Margin compression
- Market deterioration
- Regulatory changes
- Key customer loss
- Technological disruption

Return JSON: { "moreLikelyThanNotImpaired": true/false, "quantitativeTestRequired": true/false, "factors": { "positive": [...], "negative": [...] }, "overallAssessment": "..." }`;

  const userContent = `CGU: ${cguName}\nMarket Conditions: ${marketConditions}\nPerformance: ${JSON.stringify(performance)}`;

  const fallback: QualitativeAssessmentResult = {
    moreLikelyThanNotImpaired: false,
    quantitativeTestRequired: true,
    factors: { positive: [], negative: ['Insufficient information'] },
    overallAssessment: 'Unable to perform qualitative assessment; quantitative test recommended',
  };

  return callLLMWithFallback<QualitativeAssessmentResult>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 800,
    parse: (raw: string): QualitativeAssessmentResult => {
      const parsed = JSON.parse(raw);
      return {
        moreLikelyThanNotImpaired: parsed.moreLikelyThanNotImpaired ?? false,
        quantitativeTestRequired: parsed.quantitativeTestRequired ?? true,
        factors: parsed.factors ?? { positive: [], negative: [] },
        overallAssessment: parsed.overallAssessment ?? 'Assessment complete',
      };
    },
    fallback,
  });
}

// ============================================================================
// Trigger Detection Agent
// ============================================================================

export interface ImpairmentTrigger {
  triggerType: 'internal' | 'external';
  description: string;
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}

/**
 * Monitors for impairment indicators/triggers.
 */
export async function detectImpairmentTriggersAgentic(
  cguName: string,
  metrics: {
    currentRevenue: number;
    priorRevenue: number;
    currentMargin: number;
    priorMargin: number;
    industryGrowth?: number;
    marketCapChange?: number;
  }
): Promise<{ triggers: ImpairmentTrigger[]; actionRequired: boolean }> {
  const systemPrompt = `You are an impairment monitoring specialist. Analyze metrics to identify impairment triggers under IAS 36.

External triggers:
- Significant decline in market value
- Adverse changes in market, economy, technology
- Interest rate increases (affects discount rate)
- Market cap below net assets

Internal triggers:
- Evidence of obsolescence or physical damage
- Significant changes with adverse effect on entity
- Asset performance worse than expected
- Plans to restructure or discontinue

Return JSON: { "triggers": [{ "triggerType": "internal|external", "description": "...", "severity": "high|medium|low", "recommendation": "..." }], "actionRequired": true/false }`;

  const revenueDecline = ((metrics.currentRevenue - metrics.priorRevenue) / metrics.priorRevenue) * 100;
  const marginChange = metrics.currentMargin - metrics.priorMargin;
  
  const userContent = `CGU: ${cguName}\nRevenue change: ${revenueDecline.toFixed(1)}%\nMargin change: ${(marginChange * 100).toFixed(1)}pp\nIndustry growth: ${metrics.industryGrowth ?? 'N/A'}%\nMarket cap change: ${metrics.marketCapChange ?? 'N/A'}%`;

  const fallback = { triggers: [] as ImpairmentTrigger[], actionRequired: false };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 800,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        triggers: parsed.triggers ?? [],
        actionRequired: parsed.actionRequired ?? false,
      };
    },
    fallback,
  });
}

// ============================================================================
// Impairment Narrative/Footnote Agent
// ============================================================================

export interface ImpairmentFootnote {
  summary: string;
  methodologyDisclosure: string;
  keyAssumptions: string;
  sensitivityDisclosure: string;
}

/**
 * Generates impairment footnote disclosure.
 */
export async function generateImpairmentFootnoteAgentic(
  impairmentTest: ImpairmentTestResult
): Promise<ImpairmentFootnote> {
  const systemPrompt = `You are a financial reporting expert. Generate an impairment footnote disclosure following IAS 36 / ASC 350 requirements.

Include:
1. Summary of impairment test results
2. Methodology used (value in use vs fair value)
3. Key assumptions and rationale
4. Sensitivity disclosures

Use professional financial statement language. Return JSON: { "summary": "...", "methodologyDisclosure": "...", "keyAssumptions": "...", "sensitivityDisclosure": "..." }`;

  const userContent = JSON.stringify(impairmentTest, null, 2);

  const fallback: ImpairmentFootnote = {
    summary: 'Impairment footnote pending review.',
    methodologyDisclosure: '',
    keyAssumptions: '',
    sensitivityDisclosure: '',
  };

  return callLLMWithFallback<ImpairmentFootnote>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 1000,
    parse: (raw: string): ImpairmentFootnote => {
      const parsed = JSON.parse(raw);
      return {
        summary: parsed.summary ?? '',
        methodologyDisclosure: parsed.methodologyDisclosure ?? '',
        keyAssumptions: parsed.keyAssumptions ?? '',
        sensitivityDisclosure: parsed.sensitivityDisclosure ?? '',
      };
    },
    fallback,
  });
}

// ============================================================================
// Discount Rate Suggestion Agent
// ============================================================================

export interface DiscountRateSuggestion {
  suggestedRate: number;
  components: {
    riskFreeRate: number;
    equityRiskPremium: number;
    sizePremium: number;
    specificRisk: number;
  };
  rationale: string;
}

/**
 * Suggests appropriate discount rate for value in use calculation.
 */
export async function suggestDiscountRateAgentic(
  cguInfo: { name: string; industry: string; size: 'large' | 'mid' | 'small' }
): Promise<DiscountRateSuggestion> {
  const systemPrompt = `You are a valuation specialist. Suggest an appropriate discount rate for impairment testing (value in use).

Components:
- Risk-free rate: 10-year government bond yield (~4% in current environment)
- Equity risk premium: Market premium (~5-6%)
- Size premium: Small cap premium if applicable (1-4%)
- Specific risk premium: Industry/company-specific risks (1-5%)

Return JSON: { "suggestedRate": 0.XX, "components": { "riskFreeRate": 0.XX, "equityRiskPremium": 0.XX, "sizePremium": 0.XX, "specificRisk": 0.XX }, "rationale": "..." }`;

  const userContent = `CGU: ${cguInfo.name}, Industry: ${cguInfo.industry}, Size: ${cguInfo.size}`;

  const fallback: DiscountRateSuggestion = {
    suggestedRate: 0.12,
    components: { riskFreeRate: 0.04, equityRiskPremium: 0.05, sizePremium: 0.02, specificRisk: 0.01 },
    rationale: 'Default discount rate applied',
  };

  return callLLMWithFallback<DiscountRateSuggestion>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 600,
    parse: (raw: string): DiscountRateSuggestion => {
      const parsed = JSON.parse(raw);
      return {
        suggestedRate: parsed.suggestedRate ?? 0.12,
        components: parsed.components ?? fallback.components,
        rationale: parsed.rationale ?? 'Discount rate estimated',
      };
    },
    fallback,
  });
}
