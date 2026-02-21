'use client';

import { useQuery } from '@tanstack/react-query';
import { getCertificationBySession } from '@/lib/mock/certification';

const STALE_TIME = 30_000;

export function useCertification(sessionId: string | null) {
  return useQuery({
    queryKey: ['certification', sessionId],
    queryFn: () => getCertificationBySession(sessionId!),
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
