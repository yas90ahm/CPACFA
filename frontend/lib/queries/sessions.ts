'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toSessionListItem } from '@/lib/adapters';
import type { SessionListItem } from '@/lib/types/session-list';

const STALE_TIME = 30_000;

export function useSessions(entityId: string | null) {
  return useQuery({
    queryKey: ['sessions', entityId],
    queryFn: async (): Promise<SessionListItem[]> => {
      if (!entityId) throw new Error('No entityId');
      const res = await apiFetch<{ sessions: unknown[] }>('/api/close/sessions', {
        params: { entityId },
      });
      const sessions = res.sessions ?? [];
      return sessions.map((s) => toSessionListItem(s as Record<string, unknown>) as unknown as SessionListItem);
    },
    enabled: !!entityId,
    staleTime: STALE_TIME,
  });
}
