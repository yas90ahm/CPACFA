/**
 * Agentic deferred tax: temp difference scanner, valuation allowance assessment, tax footnote generation.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { round2 } from '../utils/decimal.js';
import type { TemporaryDifference, DeferredTaxResult } from './deferred_tax_service.js';

// ============================================================================
// Temporary Difference Scanner Agent
// ============================================================================

export interface ScannedDifference {
  description: string;
  bookBasis: number;
  taxBasis: number;
  temporaryDifference: number;
  sourceAccount: string;
  confidence: number;
  rationale: string;
}

/**
 * Scans trial balance and tax return to identify temporary differences.
 */
export async function scanTemporaryDifferencesAgentic(
  trialBalance: { account: string; balance: number }[],
  taxReturnData?: string
): Promise<{ suggestedDifferences: ScannedDifference[]; confidence: number }> {
  const systemPrompt = `You are a tax specialist. Given a trial balance (book basis), identify likely temporary differences for deferred tax.

Common temporary differences:
- Depreciation (accelerated tax vs straight-line book)
- Bad debt reserves (book accrual vs tax deduction when written off)
- Accrued expenses (accrued for book, deductible when paid for tax)
- Prepaid expenses (opposite treatment)
- Inventory reserves (book accrual, tax when disposed)
- Revenue recognition timing differences

Return JSON: { "suggestedDifferences": [{ "description": "...", "bookBasis": X, "taxBasis": X, "temporaryDifference": X, "sourceAccount": "...", "confidence": 0.X, "rationale": "..." }], "confidence": 0.X }`;

  const userContent = `Trial Balance:\n${JSON.stringify(trialBalance.slice(0, 50), null, 2)}\n\n${taxReturnData ? `Tax Return Info:\n${taxReturnData.slice(0, 2000)}` : ''}`;

  const fallback = { suggestedDifferences: [] as ScannedDifference[], confidence: 0 };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 1500,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        suggestedDifferences: parsed.suggestedDifferences ?? [],
        confidence: parsed.confidence ?? 0,
      };
    },
    fallback,
  });
}

// ============================================================================
// Valuation Allowance Assessment Agent
// ============================================================================

export interface ValuationAllowanceRecommendation {
  recommendedAllowance: number;
  assessment: 'fully_realizable' | 'partial_allowance' | 'full_allowance';
  factors: {
    positive: string[];
    negative: string[];
  };
  rationale: string;
}

/**
 * Assesses valuation allowance need based on "more likely than not" criterion.
 */
export async function assessValuationAllowanceAgentic(
  deferredTaxAsset: number,
  projections: { year: number; income: number }[],
  historicalProfitability?: string
): Promise<ValuationAllowanceRecommendation> {
  const systemPrompt = `You are a tax specialist assessing valuation allowance for deferred tax assets under ASC 740.

Apply the "more likely than not" standard (>50% probability of realization).

Consider:
POSITIVE evidence (supports realization):
- Strong historical profitability
- Existing contracts or backlog
- Appreciating assets
- Future taxable income projections

NEGATIVE evidence (requires allowance):
- Cumulative losses in recent years
- History of carryforward expirations
- Unsettled circumstances

Return JSON: { "recommendedAllowance": X, "assessment": "fully_realizable|partial_allowance|full_allowance", "factors": { "positive": [...], "negative": [...] }, "rationale": "..." }`;

  const userContent = `DTA Gross: $${deferredTaxAsset.toLocaleString()}\n\nProjected Taxable Income:\n${JSON.stringify(projections)}\n\n${historicalProfitability ?? ''}`;

  const fallback: ValuationAllowanceRecommendation = {
    recommendedAllowance: 0,
    assessment: 'fully_realizable',
    factors: { positive: [], negative: [] },
    rationale: 'Unable to assess; defaulting to no allowance',
  };

  return callLLMWithFallback<ValuationAllowanceRecommendation>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 800,
    parse: (raw: string): ValuationAllowanceRecommendation => {
      const parsed = JSON.parse(raw);
      return {
        recommendedAllowance: parsed.recommendedAllowance ?? 0,
        assessment: parsed.assessment ?? 'fully_realizable',
        factors: parsed.factors ?? { positive: [], negative: [] },
        rationale: parsed.rationale ?? 'Assessment complete',
      };
    },
    fallback,
  });
}

// ============================================================================
// Tax Rate Change Impact Agent
// ============================================================================

