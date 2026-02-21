'use client';

import { useQuery } from '@tanstack/react-query';
import { getVariancesBySession } from '@/lib/mock/variances';

const STALE_TIME = 30_000;

export function useVariances(sessionId: string | null) {
  return useQuery({
    queryKey: ['variances', sessionId],
    queryFn: () => getVariancesBySession(sessionId!),
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
