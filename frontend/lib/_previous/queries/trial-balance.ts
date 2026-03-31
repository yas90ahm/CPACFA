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
    priorNetBalance: r.priorNetBalance != null ? toMoneyString(r.priorNetBalance) : null,
    changeAmount: r.changeAmount != null ? toMoneyString(r.changeAmount) : null,
    changePercent: r.changePercent != null ? String(r.changePercent) : null,
    isNew: (r.isNew as boolean) ?? false,
    isInactive: (r.isInactive as boolean) ?? false,
    originalCurrency: (r.originalCurrency as string) ?? null,
    originalDebit: r.originalDebit != null ? toMoneyString(r.originalDebit) : null,
    originalCredit: r.originalCredit != null ? toMoneyString(r.originalCredit) : null,
    exchangeRate: r.exchangeRate != null ? String(r.exchangeRate) : null,
  };
}

export function useTrialBalance(sessionId: string | null, isAdjusted: boolean, includePrior?: boolean) {
  return useQuery({
    queryKey: ['trial-balance', sessionId, isAdjusted, includePrior],
    queryFn: async (): Promise<TrialBalanceData> => {
      if (!sessionId) throw new Error('No sessionId');
      const params: Record<string, string> = { type: isAdjusted ? 'adjusted' : 'unadjusted' };
      if (includePrior) params.includePrior = 'true';
      const raw = await apiFetch<Record<string, unknown>>(
        `/api/close/sessions/${sessionId}/trial-balance`,
        { params }
      );
      const rows = ((raw.rows as unknown[]) ?? []).map((r) => toTrialBalanceRow(r as Record<string, unknown>));
      return {
        periodLabel: (raw.periodLabel as string) ?? '',
        priorPeriodLabel: (raw.priorPeriodLabel as string) ?? null,
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
