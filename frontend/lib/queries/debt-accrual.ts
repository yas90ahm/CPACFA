'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';

const STALE_TIME = 30_000;

export interface DebtSchedule {
  id: string;
  lenderName: string;
  instrumentType: string;
  principalBalance: string;
  annualRate: string;
  interestExpenseAccount: string;
  accruedInterestAccount: string;
  maturityDate: string | null;
  status: string;
}

export interface DebtAccrualEntry {
  id: string;
  debtScheduleId: string;
  periodStart: string;
  periodEnd: string;
  daysInPeriod: number;
  accrualAmount: string;
  jeId: string | null;
}

function toSchedule(raw: Record<string, unknown>): DebtSchedule {
  return {
    id: raw.id as string,
    lenderName: (raw.lenderName ?? '') as string,
    instrumentType: (raw.instrumentType ?? 'term_loan') as string,
    principalBalance: toMoneyString(raw.principalBalance),
    annualRate: String(raw.annualRate ?? '0'),
    interestExpenseAccount: (raw.interestExpenseAccount ?? '') as string,
    accruedInterestAccount: (raw.accruedInterestAccount ?? '') as string,
    maturityDate: raw.maturityDate ? String(raw.maturityDate) : null,
    status: (raw.status ?? 'active') as string,
  };
}

function toEntry(raw: Record<string, unknown>): DebtAccrualEntry {
  return {
    id: raw.id as string,
    debtScheduleId: raw.debtScheduleId as string,
    periodStart: raw.periodStart as string,
    periodEnd: raw.periodEnd as string,
    daysInPeriod: Number(raw.daysInPeriod ?? 0),
    accrualAmount: toMoneyString(raw.accrualAmount),
    jeId: raw.jeId ? String(raw.jeId) : null,
  };
}

export function useDebtSchedules(sessionId: string | null) {
  return useQuery({
    queryKey: ['debt-accrual', sessionId],
    queryFn: async (): Promise<{ schedules: DebtSchedule[]; entries: DebtAccrualEntry[] }> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ schedules: Record<string, unknown>[]; entries: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/debt-accrual`
      );
      return {
        schedules: (res.schedules ?? []).map(toSchedule),
        entries: (res.entries ?? []).map(toEntry),
      };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useCreateDebtSchedule(entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/entities/${entityId}/debt-schedules`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debt-accrual'] });
    },
  });
}

export function useProposeDebtAccruals(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/debt-accrual/propose`, { method: 'POST', body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debt-accrual', sessionId] });
    },
  });
}
