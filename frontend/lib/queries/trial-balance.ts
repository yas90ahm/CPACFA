'use client';

import { useQuery } from '@tanstack/react-query';
import type { TrialBalanceData, TrialBalanceRow } from '@/lib/types/trial-balance';
import { apiFetch } from '@/lib/api';

const STALE = 30_000;

function toTrialBalanceRow(r: Record<string, unknown>): TrialBalanceRow {
  const debit = parseFloat(String(r.debitBalance ?? 0));
  const credit = parseFloat(String(r.creditBalance ?? 0));
  const net = parseFloat(String(r.netBalance ?? 0)) || debit - credit;
  return {
    accountCode: (r.accountCode as string) ?? '',
    accountName: (r.accountName as string) ?? '',
    accountType: ((r.accountType as string) ?? 'UNKNOWN').toUpperCase() as TrialBalanceRow['accountType'],
    debitBalance: debit,
    creditBalance: credit,
    netBalance: net,
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
        totalDebits: parseFloat(String(raw.totalDebits ?? 0)),
        totalCredits: parseFloat(String(raw.totalCredits ?? 0)),
        glEntriesByAccount: {},
      };
    },
    enabled: !!sessionId,
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });
}
