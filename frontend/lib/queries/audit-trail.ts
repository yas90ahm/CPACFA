'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { AuditEvent } from '@/lib/types/audit-trail';

const STALE_TIME = 30_000;

interface AuditResponse {
  events: unknown[];
  total: number;
  chainIntegrity: boolean;
}

function toAuditEvent(raw: Record<string, unknown>, sessionId: string): AuditEvent {
  return {
    id: (raw.id as string) ?? '',
    sessionId,
    eventType: (raw.eventType as AuditEvent['eventType']) ?? 'close_state_change',
    timestamp: (raw.createdAt as string) ?? (raw.timestamp as string) ?? new Date().toISOString(),
    userId: (raw.userId as string) ?? (raw.createdBy as string) ?? '',
    userName: (raw.userName as string) ?? 'System',
    description: (raw.userPromptRationale as string) ?? (raw.description as string) ?? (raw.eventType as string) ?? '',
    beforeState: null,
    afterState: (raw.deterministicFlagSnapshot as Record<string, unknown>) ?? null,
    hash: (raw.entryHash as string) ?? (raw.hash as string) ?? '',
    previousHash: (raw.previousEntryHash as string) ?? (raw.previousHash as string) ?? null,
    chainValid: (raw.chainValid as boolean) ?? true,
    metadata: raw.metadata as Record<string, unknown> | undefined,
  };
}

export function useAuditTrail(
  sessionId: string | null,
  filters?: { eventType?: string; userId?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }
) {
  return useQuery({
    queryKey: ['audit-events', sessionId, filters],
    queryFn: async (): Promise<{ events: AuditEvent[]; total: number; chainIntegrity: boolean }> => {
      if (!sessionId) throw new Error('No sessionId');
      const params: Record<string, string> = {};
      if (filters?.eventType) params.eventType = filters.eventType;
      if (filters?.userId) params.userId = filters.userId;
      if (filters?.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters?.dateTo) params.dateTo = filters.dateTo;
      if (filters?.limit != null) params.limit = String(filters.limit);
      if (filters?.offset != null) params.offset = String(filters.offset);

      const res = await apiFetch<AuditResponse>(
        `/api/close/sessions/${sessionId}/audit-events`,
        { params }
      );
      const events = (res.events ?? []).map((e) =>
        toAuditEvent(e as Record<string, unknown>, sessionId)
      );
      return { events, total: res.total ?? events.length, chainIntegrity: res.chainIntegrity ?? true };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
