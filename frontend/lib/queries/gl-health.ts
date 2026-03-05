'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface GLHealthFinding {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  entryId?: string;
  accountCode?: string;
  amount?: string;
}

export interface GLHealthCheck {
  id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail';
  score: number;
  weight: number;
  findingCount: number;
  findings: GLHealthFinding[];
  description: string;
}

export interface GLHealthAnalysis {
  id?: string;
  overallGrade: string;
  overallScore: number;
  checks: GLHealthCheck[];
  findingCount: number;
  periodLabel?: string;
  createdAt?: string;
}

export function useGLHealth(sessionId: string | null) {
  return useQuery({
    queryKey: ['gl-health', sessionId],
    queryFn: async (): Promise<GLHealthAnalysis | null> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ analysis: GLHealthAnalysis | null }>(
        `/api/close/sessions/${sessionId}/gl-health`
      );
      return res.analysis;
    },
    enabled: !!sessionId,
    staleTime: 60_000,
  });
}

export function useRunGLHealth(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<GLHealthAnalysis> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ analysis: GLHealthAnalysis }>(
        `/api/close/sessions/${sessionId}/gl-health/run`,
        { method: 'POST' }
      );
      return res.analysis;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gl-health', sessionId] });
    },
  });
}
