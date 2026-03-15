'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AccountFlagType =
  | 'junk'
  | 'test'
  | 'inactive'
  | 'suspense'
  | 'duplicate'
  | 'misclassified'
  | 'personal_expense'
  | 'contra_undetected'
  | 'intercompany'
  | 'orphan'
  | 'zero_balance';

export interface AccountFlag {
  type: AccountFlagType;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestedAction: 'exclude' | 'investigate' | 'merge' | 'reclassify' | 'flag_for_review';
  autoExcludable: boolean;
  source?: 'deterministic' | 'ai';
}

export interface AccountAnalysis {
  accountCode: string;
  accountName: string;
  balance: { debit: string; credit: string; net: string };
  flags: AccountFlag[];
  cleanName?: string;
  duplicateOf?: string;
  suggestedContraOf?: string;
  actionTaken?: 'excluded' | 'kept' | 'merged' | 'reclassified' | null;
}

export interface AnalysisSummary {
  total: number;
  flagged: number;
  excluded: number;
  kept: number;
  pending: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  critical: number;
  warning: number;
  info: number;
  autoExcludable: number;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useAccountAnalysis(sessionId: string) {
  return useQuery({
    queryKey: ['account-analysis', sessionId],
    queryFn: async (): Promise<AccountAnalysis[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ accounts: AccountAnalysis[] }>(
        `/api/close/sessions/${sessionId}/account-analysis`,
      );
      return res.accounts;
    },
    enabled: !!sessionId,
    staleTime: 60_000,
  });
}

export function useAccountAnalysisSummary(sessionId: string) {
  return useQuery({
    queryKey: ['account-analysis-summary', sessionId],
    queryFn: async (): Promise<AnalysisSummary> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<AnalysisSummary>(
        `/api/close/sessions/${sessionId}/account-analysis/summary`,
      );
      return res;
    },
    enabled: !!sessionId,
    staleTime: 60_000,
  });
}

export function useRunAccountAnalysis(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (!sessionId) throw new Error('No sessionId');
      await apiFetch<unknown>(
        `/api/close/sessions/${sessionId}/account-analysis/run`,
        { method: 'POST' },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-analysis', sessionId] });
      qc.invalidateQueries({ queryKey: ['account-analysis-summary', sessionId] });
    },
  });
}

export function useAccountAction(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountCode,
      action,
    }: {
      accountCode: string;
      action: 'excluded' | 'kept' | 'merged' | 'reclassified';
    }): Promise<void> => {
      if (!sessionId) throw new Error('No sessionId');
      await apiFetch<unknown>(
        `/api/close/sessions/${sessionId}/account-analysis/${encodeURIComponent(accountCode)}/action`,
        { method: 'POST', body: { action } },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-analysis', sessionId] });
      qc.invalidateQueries({ queryKey: ['account-analysis-summary', sessionId] });
      qc.invalidateQueries({ queryKey: ['trial-balance', sessionId] });
    },
  });
}

export function useBulkExclude(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (!sessionId) throw new Error('No sessionId');
      await apiFetch<unknown>(
        `/api/close/sessions/${sessionId}/account-analysis/bulk-exclude`,
        { method: 'POST' },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-analysis', sessionId] });
      qc.invalidateQueries({ queryKey: ['account-analysis-summary', sessionId] });
      qc.invalidateQueries({ queryKey: ['trial-balance', sessionId] });
    },
  });
}
