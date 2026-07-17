'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Gate } from '@/lib/contracts/statuses';

interface SessionData {
  id: string;
  state?: string;
  status?: string;
  periodLabel?: string;
  periodEnd?: string;
  periodStart?: string;
  startedAt?: string;
  createdAt?: string;
  closeDayTarget?: number;
  entityName?: string;
  [key: string]: unknown;
}

interface ReadinessData {
  gates: Gate[];
  gatesPassing: number;
  gatesTotal: number;
  canAdvance: boolean;
}

export function useCloseSession(sessionId: string) {
  const sessionQuery = useQuery<SessionData>({
    queryKey: ['close-session', sessionId],
    queryFn: () => apiFetch<SessionData>(`/api/close/sessions/${sessionId}`),
    enabled: !!sessionId,
  });

  const readinessQuery = useQuery<ReadinessData>({
    queryKey: ['close-readiness', sessionId],
    queryFn: () =>
      apiFetch<ReadinessData>(`/api/close/sessions/${sessionId}/readiness`, {
        params: { format: 'gates' },
      }),
    enabled: !!sessionId,
  });

  const gates: Gate[] = readinessQuery.data?.gates ?? [];
  const gatesTotal = readinessQuery.data?.gatesTotal ?? gates.length;
  const activeGateIndex = gates.findIndex((gate) => !gate.passing);
  const activeGateNum = activeGateIndex >= 0 ? activeGateIndex + 1 : gatesTotal;

  const startedAt = sessionQuery.data?.startedAt ?? sessionQuery.data?.createdAt ?? '';
  const dayElapsed = startedAt
    ? Math.max(
        1,
        Math.ceil((Date.now() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24))
      )
    : 1;
  const targetDays = sessionQuery.data?.closeDayTarget ?? 10;
  const sessionState = (
    sessionQuery.data?.state ??
    sessionQuery.data?.status ??
    'IN_PROGRESS'
  ).replace(/_/g, ' ');
  const periodLabel = sessionQuery.data?.periodLabel ?? '';
  const periodEnd = sessionQuery.data?.periodEnd ?? '';

  return {
    sessionQuery,
    gates,
    gatesTotal,
    activeGateNum,
    dayElapsed,
    targetDays,
    sessionState,
    periodLabel,
    periodEnd,
  };
}
