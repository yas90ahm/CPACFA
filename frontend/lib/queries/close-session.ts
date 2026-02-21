'use client';

import { useQuery } from '@tanstack/react-query';
import type { CloseSession } from '@/lib/types/close-session';
import type { CloseReadiness } from '@/lib/types/readiness';
import type { CloseIssue } from '@/lib/types/issues';
import {
  getCloseSessionById,
  mockReadiness,
  mockIssues,
} from '@/lib/mock/close-session';

const STALE_TIME = 30_000;

export function useCloseSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['close-session', sessionId],
    queryFn: async (): Promise<CloseSession> => {
      if (!sessionId) throw new Error('No sessionId');
      // Replace with: return apiFetch<CloseSession>(`/api/close/sessions/${sessionId}`);
      return Promise.resolve(getCloseSessionById(sessionId));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useCloseReadiness(sessionId: string | null) {
  return useQuery({
    queryKey: ['close-readiness', sessionId],
    queryFn: async (): Promise<CloseReadiness> => {
      if (!sessionId) throw new Error('No sessionId');
      // return apiFetch<CloseReadiness>(`/api/close/sessions/${sessionId}/readiness`);
      return Promise.resolve({ ...mockReadiness, sessionId });
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useCloseIssues(
  sessionId: string | null,
  _filters?: { severity?: string; category?: string }
) {
  return useQuery({
    queryKey: ['close-issues', sessionId, _filters],
    queryFn: async (): Promise<CloseIssue[]> => {
      if (!sessionId) throw new Error('No sessionId');
      // return apiFetch<CloseIssue[]>(`/api/close/sessions/${sessionId}/issues`, { ... });
      return Promise.resolve(
        mockIssues.map((i) => ({ ...i, navigateTo: i.navigateTo.replace('[sessionId]', sessionId) }))
      );
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}
