'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';
import type { CashGeneratingUnit, GoodwillAllocation, ImpairmentTest, ImpairmentSummary } from '@/lib/types/impairment';

const STALE_TIME = 30_000;

function toCGU(raw: Record<string, unknown>): CashGeneratingUnit {
  return {
    id: raw.id as string,
    cguName: (raw.cguName ?? '') as string,
    description: raw.description as string | undefined,
    allocationBasis: raw.allocationBasis as CashGeneratingUnit['allocationBasis'],
    segmentId: raw.segmentId as string | undefined,
    createdAt: raw.createdAt as string,
  };
}

function toImpairmentTest(raw: Record<string, unknown>): ImpairmentTest {
  return {
    id: raw.id as string,
    periodLabel: (raw.periodLabel ?? '') as string,
    testDate: (raw.testDate ?? '') as string,
    cguId: raw.cguId as string | undefined,
    assetType: (raw.assetType ?? 'goodwill') as ImpairmentTest['assetType'],
    assetDescription: raw.assetDescription as string | undefined,
    carryingAmount: toMoneyString(raw.carryingAmount),
    recoverableAmount: toMoneyString(raw.recoverableAmount),
    impairmentLoss: raw.impairmentLoss != null ? toMoneyString(raw.impairmentLoss) : undefined,
    method: (raw.method ?? 'value_in_use') as ImpairmentTest['method'],
    assumptions: raw.assumptions as ImpairmentTest['assumptions'],
    qualitativeAssessment: raw.qualitativeAssessment as string | undefined,
    quantitativeRequired: raw.quantitativeRequired as boolean | undefined,
    createdAt: raw.createdAt as string,
  };
}

export function useCGUs(sessionId: string | null) {
  return useQuery({
    queryKey: ['cgus', sessionId],
    queryFn: async (): Promise<CashGeneratingUnit[]> => {
      if (!sessionId) return [];
      const res = await apiFetch<{ cgus: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/impairment/cgus`
      );
      return (res.cgus ?? []).map(toCGU);
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useCreateCGU(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/sessions/${sessionId}/impairment/cgus`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cgus', sessionId] });
    },
  });
}

export function useGoodwillAllocations(sessionId: string | null, cguId?: string) {
  return useQuery({
    queryKey: ['goodwill-allocations', sessionId, cguId],
    queryFn: async (): Promise<GoodwillAllocation[]> => {
      if (!sessionId) return [];
      const params = cguId ? { cguId } : undefined;
      const res = await apiFetch<{ allocations: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/impairment/goodwill-allocations`,
        { params }
      );
      return (res.allocations ?? []).map((a) => ({
        id: a.id as string,
        cguId: a.cguId as string,
        acquisitionDate: a.acquisitionDate as string | undefined,
        goodwillAmount: toMoneyString(a.goodwillAmount),
        allocationRationale: a.allocationRationale as string | undefined,
        createdAt: a.createdAt as string,
      }));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useImpairmentTests(sessionId: string | null) {
  return useQuery({
    queryKey: ['impairment-tests', sessionId],
    queryFn: async (): Promise<ImpairmentTest[]> => {
      if (!sessionId) return [];
      const res = await apiFetch<{ tests: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/impairment/tests`
      );
      return (res.tests ?? []).map(toImpairmentTest);
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useEvaluateImpairment(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (testId: string) =>
      apiFetch(`/api/close/sessions/${sessionId}/impairment/evaluate/${testId}`, { method: 'POST', body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['impairment-tests', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['impairment-summary', sessionId] });
    },
  });
}

export function useImpairmentSummary(sessionId: string | null) {
  return useQuery({
    queryKey: ['impairment-summary', sessionId],
    queryFn: async (): Promise<ImpairmentSummary | null> => {
      if (!sessionId) return null;
      const res = await apiFetch<{ summary: Record<string, unknown> }>(
        `/api/close/sessions/${sessionId}/impairment/summary`
      );
      const s = res.summary;
      return {
        periodLabel: s.periodLabel as string | undefined,
        totalImpairmentLoss: toMoneyString(s.totalImpairmentLoss),
        testCount: Number(s.testCount ?? 0),
        byCGU: ((s.byCGU as Record<string, unknown>[]) ?? []).map((c) => ({
          cguId: c.cguId as string,
          cguName: c.cguName as string,
          totalLoss: toMoneyString(c.totalLoss),
          testCount: Number(c.testCount ?? 0),
        })),
      };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
