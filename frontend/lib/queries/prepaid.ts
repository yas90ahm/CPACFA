'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';

const STALE_TIME = 30_000;

export interface PrepaidSchedule {
  id: string;
  description: string;
  vendor: string | null;
  prepaidAccount: string;
  expenseAccount: string;
  totalAmount: string;
  startDate: string;
  endDate: string;
  monthsCount: number;
  monthlyAmount: string;
  amortizedToDate: string;
  remainingBalance: string;
  fullyAmortized: boolean;
  createdAt: string;
}

export interface AmortizationEntry {
  id: string;
  scheduleId: string;
  periodLabel: string;
  amount: string;
  jeId: string | null;
  status: string;
  createdAt: string;
}

function toSchedule(r: Record<string, unknown>): PrepaidSchedule {
  return {
    id: r.id as string,
    description: (r.description ?? '') as string,
    vendor: (r.vendor as string) ?? null,
    prepaidAccount: (r.prepaidAccount ?? '') as string,
    expenseAccount: (r.expenseAccount ?? '') as string,
    totalAmount: toMoneyString(r.totalAmount),
    startDate: (r.startDate ?? '') as string,
    endDate: (r.endDate ?? '') as string,
    monthsCount: Number(r.monthsCount ?? 0),
    monthlyAmount: toMoneyString(r.monthlyAmount),
    amortizedToDate: toMoneyString(r.amortizedToDate),
    remainingBalance: toMoneyString(r.remainingBalance),
    fullyAmortized: Boolean(r.fullyAmortized),
    createdAt: (r.createdAt ?? '') as string,
  };
}

export function usePrepaidSchedules(sessionId: string | null) {
  return useQuery({
    queryKey: ['prepaid-schedules', sessionId],
    queryFn: async (): Promise<PrepaidSchedule[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ schedules: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/prepaids`,
        { params: { includeFullyAmortized: 'true' } }
      );
      return (res.schedules ?? []).map(toSchedule);
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useCreatePrepaidSchedule(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/sessions/${sessionId}/prepaids`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepaid-schedules', sessionId] });
    },
  });
}

export function useProposeAmortization(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { periodLabel: string; createdBy?: string }) =>
      apiFetch<{ entries: Record<string, unknown>[]; count: number }>(
        `/api/close/sessions/${sessionId}/prepaids/propose`,
        { method: 'POST', body }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prepaid-schedules', sessionId] });
    },
  });
}
