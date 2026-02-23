'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 30_000;

export interface EntityOption {
  id: string;
  name: string;
}

export function useEntities() {
  return useQuery({
    queryKey: ['settings', 'entities'],
    queryFn: async (): Promise<EntityOption[]> => {
      const res = await apiFetch<{ entities?: Array<{ id: string; name: string }> }>(
        '/api/settings/entities'
      );
      return res.entities ?? [];
    },
    staleTime: STALE_TIME,
  });
}
