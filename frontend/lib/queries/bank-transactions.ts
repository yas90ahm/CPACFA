'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '@/lib/api';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: string;
  type: 'debit' | 'credit';
  reference?: string;
  status: 'matched' | 'unmatched' | 'confirmed';
  matchGroupId?: string | null;
}

export interface MatchGroup {
  id: string;
  bankTransactionIds: string[];
  glEntryIds: string[];
  confidence: number;
  method: 'exact' | 'fuzzy' | 'rule' | 'manual';
  amountDifference: string;
  status: 'proposed' | 'confirmed' | 'rejected';
  bankTotal: string;
  glTotal: string;
  createdAt: string;
}

export interface BankSummary {
  totalTransactions: number;
  matched: number;
  unmatched: number;
  confirmed: number;
  rejected: number;
  matchRate: number;
  bankTotal: string;
  glTotal: string;
  difference: string;
  matchGroups: MatchGroup[];
}

export interface ParsePreview {
  transactions: BankTransaction[];
  rowCount: number;
  dateRange: { from: string; to: string };
  format: string;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const STALE_TIME = 30_000;

function toBankTransaction(raw: Record<string, unknown>): BankTransaction {
  return {
    id: (raw.id ?? raw.transactionId) as string,
    date: (raw.date ?? raw.transactionDate ?? '') as string,
    description: (raw.description ?? raw.memo ?? '') as string,
    amount: String(raw.amount ?? '0'),
    type: (raw.type === 'credit' ? 'credit' : 'debit') as BankTransaction['type'],
    reference: (raw.reference ?? raw.checkNumber ?? undefined) as string | undefined,
    status: (['matched', 'confirmed'].includes(raw.status as string)
      ? raw.status
      : 'unmatched') as BankTransaction['status'],
    matchGroupId: (raw.matchGroupId ?? null) as string | null,
  };
}

function toMatchGroup(raw: Record<string, unknown>): MatchGroup {
  return {
    id: (raw.id ?? raw.groupId) as string,
    bankTransactionIds: (raw.bankTransactionIds ?? []) as string[],
    glEntryIds: (raw.glEntryIds ?? []) as string[],
    confidence: Number(raw.confidence ?? 0),
    method: (['exact', 'fuzzy', 'rule', 'manual'].includes(raw.method as string)
      ? raw.method
      : 'fuzzy') as MatchGroup['method'],
    amountDifference: String(raw.amountDifference ?? '0'),
    status: (['confirmed', 'rejected'].includes(raw.status as string)
      ? raw.status
      : 'proposed') as MatchGroup['status'],
    bankTotal: String(raw.bankTotal ?? '0'),
    glTotal: String(raw.glTotal ?? '0'),
    createdAt: (raw.createdAt ?? '') as string,
  };
}

/* ── Queries ───────────────────────────────────────────────────────────────── */

export function useBankTransactions(sessionId: string | null) {
  return useQuery({
    queryKey: ['bank-transactions', sessionId],
    queryFn: async (): Promise<BankTransaction[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ transactions: unknown[] }>(
        `/api/close/sessions/${sessionId}/bank-transactions`
      );
      return (res.transactions ?? []).map((t) =>
        toBankTransaction(t as Record<string, unknown>)
      );
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useBankSummary(sessionId: string | null) {
  return useQuery({
    queryKey: ['bank-summary', sessionId],
    queryFn: async (): Promise<BankSummary> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<Record<string, unknown>>(
        `/api/close/sessions/${sessionId}/bank-transactions/summary`
      );
      return {
        totalTransactions: Number(res.totalTransactions ?? 0),
        matched: Number(res.matched ?? 0),
        unmatched: Number(res.unmatched ?? 0),
        confirmed: Number(res.confirmed ?? 0),
        rejected: Number(res.rejected ?? 0),
        matchRate: Number(res.matchRate ?? 0),
        bankTotal: String(res.bankTotal ?? '0'),
        glTotal: String(res.glTotal ?? '0'),
        difference: String(res.difference ?? '0'),
        matchGroups: ((res.matchGroups ?? []) as unknown[]).map((g) =>
          toMatchGroup(g as Record<string, unknown>)
        ),
      };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

/* ── Mutations ─────────────────────────────────────────────────────────────── */

export function useParseBankStatement(sessionId: string) {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiUpload<ParsePreview>(
        `/api/close/sessions/${sessionId}/bank-transactions/parse`,
        formData
      );
    },
  });
}

export function useIngestBankStatement(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiUpload<{ transactions: unknown[]; count: number }>(
        `/api/close/sessions/${sessionId}/bank-transactions/ingest`,
        formData
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['bank-summary', sessionId] });
    },
  });
}

export function useRunMatching(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ matchGroups: unknown[]; summary: Record<string, unknown> }>(
        `/api/close/sessions/${sessionId}/bank-transactions/match`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['bank-summary', sessionId] });
    },
  });
}

export function useConfirmMatch(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      apiFetch(
        `/api/close/sessions/${sessionId}/bank-transactions/match-groups/${groupId}/confirm`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['bank-summary', sessionId] });
    },
  });
}

export function useRejectMatch(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      apiFetch(
        `/api/close/sessions/${sessionId}/bank-transactions/match-groups/${groupId}/reject`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['bank-summary', sessionId] });
    },
  });
}
