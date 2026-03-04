'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';
import type { DeferredTaxItem, DeferredTaxResult, ValuationAllowanceAssessment, RateChangeImpact } from '@/lib/types/deferred-tax';

const STALE_TIME = 30_000;

function toDeferredTaxItem(raw: Record<string, unknown>): DeferredTaxItem {
  return {
    id: raw.id as string,
    periodLabel: (raw.periodLabel ?? '') as string,
    description: (raw.description ?? '') as string,
    itemType: (raw.itemType ?? 'temporary_difference') as DeferredTaxItem['itemType'],
    bookBasis: toMoneyString(raw.bookBasis),
    taxBasis: toMoneyString(raw.taxBasis),
    reversalPattern: raw.reversalPattern as DeferredTaxItem['reversalPattern'],
    sourceAccount: raw.sourceAccount as string | undefined,
    deferredTaxAsset: raw.deferredTaxAsset != null ? toMoneyString(raw.deferredTaxAsset) : undefined,
    deferredTaxLiability: raw.deferredTaxLiability != null ? toMoneyString(raw.deferredTaxLiability) : undefined,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
  };
}

export function useDeferredTaxItems(sessionId: string | null) {
  return useQuery({
    queryKey: ['deferred-tax-items', sessionId],
    queryFn: async (): Promise<DeferredTaxItem[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ items: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/deferred-tax/items`
      );
      return (res.items ?? []).map(toDeferredTaxItem);
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useCreateDeferredTaxItem(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/sessions/${sessionId}/deferred-tax/items`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deferred-tax-items', sessionId] });
    },
  });
}

export function useCalculateDeferredTax(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { taxRate: number }) =>
      apiFetch<{ result: Record<string, unknown> }>(
        `/api/close/sessions/${sessionId}/deferred-tax/calculate`,
        { method: 'POST', body }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deferred-tax-items', sessionId] });
    },
  });
}

export function useAssessValuationAllowance(sessionId: string) {
  return useMutation({
    mutationFn: (body: { deferredTaxAssetGross: number; evidence: Record<string, unknown> }) =>
      apiFetch<{ result: ValuationAllowanceAssessment }>(
        `/api/close/sessions/${sessionId}/deferred-tax/valuation-allowance`,
        { method: 'POST', body }
      ),
  });
}

export function useRateChangeImpact(sessionId: string) {
  return useMutation({
    mutationFn: (body: { deferredTaxAssetGross: number; deferredTaxLiabilityGross: number; oldRate: number; newRate: number }) =>
      apiFetch<{ result: RateChangeImpact }>(
        `/api/close/sessions/${sessionId}/deferred-tax/rate-change-impact`,
        { method: 'POST', body }
      ),
  });
}
