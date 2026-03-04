export interface OperatingSegment {
  id: string;
  segmentName: string;
  description?: string;
  codmReportBasis?: string;
  aggregationCriteria?: string;
  isReportable: boolean;
  createdAt: string;
}

export interface SegmentFinancials {
  id: string;
  segmentId: string;
  periodLabel: string;
  revenue?: string;
  intersegmentRevenue?: string;
  externalRevenue?: string;
  profitLoss?: string;
  assets?: string;
  liabilities?: string;
  capitalExpenditures?: string;
  depreciation?: string;
  createdAt: string;
}

export interface SegmentReconciliation {
  id: string;
  periodLabel: string;
  itemType: 'revenue' | 'profit' | 'assets';
  segmentTotal: string;
  consolidatedTotal: string;
  reconcilingItems: { description: string; amount: string }[];
  createdAt: string;
}

export interface ReportabilityResult {
  segments: {
    segmentId: string;
    segmentName: string;
    revenuePercent: number;
    profitLossPercent: number;
    assetsPercent: number;
    isReportable: boolean;
    thresholdsMet: string[];
  }[];
  aggregateRevenuePercent: number;
  aggregateTestPassed: boolean;
}
