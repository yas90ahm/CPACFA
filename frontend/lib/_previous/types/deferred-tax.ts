export interface DeferredTaxItem {
  id: string;
  periodLabel: string;
  description: string;
  itemType: 'temporary_difference' | 'nol_carryforward' | 'tax_credit';
  bookBasis: string;
  taxBasis: string;
  reversalPattern?: '1_year' | '2_5_years' | 'indefinite';
  sourceAccount?: string;
  deferredTaxAsset?: string;
  deferredTaxLiability?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeferredTaxResult {
  periodLabel: string;
  temporaryDifferences: {
    description: string;
    bookBasis: number;
    taxBasis: number;
    temporaryDifference: number;
    reversalPattern: string;
    sourceAccount?: string;
  }[];
  deferredTaxAssetGross: string;
  deferredTaxLiabilityGross: string;
  valuationAllowance: string;
  deferredTaxAssetNet: string;
  deferredTaxLiabilityNet: string;
  netDeferredTaxAsset: string;
}

export interface ValuationAllowanceAssessment {
  valuationAllowance: string;
  assessment: 'fully_realizable' | 'partial_allowance' | 'full_allowance';
  rationale: string;
  factors: { positive: string[]; negative: string[] };
}

export interface RateChangeImpact {
  oldDeferredTax: string;
  newDeferredTax: string;
  impactAmount: string;
  impactDirection: 'benefit' | 'expense';
}
