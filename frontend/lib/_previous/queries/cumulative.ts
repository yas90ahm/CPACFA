'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 30_000;

// ---- Cumulative Periods ----

export interface CumulativePeriodInfo {
  sessionId: string;
  label: string;
  status: string;
}

export interface CumulativePeriodsResult {
  qtd: { available: boolean; quarter: number; fiscalYear: number; periods: CumulativePeriodInfo[] } | null;
  ytd: { available: boolean; fiscalYear: number; periods: CumulativePeriodInfo[] } | null;
}

export function useCumulativePeriods(sessionId: string | null) {
  return useQuery({
    queryKey: ['cumulative-periods', sessionId],
    queryFn: async () => {
      const res = await apiFetch<CumulativePeriodsResult>(
        `/api/close/sessions/${sessionId}/cumulative-periods`
      );
      return res;
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

// ---- Generate Cumulative Statements ----

export function useGenerateCumulative(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { cumulativeType: 'QTD' | 'YTD'; throughPeriodEnd: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/statement-packages/generate-cumulative`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['statements', sessionId] });
      qc.invalidateQueries({ queryKey: ['cumulative-periods', sessionId] });
    },
  });
}

// ---- Cumulative Variances ----

export interface CumulativeVarianceRecord {
  fsLineId: string;
  statement: string;
  label: string;
  currentAmount: string;
  priorAmount: string;
  changeAmount: string;
  changePercent: string | null;
  isMaterial: boolean;
  currentPeriodLabel: string;
  priorPeriodLabel: string;
}

export interface CumulativeVarianceResult {
  variances: CumulativeVarianceRecord[];
  currentPeriodLabel: string;
  priorPeriodLabel: string;
  comparisonType: string;
  cumulativeType: string;
  note: string;
}

export function useCumulativeVariances(
  sessionId: string | null,
  cumulativeType: 'QTD' | 'YTD' | null,
  comparisonType: string = 'prior_year_same_period'
) {
  return useQuery({
    queryKey: ['cumulative-variances', sessionId, cumulativeType, comparisonType],
    queryFn: async () => {
      const res = await apiFetch<CumulativeVarianceResult>(
        `/api/close/sessions/${sessionId}/variances/cumulative?cumulativeType=${cumulativeType}&comparisonType=${comparisonType}`
      );
      return res;
    },
    enabled: !!sessionId && !!cumulativeType,
    staleTime: STALE_TIME,
  });
}

// ---- Comparative Statement Lines ----

export interface ComparativePeriodAmount {
  period: string;
  sessionId: string;
  amount: string;
}

export interface ComparativeStatementLine {
  fsLineId: string;
  name: string;
  statement: string;
  displayOrder: number;
  indentLevel: number;
  isSubtotal: boolean;
  isGrandTotal: boolean;
  sectionName: string | null;
  amounts: ComparativePeriodAmount[];
}

export function useComparativeStatements(
  packageId: string | null,
  comparativePeriods: number
) {
  return useQuery({
    queryKey: ['comparative-statements', packageId, comparativePeriods],
    queryFn: async () => {
      const res = await apiFetch<{
        lines: ComparativeStatementLine[];
        periods: string[];
        comparative: boolean;
      }>(`/api/close/statement-packages/${packageId}/lines?comparativePeriods=${comparativePeriods}`);
      return res;
    },
    enabled: !!packageId && comparativePeriods > 0,
    staleTime: STALE_TIME,
  });
}

// ---- Board Package ----

export interface BoardPackageMetric {
  label: string;
  value: string;
  format: 'money' | 'percent' | 'text';
}

export interface BoardPackageVariance {
  lineItem: string;
  statement: string;
  currentAmount: string;
  priorAmount: string;
  changeAmount: string;
  changePercent: string | null;
  explanation: string | null;
}

export interface BoardPackage {
  entityName: string;
  periodType: string;
  periodLabel: string;
  periodEndDisplay: string;
  generatedAt: string;
  certificationStatus: string;
  certifiedBy: string | null;
  certifiedAt: string | null;
  preparerName: string | null;
  statements: {
    incomeStatement: Array<{ name: string; amount: string; isSubtotal: boolean; isGrandTotal: boolean; indentLevel: number; sectionName: string | null }>;
    balanceSheet: Array<{ name: string; amount: string; isSubtotal: boolean; isGrandTotal: boolean; indentLevel: number; sectionName: string | null }>;
    cashFlow: Array<{ name: string; amount: string; isSubtotal: boolean; isGrandTotal: boolean; indentLevel: number; sectionName: string | null }>;
    equity: Array<{ name: string; amount: string; isSubtotal: boolean; isGrandTotal: boolean; indentLevel: number; sectionName: string | null }>;
  };
  keyMetrics: BoardPackageMetric[];
  materialVariances: BoardPackageVariance[];
  validationResults: Array<{ check: string; passed: boolean; message?: string }>;
  cumulativeNote: string | null;
}

export function useBoardPackage(sessionId: string | null, periodType: string | null) {
  return useQuery({
    queryKey: ['board-package', sessionId, periodType],
    queryFn: async () => {
      const res = await apiFetch<BoardPackage>(
        `/api/close/sessions/${sessionId}/board-package?periodType=${periodType}`
      );
      return res;
    },
    enabled: !!sessionId && !!periodType,
    staleTime: STALE_TIME,
  });
}
