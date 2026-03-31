'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';
import type { FixedAsset, DepreciationRun, DepreciationRunDetail, DepreciationSummary } from '@/lib/types/fixed-assets';

const STALE_TIME = 30_000;

function toFixedAsset(raw: Record<string, unknown>): FixedAsset {
  return {
    id: raw.id as string,
    assetNumber: (raw.assetNumber ?? '') as string,
    description: (raw.description ?? '') as string,
    assetType: (raw.assetType ?? '') as string,
    cost: toMoneyString(raw.cost),
    residualValue: toMoneyString(raw.residualValue),
    usefulLifeYears: Number(raw.usefulLifeYears ?? 0),
    method: (raw.method ?? 'straight_line') as FixedAsset['method'],
    depreciationStartDate: (raw.depreciationStartDate ?? '') as string,
    status: (raw.status ?? 'active') as FixedAsset['status'],
    disposalDate: raw.disposalDate as string | undefined,
    disposalProceeds: raw.disposalProceeds != null ? toMoneyString(raw.disposalProceeds) : undefined,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
  };
}

export function useFixedAssets(sessionId: string | null) {
  return useQuery({
    queryKey: ['fixed-assets', sessionId],
    queryFn: async (): Promise<FixedAsset[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ assets: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/fixed-assets`
      );
      return (res.assets ?? []).map(toFixedAsset);
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useCreateFixedAsset(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/sessions/${sessionId}/fixed-assets`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets', sessionId] });
    },
  });
}

export function useUpdateFixedAsset(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiFetch(`/api/close/sessions/${sessionId}/fixed-assets/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets', sessionId] });
    },
  });
}

export function useDeleteFixedAsset(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/close/sessions/${sessionId}/fixed-assets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets', sessionId] });
    },
  });
}

export function useRunDepreciation(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/fixed-assets/depreciation-run`, { method: 'POST', body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['depreciation-summary', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['depreciation-runs', sessionId] });
    },
  });
}

export function useDepreciationSummary(sessionId: string | null) {
  return useQuery({
    queryKey: ['depreciation-summary', sessionId],
    queryFn: async (): Promise<DepreciationSummary | null> => {
      if (!sessionId) return null;
      const res = await apiFetch<{ summary: Record<string, unknown> | null }>(
        `/api/close/sessions/${sessionId}/fixed-assets/depreciation-summary`
      );
      if (!res.summary) return null;
      const s = res.summary;
      return {
        periodLabel: s.periodLabel as string,
        totalDepreciation: toMoneyString(s.totalDepreciation),
        byAsset: ((s.byAsset as Record<string, unknown>[]) ?? []).map((a) => ({
          fixedAssetId: a.fixedAssetId as string,
          assetNumber: a.assetNumber as string,
          assetType: a.assetType as string,
          depreciationAmount: toMoneyString(a.depreciationAmount),
        })),
        byType: Object.fromEntries(
          Object.entries((s.byType as Record<string, unknown>) ?? {}).map(([k, v]) => [k, toMoneyString(v)])
        ),
      };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useDepreciationRuns(sessionId: string | null) {
  return useQuery({
    queryKey: ['depreciation-runs', sessionId],
    queryFn: async (): Promise<DepreciationRun[]> => {
      if (!sessionId) return [];
      const res = await apiFetch<{ runs: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/fixed-assets/depreciation-runs`
      );
      return (res.runs ?? []).map((r) => ({
        id: r.id as string,
        periodLabel: r.periodLabel as string,
        totalDepreciation: toMoneyString(r.totalDepreciation),
        createdAt: r.createdAt as string,
      }));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
