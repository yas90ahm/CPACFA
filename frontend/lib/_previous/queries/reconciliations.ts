'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';
import type { Reconciliation, ReconcilingItem, ReconcilingItemType } from '@/lib/types/reconciliation';

const STALE_TIME = 30_000;

const BACKEND_ITEM_TYPE_TO_FRONT: Record<string, ReconcilingItemType> = {
  outstanding_check: 'Outstanding Check',
  deposit_in_transit: 'Deposit in Transit',
  bank_fee: 'Bank Fee',
  timing_difference: 'Timing Difference',
  error_correction: 'Error Correction',
  accrual: 'Accrual',
  amortization: 'Amortization',
  depreciation: 'Depreciation',
  addition: 'Addition',
  disposal: 'Disposal',
  reclassification: 'Reclassification',
  write_off: 'Write-off',
  payment: 'Payment',
  collection: 'Collection',
  intercompany: 'Intercompany',
  other: 'Other',
};

function toReconcilingItem(raw: Record<string, unknown>, reconId: string): ReconcilingItem {
  const type = (raw.itemType ?? raw.type ?? 'other') as string;
  return {
    id: (raw.itemId ?? raw.id) as string,
    reconId,
    description: (raw.description ?? '') as string,
    amount: toMoneyString(raw.amount),
    type: BACKEND_ITEM_TYPE_TO_FRONT[type] ?? 'Other',
    date: (raw.createdAt ?? raw.date) as string | null,
  };
}

function toReconciliation(raw: Record<string, unknown>, sessionId: string): Reconciliation {
  return {
    id: (raw.reconId ?? raw.id) as string,
    sessionId,
    accountCode: (raw.accountCode as string) ?? '',
    accountName: (raw.accountName as string) ?? '',
    glBalance: toMoneyString(raw.glBalance),
    supportingBalance: raw.supportingBalance != null ? toMoneyString(raw.supportingBalance) : null,
    // Use server-computed values (GENERATED ALWAYS columns) — pass through as strings
    variance: toMoneyString(raw.variance),
    reconcilingItemsTotal: toMoneyString(raw.reconcilingItemsTotal),
    unexplainedVariance: toMoneyString(raw.unexplainedVariance),
    tolerance: toMoneyString(raw.toleranceAmount ?? raw.tolerance),
    status: ((raw.status as string) ?? 'not_started') as Reconciliation['status'],
    evidenceCount: (raw.supportingDocumentRefs as string[])?.length ?? 0,
    preparer: (raw.preparedBy ?? raw.preparer) as string | null,
    reviewer: (raw.reviewedBy ?? raw.reviewer) as string | null,
    completedAt: (raw.preparedAt ?? raw.completedAt) as string | null,
    approvedAt: (raw.reviewedAt ?? raw.approvedAt) as string | null,
    rejectedReason: raw.rejectedReason as string | null,
    notes: raw.notes as string | null,
    priorPeriodGlBalance: raw.priorPeriodGlBalance != null ? toMoneyString(raw.priorPeriodGlBalance) : null,
    priorPeriodSupportingBalance: raw.priorPeriodSupportingBalance != null ? toMoneyString(raw.priorPeriodSupportingBalance) : null,
    copiedFromPrior: (raw.copiedFromPrior as boolean) ?? false,
    sourceDocumentType: (raw.supportingSource ?? raw.sourceDocumentType ?? 'other') as string,
  };
}

export function useReconciliations(sessionId: string | null) {
  return useQuery({
    queryKey: ['reconciliations', sessionId],
    queryFn: async (): Promise<Reconciliation[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ reconciliations: unknown[] }>(
        `/api/close/sessions/${sessionId}/reconciliations`
      );
      const list = res.reconciliations ?? [];
      return list.map((r) => toReconciliation(r as Record<string, unknown>, sessionId));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useReconciliation(sessionId: string | null, reconId: string | null) {
  return useQuery({
    queryKey: ['reconciliation', sessionId, reconId],
    queryFn: async (): Promise<{ reconciliation: Reconciliation | null; items: ReconcilingItem[] }> => {
      if (!sessionId || !reconId) return { reconciliation: null, items: [] };
      try {
        const res = await apiFetch<{ reconciliation: Record<string, unknown>; items?: unknown[] }>(
          `/api/close/sessions/${sessionId}/reconciliations/${reconId}`
        );
        const reconciliation = toReconciliation(res.reconciliation ?? {}, sessionId);
        const items = (res.items ?? []).map((i) => toReconcilingItem(i as Record<string, unknown>, reconId));
        return { reconciliation, items };
      } catch {
        return { reconciliation: null, items: [] };
      }
    },
    enabled: !!sessionId && !!reconId,
    staleTime: STALE_TIME,
  });
}

export function usePriorPeriodData(sessionId: string | null) {
  return useQuery({
    queryKey: ['prior-period-recons', sessionId],
    queryFn: async (): Promise<Reconciliation[]> => {
      if (!sessionId) return [];
      const res = await apiFetch<{ reconciliations: unknown[] }>(
        `/api/close/sessions/${sessionId}/reconciliations/prior-period`
      );
      return (res.reconciliations ?? []).map((r) => toReconciliation(r as Record<string, unknown>, sessionId));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useCopyPriorPeriod(sessionId: string, reconId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/copy-prior`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
  });
}
