/**
 * Tax strategy & compliance: jurisdiction list, key rates, proactive suggestions.
 */

export interface TaxJurisdiction {
  code: string;
  name: string;
  /** Corporate rate (e.g. 0.21 for US federal) */
  corporateRate?: number;
  /** VAT/GST rate if applicable */
  vatRate?: number;
  notes?: string;
}

/** Static list of common jurisdictions (extend via config/DB in production) */
const COMMON_JURISDICTIONS: TaxJurisdiction[] = [
  { code: 'US-FED', name: 'United States (Federal)', corporateRate: 0.21, notes: 'Federal corporate income tax' },
  { code: 'CA', name: 'Canada', corporateRate: 0.15, vatRate: 0.05, notes: 'Federal + provincial varies' },
  { code: 'UK', name: 'United Kingdom', corporateRate: 0.25, vatRate: 0.20 },
  { code: 'DE', name: 'Germany', corporateRate: 0.30, vatRate: 0.19 },
  { code: 'FR', name: 'France', corporateRate: 0.25, vatRate: 0.20 },
];

export interface TaxStrategyInput {
  revenue: number;
  taxableIncome?: number;
  jurisdictions?: string[]; // e.g. ['US-FED', 'CA']
}

export interface TaxStrategyResult {
  jurisdictions: TaxJurisdiction[];
  suggestions: string[];
  estimatedCombinedRate?: number;
}

/**
 * Return jurisdictions and proactive tax suggestions based on revenue/income.
 */
export function getTaxStrategy(input: TaxStrategyInput): TaxStrategyResult {
  const jurisdictions = input.jurisdictions?.length
    ? COMMON_JURISDICTIONS.filter((j) => input.jurisdictions!.includes(j.code))
    : COMMON_JURISDICTIONS;
  const suggestions: string[] = [];
  if (input.revenue > 0) {
    suggestions.push('Consider entity structure (e.g. pass-through vs C-corp) for your revenue level.');
    suggestions.push('Review R&D credits and Section 179 if you have qualifying assets or R&D spend.');
  }
  if (input.taxableIncome != null && input.taxableIncome > 0) {
    const avgRate = jurisdictions.reduce((s, j) => s + (j.corporateRate ?? 0), 0) / Math.max(1, jurisdictions.length);
    suggestions.push(`Estimated blended corporate rate range: ${(avgRate * 100).toFixed(0)}% (jurisdiction-dependent).`);
  }
  const estimatedCombinedRate =
    jurisdictions.length > 0
      ? jurisdictions.reduce((s, j) => s + (j.corporateRate ?? 0), 0) / jurisdictions.length
      : undefined;
  return {
    jurisdictions,
    suggestions,
    estimatedCombinedRate,
  };
}
