'use client';

import { useQuery } from '@tanstack/react-query';
import type { TrialBalanceData, TrialBalanceRow } from '@/lib/types/trial-balance';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';

const STALE = 30_000;

function toTrialBalanceRow(r: Record<string, unknown>): TrialBalanceRow {
  return {
    accountCode: (r.accountCode as string) ?? '',
    accountName: (r.accountName as string) ?? '',
    accountType: ((r.accountType as string) ?? 'UNKNOWN').toUpperCase() as TrialBalanceRow['accountType'],
    debitBalance: toMoneyString(r.debitBalance),
    creditBalance: toMoneyString(r.creditBalance),
    netBalance: toMoneyString(r.netBalance),
    mappingReportingLineId: (r.mappingReportingLineId as string) ?? null,
    mappingReportingLineName: (r.mappingReportingLineName as string) ?? null,
    mappingStatus: ((r.mappingStatus as string) ?? 'unmapped') as TrialBalanceRow['mappingStatus'],
  };
}

export function useTrialBalance(sessionId: string | null, isAdjusted: boolean) {
  return useQuery({
    queryKey: ['trial-balance', sessionId, isAdjusted],
    queryFn: async (): Promise<TrialBalanceData> => {
      if (!sessionId) throw new Error('No sessionId');
      const raw = await apiFetch<Record<string, unknown>>(
        `/api/close/sessions/${sessionId}/trial-balance`,
        { params: { type: isAdjusted ? 'adjusted' : 'unadjusted' } }
      );
      const rows = ((raw.rows as unknown[]) ?? []).map((r) => toTrialBalanceRow(r as Record<string, unknown>));
      return {
        periodLabel: (raw.periodLabel as string) ?? '',
        isAdjusted: (raw.isAdjusted as boolean) ?? isAdjusted,
        rows,
        totalDebits: toMoneyString(raw.totalDebits),
        totalCredits: toMoneyString(raw.totalCredits),
        glEntriesByAccount: {},
      };
    },
    enabled: !!sessionId,
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });
}
