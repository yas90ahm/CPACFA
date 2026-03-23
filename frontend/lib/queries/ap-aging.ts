'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';

const STALE_TIME = 30_000;

export interface ApAgingSnapshot {
  id: string;
  snapshotDate: string;
  totalAp: string;
  recordCount: number;
  createdAt: string;
}

export interface ApAgingDetail {
  id: string;
  vendorName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  daysOutstanding: number;
  agingBucket: string;
  isPastDue: boolean;
}

export interface CutoffItem {
  id: string;
  vendorName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  amount: string;
  expenseAccount: string | null;
  disposition: string;
  reason: string | null;
  jeId: string | null;
}

export function useApAgingSnapshots(sessionId: string | null) {
  return useQuery({
    queryKey: ['ap-aging-snapshots', sessionId],
    queryFn: async (): Promise<ApAgingSnapshot[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ snapshots: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/ap-aging`
      );
      return (res.snapshots ?? []).map((r) => ({
        id: r.id as string,
        snapshotDate: (r.snapshotDate ?? '') as string,
        totalAp: toMoneyString(r.totalAp),
        recordCount: Number(r.recordCount ?? 0),
        createdAt: (r.createdAt ?? '') as string,
      }));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useApAgingDetail(sessionId: string | null, snapshotId: string | null) {
  return useQuery({
    queryKey: ['ap-aging-detail', sessionId, snapshotId],
    queryFn: async (): Promise<ApAgingDetail[]> => {
      if (!sessionId || !snapshotId) throw new Error('Missing ids');
      const res = await apiFetch<{ detail: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/ap-aging/${snapshotId}/detail`
      );
      return (res.detail ?? []).map((r) => ({
        id: r.id as string,
        vendorName: (r.vendorName ?? '') as string,
        invoiceNumber: (r.invoiceNumber as string) ?? null,
        invoiceDate: (r.invoiceDate ?? '') as string,
        dueDate: (r.dueDate ?? '') as string,
        amount: toMoneyString(r.amount),
        daysOutstanding: Number(r.daysOutstanding ?? 0),
        agingBucket: (r.agingBucket ?? '') as string,
        isPastDue: Boolean(r.isPastDue),
      }));
    },
    enabled: !!sessionId && !!snapshotId,
    staleTime: STALE_TIME,
  });
}

export function useImportApAging(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { snapshotDate: string; rows: Record<string, unknown>[]; entityId?: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/ap-aging/import`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-aging-snapshots', sessionId] });
    },
  });
}

export function useCutoffItems(sessionId: string | null) {
  return useQuery({
    queryKey: ['ap-cutoff-items', sessionId],
    queryFn: async (): Promise<CutoffItem[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ items: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/ap-cutoff`
      );
      return (res.items ?? []).map((r) => ({
        id: r.id as string,
        vendorName: (r.vendorName ?? '') as string,
        invoiceNumber: (r.invoiceNumber as string) ?? null,
        invoiceDate: (r.invoiceDate ?? '') as string,
        amount: toMoneyString(r.amount),
        expenseAccount: (r.expenseAccount as string) ?? null,
        disposition: (r.disposition ?? 'review') as string,
        reason: (r.reason as string) ?? null,
        jeId: (r.jeId as string) ?? null,
      }));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useRunCutoffAnalysis(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { periodEnd: string; candidates: Record<string, unknown>[]; snapshotId?: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/ap-cutoff/analyze`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-cutoff-items', sessionId] });
    },
  });
}

export function useUpdateCutoffDisposition(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, disposition, reason }: { itemId: string; disposition: string; reason?: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/ap-cutoff/${itemId}`, { method: 'PUT', body: { disposition, reason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-cutoff-items', sessionId] });
    },
  });
}

export function useProposeCutoffAJEs(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { createdBy?: string; apAccrualAccount?: string }) =>
      apiFetch<{ jeIds: string[] }>(
        `/api/close/sessions/${sessionId}/ap-cutoff/propose`,
        { method: 'POST', body }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ap-cutoff-items', sessionId] });
    },
  });
}
