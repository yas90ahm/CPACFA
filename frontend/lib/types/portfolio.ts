import type { CloseState } from '@/lib/types/close-session';

export interface PortfolioFinancials {
  revenue: string | null;
  netIncome: string | null;
  grossProfit: string | null;
  operatingIncome: string | null;
  ebitda: string | null;
  totalAssets: string | null;
  totalLiabilities: string | null;
  totalEquity: string | null;
  cashPosition: string | null;
  grossMarginPercent: string | null;
  operatingMarginPercent: string | null;
  marginPercent: string | null;
}

export interface PortfolioCompany {
  id: string;
  name: string;
  sector: string;
  revenue: string | null;
  netIncome: string | null;
  currentPeriod: string;
  currentState: CloseState;
  currentSessionId: string;
  daysInClose: number | null;
  targetCloseDays: number;
  gatesPassing: number;
  gatesTotal: number;
  blockingIssues: number;
  preparer: string | null;
  reviewer: string | null;
  lastActivity: string | null;
  closeDurationHistory: (number | null)[];
  needsAttention: boolean;
  attentionReason: string | null;
  marginPercent: string | null;
  marginVsPriorPp: string | null;
  financials: PortfolioFinancials | null;
  /** 'certified' | 'locked' | 'draft' | null */
  dataSource: string | null;
}

export interface PortfolioSummary {
  totalEntities: number;
  closedThisPeriod: number;
  inProgress: number;
  notStarted: number;
  needsAttention: number;
  avgCloseDays: number;
  priorAvgCloseDays: number;
  portfolioRevenue: string;
  portfolioNetIncome: string;
  portfolioMargin: string;
  currentPeriod: string;
  certifiedCount: number;
  totalWithData: number;
}
