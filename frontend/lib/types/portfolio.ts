import type { CloseState } from '@/lib/types/close-session';

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
}
