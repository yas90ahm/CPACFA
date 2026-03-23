'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';

const STALE_TIME = 30_000;

export interface ArAgingSnapshot {
  id: string;
  snapshotDate: string;
  totalAr: string;
  recordCount: number;
  createdAt: string;
}

export interface ArAgingDetail {
  id: string;
  customerName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  daysOutstanding: number;
  agingBucket: string;
}

export interface CECLConfig {
  id: string;
  bucketCurrentRate: string;
  bucket1_30Rate: string;
  bucket31_60Rate: string;
  bucket61_90Rate: string;
  bucket91_120Rate: string;
  bucket120PlusRate: string;
  allowanceAccount: string;
  badDebtAccount: string;
}

export interface CECLComputation {
  id: string;
  requiredAllowance: string;
  currentAllowance: string;
  adjustmentNeeded: string;
  jeId: string | null;
  status: string;
  detailJson: unknown;
}

export function useArAgingSnapshots(sessionId: string | null) {
  return useQuery({
    queryKey: ['ar-aging-snapshots', sessionId],
    queryFn: async (): Promise<ArAgingSnapshot[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ snapshots: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/ar-aging`
      );
      return (res.snapshots ?? []).map((r) => ({
        id: r.id as string,
        snapshotDate: (r.snapshotDate ?? '') as string,
        totalAr: toMoneyString(r.totalAr),
        recordCount: Number(r.recordCount ?? 0),
        createdAt: (r.createdAt ?? '') as string,
      }));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useArAgingDetail(sessionId: string | null, snapshotId: string | null) {
  return useQuery({
    queryKey: ['ar-aging-detail', sessionId, snapshotId],
    queryFn: async (): Promise<ArAgingDetail[]> => {
      if (!sessionId || !snapshotId) throw new Error('Missing ids');
      const res = await apiFetch<{ detail: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/ar-aging/${snapshotId}/detail`
      );
      return (res.detail ?? []).map((r) => ({
        id: r.id as string,
        customerName: (r.customerName ?? '') as string,
        invoiceNumber: (r.invoiceNumber as string) ?? null,
        invoiceDate: (r.invoiceDate ?? '') as string,
        dueDate: (r.dueDate ?? '') as string,
        amount: toMoneyString(r.amount),
        daysOutstanding: Number(r.daysOutstanding ?? 0),
        agingBucket: (r.agingBucket ?? '') as string,
      }));
    },
    enabled: !!sessionId && !!snapshotId,
    staleTime: STALE_TIME,
  });
}

export function useImportArAging(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { snapshotDate: string; rows: Record<string, unknown>[]; entityId?: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/ar-aging/import`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ar-aging-snapshots', sessionId] });
    },
  });
}

export function useCECLConfig(sessionId: string | null) {
  return useQuery({
    queryKey: ['cecl-config', sessionId],
    queryFn: async (): Promise<CECLConfig | null> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ config: Record<string, unknown> | null }>(
        `/api/close/sessions/${sessionId}/cecl-config`
      );
      if (!res.config) return null;
      const c = res.config;
      return {
        id: c.id as string,
        bucketCurrentRate: String(c.bucketCurrentRate ?? '0.005'),
        bucket1_30Rate: String(c.bucket1_30Rate ?? '0.01'),
        bucket31_60Rate: String(c.bucket31_60Rate ?? '0.03'),
        bucket61_90Rate: String(c.bucket61_90Rate ?? '0.07'),
        bucket91_120Rate: String(c.bucket91_120Rate ?? '0.15'),
        bucket120PlusRate: String(c.bucket120PlusRate ?? '0.30'),
        allowanceAccount: (c.allowanceAccount ?? '1299') as string,
        badDebtAccount: (c.badDebtAccount ?? '6800') as string,
      };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useUpdateCECLConfig(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/sessions/${sessionId}/cecl-config`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cecl-config', sessionId] });
    },
  });
}

export function useComputeCECL(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ snapshotId, currentAllowanceBalance }: { snapshotId: string; currentAllowanceBalance: number }) =>
      apiFetch<{ computation: Record<string, unknown> }>(
        `/api/close/sessions/${sessionId}/ar-aging/${snapshotId}/cecl-compute`,
        { method: 'POST', body: { currentAllowanceBalance } }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ar-aging-snapshots', sessionId] });
    },
  });
}

export function useProposeCECLAJE(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ computationId, createdBy }: { computationId: string; createdBy?: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/cecl/${computationId}/propose`, { method: 'POST', body: { createdBy } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ar-aging-snapshots', sessionId] });
    },
  });
}
