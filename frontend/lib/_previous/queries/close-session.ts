'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CloseSession } from '@/lib/types/close-session';
import type { CloseReadiness } from '@/lib/types/readiness';
import type { CloseIssue } from '@/lib/types/issues';
import { apiFetch } from '@/lib/api';
import { toCloseSession as adaptCloseSession } from '@/lib/adapters';

const STALE_TIME = 30_000;

export function useCloseSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['close-session', sessionId],
    queryFn: async (): Promise<CloseSession> => {
      if (!sessionId) throw new Error('No sessionId');
      const raw = await apiFetch<Record<string, unknown>>(`/api/close/sessions/${sessionId}`);
      return adaptCloseSession(raw, sessionId) as unknown as CloseSession;
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useCloseReadiness(sessionId: string | null) {
  return useQuery({
    queryKey: ['readiness', sessionId],
    queryFn: async (): Promise<CloseReadiness> => {
      if (!sessionId) throw new Error('No sessionId');
      const raw = await apiFetch<Record<string, unknown>>(
        `/api/close/sessions/${sessionId}/readiness`,
        { params: { format: 'gates' } }
      );
      const gates = (raw.gates as Array<Record<string, unknown>>) ?? [];
      const base = `/close/${sessionId}`;
      const gatesWithNav = gates.map((g) => ({
        ...g,
        navigateTo: (g.navigateTo as string)?.startsWith('/')
          ? `${base}${(g.navigateTo as string)}`
          : `${base}/${g.navigateTo ?? ''}`,
      }));
      return {
        sessionId,
        gatesPassing: (raw.gatesPassing as number) ?? 0,
        gatesTotal: (raw.gatesTotal as number) ?? gates.length,
        canAdvance: (raw.canAdvance as boolean) ?? false,
        gates: gatesWithNav,
      } as CloseReadiness;
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useCloseIssues(
  sessionId: string | null,
  filters?: { severity?: string; status?: string; category?: string }
) {
  return useQuery({
    queryKey: ['issues', sessionId, filters],
    queryFn: async (): Promise<CloseIssue[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ issues: unknown[] }>(`/api/close/sessions/${sessionId}/issues`, {
        params: filters as Record<string, string>,
      });
      const issues = res.issues ?? [];
      return issues.map((i) => {
        const r = i as Record<string, unknown>;
        const base = `/close/${sessionId}`;
        let navigateTo = `${base}/dashboard`;
        if (r.category === 'reconciliation' && (r.affectedAccounts as string[])?.[0]) {
          const acc = (r.affectedAccounts as string[])[0];
          navigateTo = `${base}/reconciliation/${acc?.replace(/\s*—\s*.*$/, '').trim() || 'recon'}`;
        } else if (r.category === 'mapping') navigateTo = `${base}/mapping`;
        else if (r.category === 'variance') navigateTo = `${base}/variance`;
        else if (r.category === 'adjustments') navigateTo = `${base}/adjustments`;
        else if (r.category === 'review') navigateTo = `${base}/review`;
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          severity: String(r.severity ?? 'INFO').toUpperCase(),
          status: String(r.status ?? 'DETECTED').toUpperCase(),
          category: (r.category as string) ?? '',
          affectedAccounts: (r.affectedAccounts as string[]) ?? [],
          assignedTo: r.assignedTo ?? null,
          detectedAt: (r.detectedAt ?? r.createdAt ?? new Date().toISOString()) as string,
          resolvedAt: r.resolvedAt ?? null,
          navigateTo,
        } as CloseIssue;
      });
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
  });
}

export function useAdvanceSession(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body?: { target_state?: string; reason?: string; certifiedBy?: string }) => {
      if (!sessionId) throw new Error('No sessionId');
      return apiFetch(`/api/close/sessions/${sessionId}/advance`, {
        method: 'POST',
        body: body ?? {},
      });
    },
    onSuccess: () => {
      if (sessionId) {
        qc.invalidateQueries({ queryKey: ['close-session', sessionId] });
        qc.invalidateQueries({ queryKey: ['readiness', sessionId] });
        qc.invalidateQueries({ queryKey: ['issues', sessionId] });
      }
    },
  });
}

export function useCertifySession(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { confirmation: string }) => {
      if (!sessionId) throw new Error('No sessionId');
      return apiFetch<Record<string, unknown>>(`/api/close/sessions/${sessionId}/certify`, {
        method: 'POST',
        body,
      });
    },
    onSuccess: () => {
      if (sessionId) {
        qc.invalidateQueries({ queryKey: ['close-session', sessionId] });
        qc.invalidateQueries({ queryKey: ['readiness', sessionId] });
        qc.invalidateQueries({ queryKey: ['certification', sessionId] });
        qc.invalidateQueries({ queryKey: ['issues', sessionId] });
      }
    },
  });
}

export function useLockSession(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No sessionId');
      return apiFetch(`/api/close/sessions/${sessionId}/lock`, {
        method: 'POST',
        body: {},
      });
    },
    onSuccess: () => {
      if (sessionId) {
        qc.invalidateQueries({ queryKey: ['close-session', sessionId] });
        qc.invalidateQueries({ queryKey: ['readiness', sessionId] });
        qc.invalidateQueries({ queryKey: ['issues', sessionId] });
      }
    },
  });
}

export function useReopenSession(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { reason: string }) => {
      if (!sessionId) throw new Error('No sessionId');
      return apiFetch(`/api/close/sessions/${sessionId}/reopen`, {
        method: 'POST',
        body,
      });
    },
    onSuccess: () => {
      if (sessionId) {
        qc.invalidateQueries({ queryKey: ['close-session', sessionId] });
        qc.invalidateQueries({ queryKey: ['readiness', sessionId] });
        qc.invalidateQueries({ queryKey: ['certification', sessionId] });
        qc.invalidateQueries({ queryKey: ['issues', sessionId] });
      }
    },
  });
}

export interface CloseTimelinePrediction {
  predictedCompletionDate: string | null;
  predictedRemainingDays: number | null;
  targetDays: number;
  currentDay: number;
  atRisk: boolean;
  riskReason: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export function useCloseTimeline(sessionId: string | null) {
  return useQuery({
    queryKey: ['close-timeline', sessionId],
    queryFn: async (): Promise<CloseTimelinePrediction> => {
      if (!sessionId) throw new Error('No sessionId');
      return apiFetch<CloseTimelinePrediction>(
        `/api/close/sessions/${sessionId}/predict-timeline`,
      );
    },
    enabled: !!sessionId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { entityId: string; periodStart: string; periodEnd: string }) => {
      return apiFetch<{ id?: string; closeSessionId?: string }>('/api/close/sessions', {
        method: 'POST',
        body,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['settings', 'entities'] });
    },
  });
}
