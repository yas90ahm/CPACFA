'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';
import type { Lease, PaymentScheduleRow, PeriodEntry, LeaseDisclosure } from '@/lib/types/leases';

const STALE_TIME = 30_000;

function toLease(raw: Record<string, unknown>): Lease {
  return {
    id: raw.id as string,
    entityId: (raw.entityId ?? '') as string,
    leaseName: (raw.leaseName ?? '') as string,
    leaseType: raw.leaseType as Lease['leaseType'],
    commencementDate: (raw.commencementDate ?? '') as string,
    termMonths: Number(raw.termMonths ?? 0),
    monthlyPayment: toMoneyString(raw.monthlyPayment),
    ibrAnnual: String(raw.ibrAnnual ?? '0'),
    rouAssetInitial: toMoneyString(raw.rouAssetInitial),
    leaseLiabilityInitial: toMoneyString(raw.leaseLiabilityInitial),
    assetAccount: (raw.assetAccount ?? '1800') as string,
    liabilityAccount: (raw.liabilityAccount ?? '2800') as string,
    expenseAccount: (raw.expenseAccount ?? '6200') as string,
    interestAccount: (raw.interestAccount ?? '7100') as string,
    amortizationAccount: (raw.amortizationAccount ?? '6210') as string,
    accumAmortizationAccount: (raw.accumAmortizationAccount ?? '1810') as string,
    status: (raw.status ?? 'active') as Lease['status'],
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
  };
}

function toScheduleRow(raw: Record<string, unknown>): PaymentScheduleRow {
  return {
    id: raw.id as string,
    leaseId: raw.leaseId as string,
    periodNumber: Number(raw.periodNumber ?? 0),
    paymentDate: (raw.paymentDate ?? '') as string,
    paymentAmount: toMoneyString(raw.paymentAmount),
    interestAmount: toMoneyString(raw.interestAmount),
    principalAmount: toMoneyString(raw.principalAmount),
    beginningLiability: toMoneyString(raw.beginningLiability),
    endingLiability: toMoneyString(raw.endingLiability),
    rouAmortization: toMoneyString(raw.rouAmortization),
    straightLineExpense: toMoneyString(raw.straightLineExpense),
  };
}

function toPeriodEntry(raw: Record<string, unknown>): PeriodEntry {
  return {
    id: raw.id as string,
    leaseId: raw.leaseId as string,
    closeSessionId: raw.closeSessionId as string,
    scheduleId: raw.scheduleId as string,
    journalEntryId: (raw.journalEntryId as string) ?? null,
    entryType: raw.entryType as PeriodEntry['entryType'],
    amount: toMoneyString(raw.amount),
    createdAt: raw.createdAt as string,
  };
}

export function useLeases(sessionId: string | null) {
  return useQuery({
    queryKey: ['leases', sessionId],
    queryFn: async (): Promise<{ leases: Lease[]; periodEntries: PeriodEntry[] }> => {
      if (!sessionId) return { leases: [], periodEntries: [] };
      const res = await apiFetch<{ leases: Record<string, unknown>[]; periodEntries: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/leases`
      );
      return {
        leases: (res.leases ?? []).map(toLease),
        periodEntries: (res.periodEntries ?? []).map(toPeriodEntry),
      };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useCreateLease(entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/entities/${entityId}/leases`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] });
    },
  });
}

export function useGenerateSchedule(leaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ schedule: Record<string, unknown>[] }>(`/api/close/leases/${leaseId}/generate-schedule`, { method: 'POST', body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lease-schedule', leaseId] });
      queryClient.invalidateQueries({ queryKey: ['leases'] });
    },
  });
}

export function useLeaseSchedule(leaseId: string | null) {
  return useQuery({
    queryKey: ['lease-schedule', leaseId],
    queryFn: async (): Promise<PaymentScheduleRow[]> => {
      if (!leaseId) return [];
      // Schedule is returned as part of generate, we fetch via leases endpoint
      const res = await apiFetch<{ schedule: Record<string, unknown>[] }>(
        `/api/close/leases/${leaseId}/generate-schedule`,
        { method: 'POST', body: {} }
      );
      return (res.schedule ?? []).map(toScheduleRow);
    },
    enabled: false, // Only fetch on demand
    staleTime: STALE_TIME,
  });
}

export function useProposeLeaseEntries(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { entityId: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/leases/propose-entries`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases', sessionId] });
    },
  });
}

export function useLeaseDisclosure(sessionId: string | null, entityId?: string) {
  return useQuery({
    queryKey: ['lease-disclosure', sessionId, entityId],
    queryFn: async (): Promise<LeaseDisclosure | null> => {
      if (!sessionId || !entityId) return null;
      const res = await apiFetch<{ disclosure: Record<string, unknown> }>(
        `/api/close/sessions/${sessionId}/leases/disclosure?entityId=${entityId}`
      );
      const d = res.disclosure;
      return {
        maturityAnalysis: ((d.maturityAnalysis as Record<string, unknown>[]) ?? []).map((m) => ({
          year: Number(m.year),
          totalPayments: toMoneyString(m.totalPayments),
        })),
        weightedAverageRemainingTerm: String(d.weightedAverageRemainingTerm ?? '0.00'),
        weightedAverageDiscountRate: String(d.weightedAverageDiscountRate ?? '0.000000'),
        financeLeaseExpense: {
          interest: toMoneyString((d.financeLeaseExpense as Record<string, unknown>)?.interest),
          amortization: toMoneyString((d.financeLeaseExpense as Record<string, unknown>)?.amortization),
          total: toMoneyString((d.financeLeaseExpense as Record<string, unknown>)?.total),
        },
        operatingLeaseExpense: toMoneyString(d.operatingLeaseExpense),
        totalLeaseCount: Number(d.totalLeaseCount ?? 0),
        financeLeaseCount: Number(d.financeLeaseCount ?? 0),
        operatingLeaseCount: Number(d.operatingLeaseCount ?? 0),
      };
    },
    enabled: !!sessionId && !!entityId,
    staleTime: STALE_TIME,
  });
}
