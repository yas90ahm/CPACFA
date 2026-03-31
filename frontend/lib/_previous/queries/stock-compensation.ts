'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';
import type { StockGrant, StockValuation, StockExpense, CompensationSummary } from '@/lib/types/stock-compensation';

const STALE_TIME = 30_000;

function toStockGrant(raw: Record<string, unknown>): StockGrant {
  return {
    id: raw.id as string,
    grantDate: (raw.grantDate ?? '') as string,
    grantType: (raw.grantType ?? 'rsu') as StockGrant['grantType'],
    recipientId: raw.recipientId as string | undefined,
    recipientName: raw.recipientName as string | undefined,
    sharesGranted: Number(raw.sharesGranted ?? 0),
    grantPrice: raw.grantPrice != null ? toMoneyString(raw.grantPrice) : undefined,
    fairValuePerShare: raw.fairValuePerShare != null ? toMoneyString(raw.fairValuePerShare) : undefined,
    vestingType: (raw.vestingType ?? 'time') as StockGrant['vestingType'],
    vestingSchedule: (raw.vestingSchedule ?? []) as StockGrant['vestingSchedule'],
    expirationDate: raw.expirationDate as string | undefined,
    status: (raw.status ?? 'active') as StockGrant['status'],
    notes: raw.notes as string | undefined,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
  };
}

export function useStockGrants(sessionId: string | null) {
  return useQuery({
    queryKey: ['stock-grants', sessionId],
    queryFn: async (): Promise<StockGrant[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ grants: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/stock-compensation/grants`
      );
      return (res.grants ?? []).map(toStockGrant);
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useCreateGrant(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/sessions/${sessionId}/stock-compensation/grants`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-grants', sessionId] });
    },
  });
}

export function useRecordValuation(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grantId, ...body }: { grantId: string } & Record<string, unknown>) =>
      apiFetch(`/api/close/sessions/${sessionId}/stock-compensation/grants/${grantId}/valuations`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-grants', sessionId] });
    },
  });
}

export function useStockExpenses(sessionId: string | null) {
  return useQuery({
    queryKey: ['stock-expenses', sessionId],
    queryFn: async (): Promise<StockExpense[]> => {
      if (!sessionId) return [];
      const res = await apiFetch<{ expenses: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/stock-compensation/expenses`
      );
      return (res.expenses ?? []).map((e) => ({
        id: e.id as string,
        grantId: e.grantId as string,
        periodLabel: e.periodLabel as string,
        expenseAmount: toMoneyString(e.expenseAmount),
        cumulativeExpense: toMoneyString(e.cumulativeExpense),
        sharesVested: Number(e.sharesVested ?? 0),
        createdAt: e.createdAt as string,
      }));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useComputeExpense(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/stock-compensation/compute`, { method: 'POST', body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-expenses', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['compensation-summary', sessionId] });
    },
  });
}

export function useCompensationSummary(sessionId: string | null) {
  return useQuery({
    queryKey: ['compensation-summary', sessionId],
    queryFn: async (): Promise<CompensationSummary | null> => {
      if (!sessionId) return null;
      const res = await apiFetch<{ summary: Record<string, unknown> }>(
        `/api/close/sessions/${sessionId}/stock-compensation/summary`
      );
      const s = res.summary;
      return {
        periodLabel: s.periodLabel as string,
        totalExpense: toMoneyString(s.totalExpense),
        byGrantType: Object.fromEntries(
          Object.entries((s.byGrantType as Record<string, unknown>) ?? {}).map(([k, v]) => [k, toMoneyString(v)])
        ),
        grantCount: Number(s.grantCount ?? 0),
      };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