export interface RateChangeAnalysis {
  impactOnDTA: number;
  impactOnDTL: number;
  netImpact: number;
  accountingEntry: string;
  rationale: string;
}

/**
 * Analyzes impact of enacted tax rate change on deferred taxes.
 */
export async function analyzeRateChangeAgentic(
  currentDTA: number,
  currentDTL: number,
  oldRate: number,
  newRate: number
): Promise<RateChangeAnalysis> {
  const systemPrompt = `You are a tax specialist. Analyze the impact of a statutory tax rate change on deferred tax balances.

Key principles:
- Deferred taxes are remeasured at the newly enacted rate
- Impact is recognized in income from continuing operations in the period of enactment
- Rate decreases reduce DTA (bad) and reduce DTL (good)
- Rate increases are the opposite

Return JSON: { "impactOnDTA": X, "impactOnDTL": X, "netImpact": X, "accountingEntry": "...", "rationale": "..." }`;

  const rateRatio = newRate / oldRate;
  const newDTA = currentDTA * rateRatio;
  const newDTL = currentDTL * rateRatio;
  const impactOnDTA = newDTA - currentDTA;
  const impactOnDTL = newDTL - currentDTL;

  const fallback: RateChangeAnalysis = {
    impactOnDTA: round2(impactOnDTA),
    impactOnDTL: round2(impactOnDTL),
    netImpact: round2(impactOnDTA - impactOnDTL),
    accountingEntry: impactOnDTA - impactOnDTL > 0 ? 'Dr. DTA, Cr. Tax Benefit' : 'Dr. Tax Expense, Cr. DTA',
    rationale: 'Rate change impact calculated',
  };

  const userContent = `Current DTA: $${currentDTA.toLocaleString()}, Current DTL: $${currentDTL.toLocaleString()}\nOld Rate: ${(oldRate * 100).toFixed(1)}%, New Rate: ${(newRate * 100).toFixed(1)}%`;

  return callLLMWithFallback<RateChangeAnalysis>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 600,
    parse: (raw: string): RateChangeAnalysis => {
      const parsed = JSON.parse(raw);
      return {
        impactOnDTA: parsed.impactOnDTA ?? fallback.impactOnDTA,
        impactOnDTL: parsed.impactOnDTL ?? fallback.impactOnDTL,
        netImpact: parsed.netImpact ?? fallback.netImpact,
        accountingEntry: parsed.accountingEntry ?? fallback.accountingEntry,
        rationale: parsed.rationale ?? 'Rate change analyzed',
      };
    },
    fallback,
  });
}

// ============================================================================
// Tax Footnote Generation Agent
// ============================================================================

export interface TaxFootnote {
  summary: string;
  rateReconciliation: string;
  deferredTaxTable: string;
  valuationAllowanceDisclosure: string;
}

/**
 * Generates income tax footnote disclosure.
 */
export async function generateTaxFootnoteAgentic(
  deferredTaxResult: DeferredTaxResult,
  effectiveTaxRate: number,
  statutoryRate: number
): Promise<TaxFootnote> {
  const systemPrompt = `You are a financial reporting expert. Generate an income tax footnote disclosure following ASC 740 / IAS 12 requirements.

Include:
1. Summary of income tax expense/benefit
2. Statutory to effective rate reconciliation
3. Deferred tax asset/liability components table
4. Valuation allowance disclosure (if applicable)

Use professional financial statement language. Return JSON: { "summary": "...", "rateReconciliation": "...", "deferredTaxTable": "...", "valuationAllowanceDisclosure": "..." }`;

  const userContent = `Deferred Tax Position:\n${JSON.stringify(deferredTaxResult, null, 2)}\n\nEffective Tax Rate: ${(effectiveTaxRate * 100).toFixed(1)}%\nStatutory Rate: ${(statutoryRate * 100).toFixed(1)}%`;

  const fallback: TaxFootnote = {
    summary: 'Income tax disclosure pending review.',
    rateReconciliation: '',
    deferredTaxTable: '',
    valuationAllowanceDisclosure: '',
  };

  return callLLMWithFallback<TaxFootnote>({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 1200,
    parse: (raw: string): TaxFootnote => {
      const parsed = JSON.parse(raw);
      return {
        summary: parsed.summary ?? '',
        rateReconciliation: parsed.rateReconciliation ?? '',
        deferredTaxTable: parsed.deferredTaxTable ?? '',
        valuationAllowanceDisclosure: parsed.valuationAllowanceDisclosure ?? '',
      };
    },
    fallback,
  });
}
