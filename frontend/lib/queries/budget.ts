'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '@/lib/api';

export function useBudget(sessionId: string | null) {
  return useQuery({
    queryKey: ['budget', sessionId],
    queryFn: () => apiFetch<{ entries: any[] }>(`/api/close/sessions/${sessionId}/budget`),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

export function useBudgetVariance(sessionId: string | null) {
  return useQuery({
    queryKey: ['budget-variance', sessionId],
    queryFn: () => apiFetch<{ variance: any[] }>(`/api/close/sessions/${sessionId}/budget/variance`),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

export function useUploadBudget(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (csvContent: string) =>
      apiFetch(`/api/close/sessions/${sessionId}/budget/upload`, {
        method: 'POST',
        body: { csvContent },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['budget-variance', sessionId] });
    },
  });
}
