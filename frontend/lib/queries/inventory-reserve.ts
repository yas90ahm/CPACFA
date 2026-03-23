'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';
import type { AgingSummary, InventoryReserveComputation, InventoryReserveConfig } from '@/lib/types/inventory-reserve';

const STALE_TIME = 30_000;

function toComputation(raw: Record<string, unknown>): InventoryReserveComputation {
  return {
    id: raw.id as string,
    snapshotId: (raw.snapshotId ?? '') as string,
    totalInventory: toMoneyString(raw.totalInventory),
    bucketCurrent: toMoneyString(raw.bucketCurrent),
    bucket91_180: toMoneyString(raw.bucket91_180),
    bucket181_365: toMoneyString(raw.bucket181_365),
    bucketOver365: toMoneyString(raw.bucketOver365),
    reserveCurrent: toMoneyString(raw.reserveCurrent),
    reserve91_180: toMoneyString(raw.reserve91_180),
    reserve181_365: toMoneyString(raw.reserve181_365),
    reserveOver365: toMoneyString(raw.reserveOver365),
    requiredReserve: toMoneyString(raw.requiredReserve),
    currentGlReserve: toMoneyString(raw.currentGlReserve),
    adjustmentNeeded: toMoneyString(raw.adjustmentNeeded),
    journalEntryId: (raw.journalEntryId as string) ?? null,
    createdAt: raw.createdAt as string,
  };
}

export function useInventoryReserve(sessionId: string | null) {
  return useQuery({
    queryKey: ['inventory-reserve', sessionId],
    queryFn: async (): Promise<{ computations: InventoryReserveComputation[]; aging: AgingSummary | null }> => {
      if (!sessionId) return { computations: [], aging: null };
      const res = await apiFetch<{ computations: Record<string, unknown>[]; aging: Record<string, unknown> | null }>(
        `/api/close/sessions/${sessionId}/inventory-reserve`
      );
      return {
        computations: (res.computations ?? []).map(toComputation),
        aging: res.aging as AgingSummary | null,
      };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useUploadInventoryAging(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { entityId: string; csvData: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/inventory-reserve/upload`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-reserve', sessionId] });
    },
  });
}

export function useComputeReserve(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { entityId: string; snapshotId: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/inventory-reserve/compute`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-reserve', sessionId] });
    },
  });
}

export function useProposeReserveAJE(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { entityId: string; computationId: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/inventory-reserve/propose-aje`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-reserve', sessionId] });
    },
  });
}

export function useInventoryReserveConfig(entityId: string | null) {
  return useQuery({
    queryKey: ['inventory-reserve-config', entityId],
    queryFn: async (): Promise<InventoryReserveConfig> => {
      if (!entityId) throw new Error('No entityId');
      const res = await apiFetch<{ config: Record<string, unknown> }>(
        `/api/close/entities/${entityId}/inventory-reserve-config`
      );
      const c = res.config;
      return {
        id: (c.id ?? '') as string,
        rateCurrent: String(c.rateCurrent ?? '0.0000'),
        rate91_180: String(c.rate91_180 ?? '0.2500'),
        rate181_365: String(c.rate181_365 ?? '0.5000'),
        rateOver365: String(c.rateOver365 ?? '1.0000'),
      };
    },
    enabled: !!entityId,
    staleTime: STALE_TIME,
  });
}

export function useUpdateInventoryReserveConfig(entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/entities/${entityId}/inventory-reserve-config`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-reserve-config', entityId] });
    },
  });
}
