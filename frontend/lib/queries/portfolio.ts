import { useQuery } from '@tanstack/react-query';
import type { PortfolioCompany } from '@/lib/types/portfolio';
import type { PortfolioSummary } from '@/lib/types/portfolio';
import { getPortfolioCompanies } from '@/lib/mock/portfolio';
import { getPortfolioSummary } from '@/lib/mock/portfolio-summary';

const STALE_TIME = 60_000;

export function usePortfolioCompanies(period?: string) {
  return useQuery({
    queryKey: ['portfolio-companies', period],
    queryFn: async (): Promise<PortfolioCompany[]> => getPortfolioCompanies(period),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function usePortfolioSummary(period?: string) {
  return useQuery({
    queryKey: ['portfolio-summary', period],
    queryFn: async (): Promise<PortfolioSummary> => getPortfolioSummary(period),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}
