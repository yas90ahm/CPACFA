'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { COASuggestion, CFSuggestion, GenerateSuggestionsResult } from '@/lib/types/suggestion';

const STALE_TIME = 30_000;

export function useCOASuggestions(sessionId: string | null) {
  return useQuery({
    queryKey: ['coa-suggestions', sessionId],
    queryFn: async (): Promise<COASuggestion[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ coaSuggestions?: COASuggestion[] }>(
        `/api/close/sessions/${sessionId}/suggestions`,
        { params: { type: 'coa' } }
      );
      return res.coaSuggestions ?? [];
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useCFSuggestions(sessionId: string | null) {
  return useQuery({
    queryKey: ['cf-suggestions', sessionId],
    queryFn: async (): Promise<CFSuggestion[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ cfSuggestions?: CFSuggestion[] }>(
        `/api/close/sessions/${sessionId}/suggestions`,
        { params: { type: 'cf' } }
      );
      return res.cfSuggestions ?? [];
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useGenerateSuggestions(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountNames?: string[]): Promise<GenerateSuggestionsResult> => {
      if (!sessionId) throw new Error('No sessionId');
      return apiFetch<GenerateSuggestionsResult>(
        `/api/close/sessions/${sessionId}/suggestions/generate`,
        { method: 'POST', body: accountNames ? { accountNames } : {} }
      );
    },
    onSuccess: () => {
      if (sessionId) {
        qc.invalidateQueries({ queryKey: ['coa-suggestions', sessionId] });
        qc.invalidateQueries({ queryKey: ['cf-suggestions', sessionId] });
      }
    },
  });
}

export function useAcceptSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      suggestionId: string;
      type: 'coa' | 'cf';
      overrideFsLineId?: string;
      overrideClassification?: string;
    }) => {
      return apiFetch<{ accepted: boolean; ruleId: string; version: number }>(
        `/api/close/suggestions/${params.suggestionId}/accept`,
        {
          method: 'POST',
          body: {
            type: params.type,
            overrideFsLineId: params.overrideFsLineId,
            overrideClassification: params.overrideClassification,
          },
        }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coa-suggestions'] });
      qc.invalidateQueries({ queryKey: ['cf-suggestions'] });
      qc.invalidateQueries({ queryKey: ['ai-suggestions'] });
      qc.invalidateQueries({ queryKey: ['taxonomy'] });
      qc.invalidateQueries({ queryKey: ['trial-balance'] });
      qc.invalidateQueries({ queryKey: ['readiness'] });
    },
  });
}

export function useRejectSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      suggestionId: string;
      type: 'coa' | 'cf';
      reason?: string;
    }) => {
      return apiFetch<{ rejected: boolean }>(
        `/api/close/suggestions/${params.suggestionId}/reject`,
        {
          method: 'POST',
          body: { type: params.type, reason: params.reason },
        }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coa-suggestions'] });
      qc.invalidateQueries({ queryKey: ['cf-suggestions'] });
    },
  });
}
