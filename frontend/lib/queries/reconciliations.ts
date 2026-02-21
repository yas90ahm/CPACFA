import { useQuery } from '@tanstack/react-query';
import { mockReconciliations } from '@/lib/mock/reconciliations';

export function useReconciliations(sessionId: string) {
  return useQuery({
    queryKey: ['reconciliations', sessionId],
    queryFn: async () => {
      const list = mockReconciliations.filter((r) => r.sessionId === sessionId);
      return list;
    },
    enabled: !!sessionId,
  });
}

export function useReconciliation(sessionId: string, reconId: string | null) {
  return useQuery({
    queryKey: ['reconciliation', sessionId, reconId],
    queryFn: async () => {
      const r = mockReconciliations.find((r) => r.id === reconId && r.sessionId === sessionId);
      if (!r) return null;
      return r;
    },
    enabled: !!sessionId && !!reconId,
  });
}
