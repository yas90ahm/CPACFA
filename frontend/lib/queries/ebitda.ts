'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function useEBITDABridge(sessionId: string | null) {
  return useQuery({
    queryKey: ['ebitda-bridge', sessionId],
    queryFn: () => apiFetch<{ bridge: any }>(`/api/close/sessions/${sessionId}/ebitda-bridge`),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

export function useAddEbitdaAddback(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { label: string; amount: string; category?: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/ebitda-addbacks`, { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ebitda-bridge', sessionId] }),
  });
}

export function useDeleteEbitdaAddback(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addbackId: string) =>
      apiFetch(`/api/close/sessions/${sessionId}/ebitda-addbacks/${addbackId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ebitda-bridge', sessionId] }),
  });
}
