'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Reconciliation, ReconcilingItem, ReconcilingItemType } from '@/lib/types/reconciliation';

const STALE_TIME = 30_000;

const BACKEND_ITEM_TYPE_TO_FRONT: Record<string, ReconcilingItemType> = {
  outstanding_check: 'Outstanding Check',
  deposit_in_transit: 'Deposit in Transit',
  bank_fee: 'Bank Fee',
  timing_difference: 'Timing Difference',
  error_correction: 'Error Correction',
  other: 'Other',
};

function toReconcilingItem(raw: Record<string, unknown>, reconId: string): ReconcilingItem {
  const type = (raw.itemType ?? raw.type ?? 'other') as string;
  return {
    id: (raw.itemId ?? raw.id) as string,
    reconId,
    description: (raw.description ?? '') as string,
    amount: parseFloat(String(raw.amount ?? 0)),
    type: BACKEND_ITEM_TYPE_TO_FRONT[type] ?? 'Other',
    date: (raw.createdAt ?? raw.date) as string | null,
  };
}

function toReconciliation(raw: Record<string, unknown>, sessionId: string): Reconciliation {
  const gl = parseFloat(String(raw.glBalance ?? 0));
  const sup = raw.supportingBalance != null ? parseFloat(String(raw.supportingBalance)) : null;
  const items = parseFloat(String(raw.reconcilingItemsTotal ?? 0));
  // Use server-computed values (GENERATED ALWAYS columns) — never compute money in JS
  const variance = raw.variance != null ? parseFloat(String(raw.variance)) : (sup != null ? gl - sup : 0);
  const unexplained = raw.unexplainedVariance != null ? parseFloat(String(raw.unexplainedVariance)) : (sup != null ? variance - items : 0);
  return {
    id: (raw.reconId ?? raw.id) as string,
    sessionId,
    accountCode: (raw.accountCode as string) ?? '',
    accountName: (raw.accountName as string) ?? '',
    glBalance: gl,
    supportingBalance: sup,
    variance,
    reconcilingItemsTotal: items,
    unexplainedVariance: unexplained,
    tolerance: parseFloat(String(raw.toleranceAmount ?? raw.tolerance ?? 0)),
    status: ((raw.status as string) ?? 'not_started') as Reconciliation['status'],
    evidenceCount: (raw.supportingDocumentRefs as string[])?.length ?? 0,
    preparer: (raw.preparedBy ?? raw.preparer) as string | null,
    reviewer: (raw.reviewedBy ?? raw.reviewer) as string | null,
    completedAt: (raw.preparedAt ?? raw.completedAt) as string | null,
    approvedAt: (raw.reviewedAt ?? raw.approvedAt) as string | null,
    rejectedReason: raw.rejectedReason as string | null,
    notes: raw.notes as string | null,
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
