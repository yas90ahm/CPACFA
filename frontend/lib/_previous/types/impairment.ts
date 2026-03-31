export interface CashGeneratingUnit {
  id: string;
  cguName: string;
  description?: string;
  allocationBasis?: 'revenue' | 'headcount' | 'assets';
  segmentId?: string;
  createdAt: string;
}

export interface GoodwillAllocation {
  id: string;
  cguId: string;
  acquisitionDate?: string;
  goodwillAmount: string;
  allocationRationale?: string;
  createdAt: string;
}

export interface ImpairmentTest {
  id: string;
  periodLabel: string;
  testDate: string;
  cguId?: string;
  assetType: 'goodwill' | 'intangible' | 'ppe' | 'investment';
  assetDescription?: string;
  carryingAmount: string;
  recoverableAmount: string;
  impairmentLoss?: string;
  method: 'value_in_use' | 'fair_value_less_costs' | 'value_in_use_and_fair_value_less_costs';
  assumptions?: { discountRate?: number; growthRate?: number; cashFlows?: number[] };
  qualitativeAssessment?: string;
  quantitativeRequired?: boolean;
  createdAt: string;
}

export interface ImpairmentSummary {
  periodLabel?: string;
  totalImpairmentLoss: string;
  testCount: number;
  byCGU: { cguId: string; cguName: string; totalLoss: string; testCount: number }[];
}
