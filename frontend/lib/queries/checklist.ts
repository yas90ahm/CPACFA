'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 30_000;

// --- Types ---

export interface ChecklistStep {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  category?: string;
  verificationMethod?: string;
  completedAt?: string;
  completedBy?: string;
  note?: string;
  assignee?: string;
  dueDate?: string;
  signedOffBy?: string;
  signedOffAt?: string;
  controlId?: string;
  evidenceId?: string;
  evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off';
}

export interface ChecklistItem {
  id: string;
  closeSessionId: string;
  code: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  required: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  stepsSpec: { label: string; category?: string; controlId?: string; dueOffsetDays?: number; assignee?: string; verificationMethod?: string }[];
  periodType: 'monthly' | 'quarterly' | 'annual';
  updatedAt: string;
}

// --- Period Checklist ---

export function usePeriodChecklist(periodLabel: string | null) {
  return useQuery({
    queryKey: ['period-checklist', periodLabel],
    queryFn: async (): Promise<{ periodLabel: string; steps: ChecklistStep[] }> => {
      return apiFetch<{ periodLabel: string; steps: ChecklistStep[] }>(
        `/api/close/checklist/${periodLabel}`
      );
    },
    enabled: !!periodLabel,
    staleTime: STALE_TIME,
  });
}

export function useCreatePeriodChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { periodLabel: string; assignee?: string; dueDate?: string }) => {
      return apiFetch<{ periodLabel: string; steps: ChecklistStep[] }>(
        '/api/close/checklist',
        { method: 'POST', body: params }
      );
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['period-checklist', vars.periodLabel] });
    },
  });
}

export function useSignOffStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { periodLabel: string; stepId: string; signedOffBy: string; steps: ChecklistStep[] }) => {
      return apiFetch<{ periodLabel: string; steps: ChecklistStep[] }>(
        '/api/close/checklist-sign-off',
        { method: 'POST', body: params }
      );
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['period-checklist', vars.periodLabel] });
    },
  });
}

export function useAssignTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { periodLabel: string; stepId: string; assignee: string; dueDate: string; steps: ChecklistStep[] }) => {
      return apiFetch<{ steps: ChecklistStep[] }>(
        '/api/close/task-assign',
        { method: 'POST', body: params }
      );
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['period-checklist', vars.periodLabel] });
    },
  });
}

// --- Session Checklist Items ---

export function useSessionChecklist(sessionId: string | null) {
  return useQuery({
    queryKey: ['session-checklist', sessionId],
    queryFn: async (): Promise<ChecklistItem[]> => {
      const res = await apiFetch<{ items: ChecklistItem[] }>(
        `/api/close/sessions/${sessionId}/checklist`
      );
      return res.items ?? [];
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useInitializeChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      return apiFetch<{ items: ChecklistItem[]; created: boolean }>(
        `/api/close/sessions/${sessionId}/checklist/initialize`,
        { method: 'POST' }
      );
    },
    onSuccess: (_, sessionId) => {
      qc.invalidateQueries({ queryKey: ['session-checklist', sessionId] });
      qc.invalidateQueries({ queryKey: ['readiness'] });
    },
  });
}

export function useCompleteChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { itemId: string; completedBy: string; notes?: string }) => {
      return apiFetch<ChecklistItem>(
        `/api/close/checklist-items/${params.itemId}/complete`,
        { method: 'POST', body: { completedBy: params.completedBy, notes: params.notes } }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-checklist'] });
      qc.invalidateQueries({ queryKey: ['readiness'] });
    },
  });
}

export function useSkipChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { itemId: string; completedBy: string; notes?: string }) => {
      return apiFetch<ChecklistItem>(
        `/api/close/checklist-items/${params.itemId}/skip`,
        { method: 'POST', body: { completedBy: params.completedBy, notes: params.notes } }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-checklist'] });
      qc.invalidateQueries({ queryKey: ['readiness'] });
    },
  });
}

// --- Templates ---

export function useChecklistTemplates(periodType?: string) {
  return useQuery({
    queryKey: ['checklist-templates', periodType],
    queryFn: async (): Promise<ChecklistTemplate[]> => {
      const params = periodType ? { periodType } : undefined;
      const res = await apiFetch<{ templates: ChecklistTemplate[] }>(
        '/api/close/checklist-templates',
        { params }
      );
      return res.templates ?? [];
    },
    staleTime: 60_000,
  });
}
