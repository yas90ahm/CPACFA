export type DepreciationMethod = 'straight_line' | 'declining_balance' | 'units_of_production';

export interface FixedAsset {
  id: string;
  assetNumber: string;
  description: string;
  assetType: string;
  cost: string;
  residualValue: string;
  usefulLifeYears: number;
  method: DepreciationMethod;
  depreciationStartDate: string;
  status: 'active' | 'disposed' | 'fully_depreciated';
  disposalDate?: string;
  disposalProceeds?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepreciationRun {
  id: string;
  periodLabel: string;
  totalDepreciation: string;
  createdAt: string;
}

export interface DepreciationRunDetail {
  id: string;
  runId: string;
  fixedAssetId: string;
  periodStart: string;
  periodEnd: string;
  depreciationAmount: string;
  accumulatedDepreciation: string;
  createdAt: string;
}

export interface DepreciationSummary {
  periodLabel: string;
  totalDepreciation: string;
  byAsset: { fixedAssetId: string; assetNumber: string; assetType: string; depreciationAmount: string }[];
  byType: Record<string, string>;
}
