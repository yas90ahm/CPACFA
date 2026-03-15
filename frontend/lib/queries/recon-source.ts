'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '@/lib/api';

export interface ReconSourceEntry {
  id: string;
  date: string;
  description: string;
  amount: string;
  status: 'matched' | 'unmatched';
  matchedToId?: string | null;
}

export interface ReconSourceData {
  entries: ReconSourceEntry[];
  sourceTotal: string;
  matchSummary: {
    matched: number;
    total: number;
    percent: number;
  };
}

const STALE_TIME = 30_000;

function toSourceEntry(raw: Record<string, unknown>): ReconSourceEntry {
  return {
    id: (raw.id ?? raw.entryId) as string,
    date: (raw.date ?? raw.transactionDate ?? '') as string,
    description: (raw.description ?? raw.memo ?? '') as string,
    amount: String(raw.amount ?? '0'),
    status: (raw.status === 'matched' ? 'matched' : 'unmatched') as ReconSourceEntry['status'],
    matchedToId: (raw.matchedToId ?? raw.matchedEntryId ?? null) as string | null,
  };
}

export function useReconSourceData(sessionId: string | null, reconId: string | null) {
  return useQuery({
    queryKey: ['recon-source', sessionId, reconId],
    queryFn: async (): Promise<ReconSourceData> => {
      if (!sessionId || !reconId) throw new Error('Missing params');
      const res = await apiFetch<{
        sourceData: {
          entries?: unknown[];
          sourceTotal?: string;
          matchSummary?: { matched: number; total: number; percent: number };
        };
      }>(
        `/api/close/sessions/${sessionId}/reconciliations/${reconId}/source-data`
      );
      const sd = res.sourceData ?? {};
      const entries = (sd.entries ?? []).map((e) => toSourceEntry(e as Record<string, unknown>));
      const matched = entries.filter((e) => e.status === 'matched').length;
      const total = entries.length;
      return {
        entries,
        sourceTotal: String(sd.sourceTotal ?? '0'),
        matchSummary: sd.matchSummary ?? {
          matched,
          total,
          percent: total > 0 ? Math.round((matched / total) * 100) : 0,
        },
      };
    },
    enabled: !!sessionId && !!reconId,
    staleTime: STALE_TIME,
  });
}

export function useUploadReconSource(sessionId: string, reconId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiUpload<{ entries: unknown[]; sourceTotal?: string }>(
        `/api/close/sessions/${sessionId}/reconciliations/${reconId}/source-upload`,
        formData
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-source', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
    },
  });
}

export function useAutoMatch(sessionId: string, reconId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ matchSummary: { matched: number; total: number; percent: number } }>(
        `/api/close/sessions/${sessionId}/reconciliations/${reconId}/auto-match`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-source', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
    },
  });
}
