'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 60_000;

// ── Types ──

export interface PortfolioAlert {
  id: string;
  entityId: string;
  entityName: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  category?: string;
  createdAt?: string;
}

export interface PortfolioMetrics {
  portfolioEbitda: string;
  totalRevenue: string;
  avgCloseDays: number;
  entitiesCertified: number;
  entitiesTotal: number;
}

// ── Hooks ──

export function usePortfolioAlerts() {
  return useQuery({
    queryKey: ['portfolio-alerts'],
    queryFn: async (): Promise<PortfolioAlert[]> => {
      try {
        const res = await apiFetch<{ alerts: PortfolioAlert[] }>('/api/portfolio/alerts');
        return res.alerts ?? [];
      } catch {
        // Graceful degradation if endpoint not yet implemented
        return [];
      }
    },
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function usePortfolioMetrics() {
  return useQuery({
    queryKey: ['portfolio-metrics'],
    queryFn: async (): Promise<PortfolioMetrics> => {
      try {
        const res = await apiFetch<Record<string, unknown>>('/api/portfolio/metrics');
        return {
          portfolioEbitda: String(res.portfolioEbitda ?? res.ebitda ?? '0'),
          totalRevenue: String(res.totalRevenue ?? res.revenue ?? '0'),
          avgCloseDays: (res.avgCloseDays ?? 0) as number,
          entitiesCertified: (res.entitiesCertified ?? res.certified ?? 0) as number,
          entitiesTotal: (res.entitiesTotal ?? res.total ?? 0) as number,
        };
      } catch {
        // Graceful degradation
        return {
          portfolioEbitda: '0',
          totalRevenue: '0',
          avgCloseDays: 0,
          entitiesCertified: 0,
          entitiesTotal: 0,
        };
      }
    },
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}
