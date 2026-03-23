'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toMoneyString } from '@/lib/money';

const STALE_TIME = 30_000;

export interface PayrollConfig {
  id: string;
  entityId: string;
  averageDailyPayroll: string;
  lastPayrollDate: string | null;
  wagesExpenseAccount: string;
  accruedWagesAccount: string;
  payrollTaxExpenseAccount: string | null;
  accruedPayrollTaxAccount: string | null;
  benefitsExpenseAccount: string | null;
  accruedBenefitsAccount: string | null;
  averageDailyTax: string;
  averageDailyBenefits: string;
}

export interface PayrollAccrualEntry {
  id: string;
  entityId: string;
  periodEnd: string;
  daysAccrued: number;
  wagesAmount: string;
  taxAmount: string;
  benefitsAmount: string;
  totalAmount: string;
  jeId: string | null;
  source: string;
}

function toConfig(raw: Record<string, unknown>): PayrollConfig {
  return {
    id: raw.id as string,
    entityId: (raw.entityId ?? '') as string,
    averageDailyPayroll: toMoneyString(raw.averageDailyPayroll),
    lastPayrollDate: raw.lastPayrollDate ? String(raw.lastPayrollDate) : null,
    wagesExpenseAccount: (raw.wagesExpenseAccount ?? '') as string,
    accruedWagesAccount: (raw.accruedWagesAccount ?? '') as string,
    payrollTaxExpenseAccount: raw.payrollTaxExpenseAccount ? String(raw.payrollTaxExpenseAccount) : null,
    accruedPayrollTaxAccount: raw.accruedPayrollTaxAccount ? String(raw.accruedPayrollTaxAccount) : null,
    benefitsExpenseAccount: raw.benefitsExpenseAccount ? String(raw.benefitsExpenseAccount) : null,
    accruedBenefitsAccount: raw.accruedBenefitsAccount ? String(raw.accruedBenefitsAccount) : null,
    averageDailyTax: toMoneyString(raw.averageDailyTax),
    averageDailyBenefits: toMoneyString(raw.averageDailyBenefits),
  };
}

function toEntry(raw: Record<string, unknown>): PayrollAccrualEntry {
  return {
    id: raw.id as string,
    entityId: (raw.entityId ?? '') as string,
    periodEnd: raw.periodEnd as string,
    daysAccrued: Number(raw.daysAccrued ?? 0),
    wagesAmount: toMoneyString(raw.wagesAmount),
    taxAmount: toMoneyString(raw.taxAmount),
    benefitsAmount: toMoneyString(raw.benefitsAmount),
    totalAmount: toMoneyString(raw.totalAmount),
    jeId: raw.jeId ? String(raw.jeId) : null,
    source: (raw.source ?? 'computed') as string,
  };
}

export function usePayrollConfig(entityId: string | null) {
  return useQuery({
    queryKey: ['payroll-config', entityId],
    queryFn: async (): Promise<PayrollConfig | null> => {
      if (!entityId) return null;
      const res = await apiFetch<{ config: Record<string, unknown> | null }>(
        `/api/close/entities/${entityId}/payroll-config`
      );
      return res.config ? toConfig(res.config) : null;
    },
    enabled: !!entityId,
    staleTime: STALE_TIME,
  });
}

export function useUpdatePayrollConfig(entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/entities/${entityId}/payroll-config`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-config', entityId] });
    },
  });
}

export function usePayrollAccrualEntries(sessionId: string | null) {
  return useQuery({
    queryKey: ['payroll-accrual', sessionId],
    queryFn: async (): Promise<PayrollAccrualEntry[]> => {
      if (!sessionId) return [];
      const res = await apiFetch<{ entries: Record<string, unknown>[] }>(
        `/api/close/sessions/${sessionId}/payroll-accrual`
      );
      return (res.entries ?? []).map(toEntry);
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useProposePayrollAccrual(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/payroll-accrual/propose`, { method: 'POST', body: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-accrual', sessionId] });
    },
  });
}
