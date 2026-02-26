'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { PortfolioCompany } from '@/lib/types/portfolio';
import type { PortfolioSummary } from '@/lib/types/portfolio';
import { toCloseState } from '@/lib/adapters';

const STALE_TIME = 60_000;

function toPortfolioCompany(r: Record<string, unknown>): PortfolioCompany {
  return {
    id: (r.id ?? r.tenantId) as string,
    name: (r.name ?? r.entityName) as string,
    sector: (r.sector ?? '') as string,
    revenue: r.revenue != null ? String(r.revenue) : null,
    netIncome: r.netIncome != null ? String(r.netIncome) : null,
    currentPeriod: (r.currentPeriod ?? r.periodLabel ?? '') as string,
    currentState: toCloseState(String(r.currentState ?? r.status ?? 'open')) as PortfolioCompany['currentState'],
    currentSessionId: (r.currentSessionId ?? r.id ?? '') as string,
    daysInClose: (r.daysInClose as number) ?? null,
    targetCloseDays: (r.targetCloseDays ?? r.avgCloseDuration ?? 5) as number,
    gatesPassing: (r.gatesPassing ?? 0) as number,
    gatesTotal: (r.gatesTotal ?? 0) as number,
    blockingIssues: (r.blockingIssues ?? 0) as number,
    preparer: r.preparer as string | null,
    reviewer: r.reviewer as string | null,
    lastActivity: r.lastActivity as string | null,
    closeDurationHistory: (r.closeDurationHistory ?? r.history ?? []) as (number | null)[],
    needsAttention: (r.needsAttention ?? (Number(r.blockingIssues) > 0)) as boolean,
    attentionReason: r.attentionReason as string | null,
    marginPercent: r.marginPercent != null ? String(r.marginPercent) : null,
    marginVsPriorPp: r.marginVsPriorPp != null ? String(r.marginVsPriorPp) : null,
  };
}

export function usePortfolioEntities() {
  return useQuery({
    queryKey: ['portfolio-entities'],
    queryFn: async (): Promise<PortfolioCompany[]> => {
      const res = await apiFetch<{ entities: unknown[] }>('/api/portfolio/entities');
      const list = res.entities ?? [];
      return list.map((e) => toPortfolioCompany(e as Record<string, unknown>));
    },
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function usePortfolioSummary() {
  return useQuery({
    queryKey: ['portfolio-summary'],
    queryFn: async (): Promise<PortfolioSummary> => {
      const raw = await apiFetch<Record<string, unknown>>('/api/portfolio/summary');
      return {
        totalEntities: (raw.totalEntities ?? 0) as number,
        closedThisPeriod: (raw.closedThisPeriod ?? 0) as number,
        inProgress: (raw.inProgress ?? 0) as number,
        notStarted: (raw.notStarted ?? 0) as number,
        needsAttention: (raw.needsAttention ?? raw.overdue ?? 0) as number,
        avgCloseDays: (raw.avgCloseDays ?? 0) as number,
        priorAvgCloseDays: (raw.priorAvgCloseDays ?? 0) as number,
        portfolioRevenue: String(raw.portfolioRevenue ?? raw.revenue ?? '0'),
        portfolioNetIncome: String(raw.portfolioNetIncome ?? raw.netIncome ?? '0'),
        portfolioMargin: String(raw.portfolioMargin ?? raw.margin ?? '0'),
        currentPeriod: (raw.currentPeriod ?? '') as string,
      };
    },
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export const usePortfolioCompanies = usePortfolioEntities;

export function useEntityHistory(entityId: string | null, periods?: number) {
  return useQuery({
    queryKey: ['entity-history', entityId, periods],
    queryFn: async () => {
      if (!entityId) throw new Error('No entityId');
      return apiFetch<{ entityId: string; history: unknown[] }>(
        `/api/portfolio/entities/${entityId}/history`,
        { params: periods != null ? { periods: String(periods) } : {} }
      );
    },
    enabled: !!entityId,
    staleTime: STALE_TIME,
  });
}
