'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  adaptReadiness,
  adaptSession,
  adaptSessionStatus,
  type NormalizedGate,
  type NormalizedReadinessResponse,
  type SessionResponse,
} from '@/lib/contracts';

const EMPTY_READINESS: NormalizedReadinessResponse = {
  gates: [],
  gatesPassing: 0,
  gatesTotal: 0,
  canAdvance: false,
};

/** Canonical cache keys for data shared by the governed close surfaces. */
export const closeQueryKeys = {
  session: (sessionId: string) => ['close-session', sessionId] as const,
  readiness: (sessionId: string) => ['close-readiness', sessionId] as const,
  journalEntries: (sessionId: string) => ['journal-entries', sessionId] as const,
  variances: (sessionId: string) => ['variances', sessionId] as const,
  runbookExecution: (sessionId: string) => ['runbook-execution', sessionId] as const,
  accountingMemory: (sessionId: string) => ['accounting-memory', sessionId] as const,
  orchestrator: (sessionId: string) => ['close-orchestrator', sessionId] as const,
};

export function closeSessionQueryOptions(sessionId: string) {
  return {
    queryKey: closeQueryKeys.session(sessionId),
    queryFn: async () => adaptSession(await apiFetch<unknown>(`/api/close/sessions/${sessionId}`)),
    enabled: Boolean(sessionId),
  };
}

export function closeReadinessQueryOptions(sessionId: string) {
  return {
    queryKey: closeQueryKeys.readiness(sessionId),
    queryFn: async () => adaptReadiness(await apiFetch<unknown>(`/api/close/sessions/${sessionId}/readiness`, {
      params: { format: 'gates' },
    })),
    enabled: Boolean(sessionId),
  };
}

/** Shared close-session header data used by statement and trial-balance screens. */
export function useCloseSession(sessionId: string) {
  const sessionQuery = useQuery(closeSessionQueryOptions(sessionId));
  const readinessQuery = useQuery(closeReadinessQueryOptions(sessionId));

  const session: SessionResponse | undefined = sessionQuery.data;
  const readiness = readinessQuery.data ?? EMPTY_READINESS;
  const startedAt = session?.startedAt ?? session?.createdAt;
  const startedAtMs = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const dayElapsed = Number.isFinite(startedAtMs)
    ? Math.max(1, Math.ceil((Date.now() - startedAtMs) / 86_400_000))
    : 1;
  const activeGateIndex = readiness.gates.findIndex((gate: NormalizedGate) => !gate.passing);

  return {
    sessionQuery,
    readinessQuery,
    session,
    readiness,
    gates: readiness.gates,
    gatesPassing: readiness.gatesPassing,
    gatesTotal: readiness.gatesTotal,
    activeGateNum: activeGateIndex >= 0 ? activeGateIndex + 1 : readiness.gatesTotal,
    dayElapsed,
    targetDays: session?.closeDayTarget ?? 10,
    sessionState: session ? adaptSessionStatus(session) : 'open',
    periodLabel: session?.periodLabel ?? '',
    periodEnd: session?.periodEnd ?? '',
  };
}
