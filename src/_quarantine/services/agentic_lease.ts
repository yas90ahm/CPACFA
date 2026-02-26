/**
 * Agentic lease: classification suggestion, discount rate suggestion, footnote generation (ASC 842 / IFRS 16).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';

export interface LeaseClassificationSuggestion {
  classification: 'operating' | 'finance';
  rationale: string;
  confidence: number;
}

/**
 * Suggests operating vs finance classification from lease terms (ASC 842 / IFRS 16).
 */
export async function suggestLeaseClassificationAgentic(params: {
  termMonths: number;
  pvOfPayments: number;
  fairValueOfAsset?: number;
  standard: 'asc842' | 'ifrs16';
}): Promise<LeaseClassificationSuggestion> {
  const systemPrompt = `You are a lease accounting specialist (ASC 842 / IFRS 16).

ASC 842: A lessee classifies a lease as finance if (1) ownership transfers, (2) purchase option reasonably certain, (3) term is major part of economic life (e.g. 75%+), or (4) PV of lease payments equals or exceeds substantially all of fair value (e.g. 90%+). Otherwise operating.

IFRS 16: Single lessee model; most leases are finance (on balance sheet). No operating/finance distinction for lessees.

Return JSON: { "classification": "operating" | "finance", "rationale": "...", "confidence": 0.X }`;

  const userContent = `Term (months): ${params.termMonths}\nPV of payments: ${params.pvOfPayments}\n${params.fairValueOfAsset != null ? `Fair value of asset: ${params.fairValueOfAsset}` : ''}\nStandard: ${params.standard}`;

  const fallback: LeaseClassificationSuggestion = {
    classification: params.standard === 'ifrs16' ? 'finance' : 'operating',
    rationale: 'Default classification; review manually.',
    confidence: 0.5,
  };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 400,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        classification: parsed.classification === 'finance' ? 'finance' : 'operating',
        rationale: parsed.rationale ?? fallback.rationale,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    },
    fallback,
  });
}

export interface DiscountRateSuggestion {
  suggestedRate: number;
  rationale: string;
  source: string;
}

/**
 * Suggests incremental borrowing rate for lease (or lessor implicit rate if known).
 */
export async function suggestDiscountRateAgentic(params: {
  leaseType?: string;
  tenantContext?: string;
  currency?: string;
}): Promise<DiscountRateSuggestion> {
  const systemPrompt = `You are a lease accounting specialist. Suggest an incremental borrowing rate (IBR) for a lessee to discount lease payments (ASC 842 / IFRS 16).

Consider: risk-free rate, entity credit, lease term, currency. Return a decimal (e.g. 0.05 for 5%).

Return JSON: { "suggestedRate": 0.XX, "rationale": "...", "source": "..." }`;

  const userContent = `Lease type: ${params.leaseType ?? 'general'}\nTenant context: ${params.tenantContext ?? 'not provided'}\nCurrency: ${params.currency ?? 'USD'}`;

  const fallback: DiscountRateSuggestion = {
    suggestedRate: 0.05,
    rationale: 'Default IBR; obtain entity-specific rate in practice.',
    source: 'fallback',
  };

  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 300,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      const rate = typeof parsed.suggestedRate === 'number' ? parsed.suggestedRate : 0.05;
      return {
        suggestedRate: Math.min(1, Math.max(0, rate)),
        rationale: parsed.rationale ?? fallback.rationale,
        source: parsed.source ?? 'llm',
      };
    },
    fallback,
  });
}

export interface LeaseFootnoteResult {
  footnote: string;
  summary: string;
}

/**
 * Generates lease footnote narrative for disclosure.
 */
export async function generateLeaseFootnoteAgentic(summary: {
  totalRouAsset: number;
  totalLeaseLiability: number;
  leaseCount: number;
  standard: string;
  periodLabel?: string;
}): Promise<LeaseFootnoteResult> {
  const systemPrompt = `You are a financial reporting specialist. Generate a concise footnote disclosure for leases (ASC 842 / IFRS 16).

Include: right-of-use assets and lease liabilities, lease term, discount rate (if material), and future minimum lease payments by period (optional). Use plain language suitable for notes to financial statements. Return JSON: { "footnote": "...", "summary": "1-2 sentence summary" }`;

  const userContent = `ROU asset: ${summary.totalRouAsset}\nLease liability: ${summary.totalLeaseLiability}\nNumber of leases: ${summary.leaseCount}\nStandard: ${summary.standard}\nPeriod: ${summary.periodLabel ?? 'current'}`;

  const fallback: LeaseFootnoteResult = {
    footnote: `The Company has right-of-use assets of $${summary.totalRouAsset.toLocaleString()} and lease liabilities of $${summary.totalLeaseLiability.toLocaleString()} as of the reporting date, representing ${summary.leaseCount} lease(s) under ${summary.standard.toUpperCase()}.`,
    summary: `Lease position: ROU $${summary.totalRouAsset.toLocaleString()}, liability $${summary.totalLeaseLiability.toLocaleString()}.`,
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
