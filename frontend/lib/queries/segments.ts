'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';
import type { OperatingSegment, SegmentFinancials, SegmentReconciliation, ReportabilityResult } from '@/lib/types/segments';

const STALE_TIME = 30_000;

function toSegment(raw: Record<string, unknown>): OperatingSegment {
  return {
    id: raw.id as string,
    segmentName: (raw.segmentName ?? '') as string,
    description: raw.description as string | undefined,
    codmReportBasis: raw.codmReportBasis as string | undefined,
    aggregationCriteria: raw.aggregationCriteria as string | undefined,
    isReportable: (raw.isReportable as boolean) ?? true,
    createdAt: raw.createdAt as string,
  };
}

function toSegmentFinancials(raw: Record<string, unknown>): SegmentFinancials {
  return {
    id: raw.id as string,
    segmentId: raw.segmentId as string,
    periodLabel: raw.periodLabel as string,
    revenue: raw.revenue != null ? toMoneyString(raw.revenue) : undefined,
    intersegmentRevenue: raw.intersegmentRevenue != null ? toMoneyString(raw.intersegmentRevenue) : undefined,
    externalRevenue: raw.externalRevenue != null ? toMoneyString(raw.externalRevenue) : undefined,
    profitLoss: raw.profitLoss != null ? toMoneyString(raw.profitLoss) : undefined,
    assets: raw.assets != null ? toMoneyString(raw.assets) : undefined,
    liabilities: raw.liabilities != null ? toMoneyString(raw.liabilities) : undefined,
    capitalExpenditures: raw.capitalExpenditures != null ? toMoneyString(raw.capitalExpenditures) : undefined,
    depreciation: raw.depreciation != null ? toMoneyString(raw.depreciation) : undefined,
    createdAt: raw.createdAt as string,
  };
}

export function useSegments(sessionId: string | null) {
  return useQuery({
    queryKey: ['segments', sessionId],
    queryFn: async (): Promise<OperatingSegment[]> => {
      if (!sessionId) return [];
      const res = await apiFetch<{ segments: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/segments`
      );
      return (res.segments ?? []).map(toSegment);
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useCreateSegment(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/sessions/${sessionId}/segments`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segments', sessionId] });
    },
  });
}

export function useSegmentFinancials(sessionId: string | null, segmentId?: string) {
  return useQuery({
    queryKey: ['segment-financials', sessionId, segmentId],
    queryFn: async (): Promise<SegmentFinancials[]> => {
      if (!sessionId) return [];
      const params = segmentId ? { segmentId } : undefined;
      const res = await apiFetch<{ financials: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/segments/financials`,
        { params }
      );
      return (res.financials ?? []).map(toSegmentFinancials);
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useSegmentReconciliations(sessionId: string | null) {
  return useQuery({
    queryKey: ['segment-reconciliations', sessionId],
    queryFn: async (): Promise<SegmentReconciliation[]> => {
      if (!sessionId) return [];
      const res = await apiFetch<{ reconciliations: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/segments/reconciliation`
      );
      return (res.reconciliations ?? []).map((r) => ({
        id: r.id as string,
        periodLabel: r.periodLabel as string,
        itemType: r.itemType as SegmentReconciliation['itemType'],
        segmentTotal: toMoneyString(r.segmentTotal),
        consolidatedTotal: toMoneyString(r.consolidatedTotal),
        reconcilingItems: ((r.reconcilingItems as Record<string, unknown>[]) ?? []).map((i) => ({
          description: i.description as string,
          amount: toMoneyString(i.amount),
        })),
        createdAt: r.createdAt as string,
      }));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useReportabilityCheck(sessionId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ result: ReportabilityResult }>(
        `/api/close/sessions/${sessionId}/segments/reportability-check`,
        { method: 'POST', body: {} }
      ),
  });
}
