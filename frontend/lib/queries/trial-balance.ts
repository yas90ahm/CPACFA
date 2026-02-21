'use client';

import { useQuery } from '@tanstack/react-query';
import type { TrialBalanceData } from '@/lib/types/trial-balance';
import { mockTrialBalance } from '@/lib/mock/trial-balance';

const STALE = 30_000;

export function useTrialBalance(sessionId: string | null, isAdjusted: boolean) {
  return useQuery({
    queryKey: ['trial-balance', sessionId, isAdjusted],
    queryFn: async (): Promise<TrialBalanceData> => {
      if (!sessionId) throw new Error('No sessionId');
      return Promise.resolve({ ...mockTrialBalance, isAdjusted });
    },
    enabled: !!sessionId,
    staleTime: STALE,
    refetchOnWindowFocus: true,
  });
}
