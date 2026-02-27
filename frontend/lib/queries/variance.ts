'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { VarianceRecord } from '@/lib/types/variance';

const STALE_TIME = 30_000;

function toVarianceRecord(r: Record<string, unknown>): VarianceRecord {
  const status = (r.explanationStatus ?? r.status) as string;
  let explanationStatus: VarianceRecord['explanationStatus'] = 'not_required';
  if (status === 'explained' || status === 'pending') explanationStatus = status;
  else if (status === 'approved') explanationStatus = 'approved';

  return {
    id: (r.id ?? r.varianceId) as string,
    fsLineId: (r.fsLineId ?? r.fs_line_id ?? '') as string,
    lineItemName: (r.lineItemName ?? r.name ?? r.fsLineId) as string,
    statementType: (r.statementType ?? r.statement ?? 'income_statement') as string,
    priorAmount: String(r.priorAmount ?? r.prior ?? '0'),
    currentAmount: String(r.currentAmount ?? r.current ?? r.amount ?? '0'),
    changeAmount: String(r.changeAmount ?? r.change ?? '0'),
    changePercent: String(r.changePercent ?? r.percent ?? '0'),
    isMaterial: (r.isMaterial ?? r.material ?? false) as boolean,
    materialityThreshold: String(r.materialityThreshold ?? '0'),
    explanation: (r.explanation as string) ?? null,
    explanationStatus,
    approvedBy: (r.approvedBy ?? r.reviewedBy) as string | null,
    approvedAt: (r.approvedAt ?? r.reviewedAt) as string | null,
    aiDraftExplanation: (r.aiDraftExplanation ?? r.aiDraft) as string | null,
    priorPeriodId: (r.priorPeriodId ?? r.prior_period_id ?? null) as string | null,
  };
}

export function useVariances(sessionId: string | null) {
  return useQuery({
    queryKey: ['variances', sessionId],
    queryFn: async (): Promise<VarianceRecord[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ variances: unknown[] }>(
        `/api/close/sessions/${sessionId}/variances`
      );
      const list = res.variances ?? [];
      return list.map((v) => toVarianceRecord(v as Record<string, unknown>));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
