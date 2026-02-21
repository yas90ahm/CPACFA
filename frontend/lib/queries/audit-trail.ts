'use client';

import { useQuery } from '@tanstack/react-query';
import { getAuditEventsBySession } from '@/lib/mock/audit-trail';

const STALE_TIME = 30_000;

export function useAuditTrail(sessionId: string | null) {
  return useQuery({
    queryKey: ['audit-trail', sessionId],
    queryFn: () => getAuditEventsBySession(sessionId!),
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
