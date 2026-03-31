'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { ConsolidationInput, ConsolidationResult, ConsolidationEntity, EliminationRule } from '@/lib/types/consolidation';

export function useBuildConsolidation() {
  return useMutation({
    mutationFn: (body: ConsolidationInput) =>
      apiFetch<{ result: ConsolidationResult }>('/api/consolidation/build', { method: 'POST', body }),
  });
}

export interface ConsolidationConfig {
  entities: ConsolidationEntity[];
  eliminationRules: EliminationRule[];
  reportingCurrency: string;
  periodLabel: string;
}

export function useConsolidationConfig(sessionId: string) {
  return useQuery({
    queryKey: ['consolidation-config', sessionId],
    queryFn: () =>
      apiFetch<{ config: ConsolidationConfig | null }>(`/api/close/sessions/${sessionId}/consolidation/config`),
    enabled: !!sessionId,
  });
}

export function useSaveConsolidationConfig(sessionId: string) {
  return useMutation({
    mutationFn: (body: ConsolidationConfig) =>
      apiFetch('/api/close/sessions/' + sessionId + '/consolidation/config', { method: 'PUT', body }),
  });
}
