'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { ConsolidationInput, ConsolidationResult } from '@/lib/types/consolidation';

export function useBuildConsolidation() {
  return useMutation({
    mutationFn: (body: ConsolidationInput) =>
      apiFetch<{ result: ConsolidationResult }>('/api/consolidation/build', { method: 'POST', body }),
  });
}
