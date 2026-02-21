import type { PortfolioSummary } from '@/lib/types/portfolio';

export const mockPortfolioSummary: PortfolioSummary = {
  totalEntities: 12,
  closedThisPeriod: 8,
  inProgress: 3,
  notStarted: 1,
  needsAttention: 2,
  avgCloseDays: 5.2,
  priorAvgCloseDays: 6.8,
  portfolioRevenue: '312450000.00',
  portfolioNetIncome: '42180000.00',
  portfolioMargin: '13.5',
  currentPeriod: 'January 2026',
};

export function getPortfolioSummary(_period?: string): PortfolioSummary {
  return mockPortfolioSummary;
}
