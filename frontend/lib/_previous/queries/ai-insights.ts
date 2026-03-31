'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 30_000;

// --- HITL Staging Items ---

export interface StagingItem {
  id: string;
  proposedAction: string;
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  type: string;
  proposalType?: string;
  description?: string | null;
  confidence?: number | null;
  amount?: string | null;
  payload?: Record<string, unknown>;
  createdAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
}

export function useHITLStaging(status?: string) {
  return useQuery({
    queryKey: ['hitl-staging', status],
    queryFn: async (): Promise<StagingItem[]> => {
      const res = await apiFetch<{ items?: StagingItem[]; staging?: StagingItem[] }>(
        '/api/hitl/staging',
        { params: status ? { status } : undefined }
      );
      return res.items ?? res.staging ?? [];
    },
    staleTime: STALE_TIME,
  });
}

export function useResolveStaging() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      action: 'approve' | 'reject';
      reason?: string;
    }) => {
      return apiFetch<{ ok: boolean; item: StagingItem }>(
        '/api/hitl/resolve',
        { method: 'POST', body: params }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hitl-staging'] });
      qc.invalidateQueries({ queryKey: ['readiness'] });
    },
  });
}

// --- Decision Records ---

export interface DecisionRecord {
  id: string;
  closeSessionId: string | null;
  tenantId: string;
  decisionType: string;
  subjectRef: Record<string, unknown>;
  inputHash: string | null;
  inputSnapshot: Record<string, unknown> | null;
  outputSnapshot: Record<string, unknown> | null;
  confidenceScore: number | null;
  rationaleText: string | null;
  engineVersion: string | null;
  promptSnapshot: string | null;
  createdAt: string;
}

export function useDecisionRecords(sessionId: string | null = null, decisionType?: string) {
  return useQuery({
    queryKey: ['decision-records', sessionId, decisionType],
    queryFn: async (): Promise<DecisionRecord[]> => {
      const params: Record<string, string> = {};
      if (sessionId) params.closeSessionId = sessionId;
      if (decisionType) params.decisionType = decisionType;
      params.limit = '50';
      const res = await apiFetch<{ records: DecisionRecord[] }>(
        '/api/close/decision-records',
        { params }
      );
      return res.records ?? [];
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

// --- Justifications ---

export interface Justification {
  id: string;
  tenantId?: string;
  periodLabel: string;
  relatedType: string;
  relatedId: string;
  createdBy: string | null;
  createdByType: 'user' | 'agent';
  iracJson: {
    irac?: {
      issue?: string;
      rule?: string;
      analysis?: string;
      conclusion?: string;
    };
    sourceTag?: string;
    formatted?: string;
  } | null;
  memoMarkdown: string | null;
  promptVersion: string | null;
  model: string | null;
  createdAt: string;
}

export function useJustifications(periodStart?: string, periodEnd?: string) {
  return useQuery({
    queryKey: ['justifications', periodStart, periodEnd],
    queryFn: async (): Promise<Justification[]> => {
      const params: Record<string, string> = {};
      if (periodStart) params.periodStart = periodStart;
      if (periodEnd) params.periodEnd = periodEnd;
      const res = await apiFetch<{ justifications: Justification[] }>(
        '/api/justification/list',
        { params }
      );
      return res.justifications ?? [];
    },
    staleTime: 60_000,
  });
}
