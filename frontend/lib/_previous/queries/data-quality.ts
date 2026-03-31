'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 30_000;

// --- Types ---

export interface DataQualityRule {
  id: string;
  name: string;
  scope: 'trial_balance' | 'balance_sheet' | 'invoice';
  type: 'balance' | 'threshold' | 'variance';
  config: { accountPattern?: string; threshold?: number; comparisonPeriod?: string; min?: number; max?: number };
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DataQualityException {
  id: string;
  ruleId: string;
  periodLabel?: string;
  sourceId?: string;
  status: 'open' | 'acknowledged' | 'resolved';
  message: string;
  metric?: number;
  severity: 'info' | 'warning' | 'critical';
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataQualitySummary {
  bySeverity: Record<string, number>;
  byRule: Record<string, number>;
  total: number;
}

export interface CloseControl {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  frequency?: 'monthly' | 'quarterly' | 'annual';
  evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off';
}

export interface ControlAssertion {
  id: string;
  controlId: string;
  assertionLabel: string;
  riskCategory?: string;
  createdAt: string;
}

export interface ControlEvidenceRow {
  id: string;
  controlId: string;
  evidenceType: string;
  evidenceId: string;
  periodLabel: string;
  createdAt: string;
}

// --- Data Quality ---

export function useDataQualityRules() {
  return useQuery({
    queryKey: ['dq-rules'],
    queryFn: async (): Promise<DataQualityRule[]> => {
      const res = await apiFetch<{ rules: DataQualityRule[] }>('/api/data-quality/rules');
      return res.rules ?? [];
    },
    staleTime: 60_000,
  });
}

export function useDataQualityExceptions(periodLabel?: string, status?: string) {
  return useQuery({
    queryKey: ['dq-exceptions', periodLabel, status],
    queryFn: async (): Promise<DataQualityException[]> => {
      const params: Record<string, string> = {};
      if (periodLabel) params.periodLabel = periodLabel;
      if (status) params.status = status;
      const res = await apiFetch<{ exceptions: DataQualityException[] }>('/api/data-quality/exceptions', { params });
      return res.exceptions ?? [];
    },
    staleTime: STALE_TIME,
  });
}

export function useDataQualitySummary(periodLabel?: string) {
  return useQuery({
    queryKey: ['dq-summary', periodLabel],
    queryFn: async (): Promise<DataQualitySummary> => {
      const params: Record<string, string> = {};
      if (periodLabel) params.periodLabel = periodLabel;
      return apiFetch<DataQualitySummary>('/api/data-quality/summary', { params });
    },
    staleTime: STALE_TIME,
  });
}

export function useRunDataQuality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { scope: string; periodLabel?: string }) => {
      return apiFetch<{ created: number; exceptions: DataQualityException[] }>(
        '/api/data-quality/run',
        { method: 'POST', body: params }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-exceptions'] });
      qc.invalidateQueries({ queryKey: ['dq-summary'] });
    },
  });
}

export function useAcknowledgeException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; acknowledgedBy: string }) => {
      return apiFetch<DataQualityException>(
        `/api/data-quality/exceptions/${params.id}`,
        { method: 'PATCH', body: { status: 'acknowledged', acknowledgedBy: params.acknowledgedBy } }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-exceptions'] });
      qc.invalidateQueries({ queryKey: ['dq-summary'] });
    },
  });
}

export function useResolveException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; resolvedBy: string; note?: string }) => {
      return apiFetch<DataQualityException>(
        `/api/data-quality/exceptions/${params.id}`,
        { method: 'PATCH', body: { status: 'resolved', resolvedBy: params.resolvedBy, note: params.note } }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-exceptions'] });
      qc.invalidateQueries({ queryKey: ['dq-summary'] });
    },
  });
}

// --- Controls ---

export function useControls() {
  return useQuery({
    queryKey: ['controls'],
    queryFn: async (): Promise<CloseControl[]> => {
      const res = await apiFetch<{ controls: CloseControl[] }>('/api/close/controls');
      return res.controls ?? [];
    },
    staleTime: 60_000,
  });
}

export function useControlAssertions(controlId: string | null) {
  return useQuery({
    queryKey: ['control-assertions', controlId],
    queryFn: async (): Promise<ControlAssertion[]> => {
      const res = await apiFetch<{ assertions: ControlAssertion[] }>(`/api/close/controls/${controlId}/assertions`);
      return res.assertions ?? [];
    },
    enabled: !!controlId,
    staleTime: 60_000,
  });
}

export function useControlEvidence(periodLabel: string | null) {
  return useQuery({
    queryKey: ['control-evidence', periodLabel],
    queryFn: async (): Promise<ControlEvidenceRow[]> => {
      const res = await apiFetch<{ evidence: ControlEvidenceRow[] }>('/api/close/control-evidence', {
        params: { periodLabel: periodLabel! },
      });
      return res.evidence ?? [];
    },
    enabled: !!periodLabel,
    staleTime: STALE_TIME,
  });
}
