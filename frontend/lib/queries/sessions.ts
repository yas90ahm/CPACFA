'use client';

import { useQuery } from '@tanstack/react-query';
import { getSessionsByEntity } from '@/lib/mock/sessions';

const STALE_TIME = 30_000;

export function useSessions(entityId: string | null) {
  return useQuery({
    queryKey: ['sessions', entityId],
    queryFn: () => getSessionsByEntity(entityId!),
    enabled: !!entityId,
    staleTime: STALE_TIME,
  });
}
