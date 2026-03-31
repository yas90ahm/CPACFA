'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 10_000;

// --- Types ---

export type OnboardingStepId =
  | 'welcome'
  | 'entity_info'
  | 'coa_import'
  | 'first_tb'
  | 'first_close_checklist'
  | 'first_statements'
  | 'complete';

export interface OnboardingState {
  tenantId: string;
  currentStep: OnboardingStepId;
  completedSteps: OnboardingStepId[];
  entityInfo?: { entityName?: string; fiscalYearEnd?: string; currency?: string };
  coaImported?: boolean;
  coaAccountCount?: number;
  firstTbUploaded?: boolean;
  firstCloseCompleted?: boolean;
  updatedAt: string;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  order: number;
  label: string;
  description?: string;
}

export interface CoAAccount {
  code: string;
  name: string;
}

export interface CoAImportResult {
  success: boolean;
  accountCount: number;
  errors?: string[];
  sampleAccounts?: CoAAccount[];
}

export interface CoAMappingSuggestion {
  accountCode: string;
  suggestedType: string;
  reason?: string;
}

export interface CoAMappingResult {
  suggestions: CoAMappingSuggestion[];
}

export interface FirstCloseGuideStep {
  order: number;
  label: string;
  description?: string;
}

export interface FirstCloseGuideResult {
  steps: FirstCloseGuideStep[];
}

// --- Hooks ---

export function useOnboardingState() {
  return useQuery({
    queryKey: ['onboarding-state'],
    queryFn: async (): Promise<OnboardingState> => {
      return apiFetch<OnboardingState>('/api/onboarding/state');
    },
    staleTime: STALE_TIME,
  });
}

export function useOnboardingSteps() {
  return useQuery({
    queryKey: ['onboarding-steps'],
    queryFn: async (): Promise<OnboardingStep[]> => {
      const res = await apiFetch<{ steps: OnboardingStep[] }>('/api/onboarding/steps');
      return res.steps ?? [];
    },
    staleTime: 60_000,
  });
}

export function useAdvanceOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stepId: OnboardingStepId) => {
      return apiFetch<OnboardingState>('/api/onboarding/advance', {
        method: 'POST',
        body: { stepId },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-state'] });
    },
  });
}

export function useSetEntityInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { entityName?: string; fiscalYearEnd?: string; currency?: string }) => {
      return apiFetch<OnboardingState>('/api/onboarding/entity-info', {
        method: 'POST',
        body: params,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-state'] });
    },
  });
}

export function useImportCoA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accounts: CoAAccount[]) => {
      return apiFetch<CoAImportResult>('/api/onboarding/coa-import', {
        method: 'POST',
        body: { accounts },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-state'] });
    },
  });
}

export function useSuggestCoAMapping() {
  return useMutation({
    mutationFn: async (accounts: CoAAccount[]) => {
      return apiFetch<CoAMappingResult>('/api/onboarding/suggest-coa-mapping', {
        method: 'POST',
        body: { accounts },
      });
    },
  });
}

export function useFirstCloseGuide() {
  return useMutation({
    mutationFn: async (params: { entityName?: string; fiscalYearEnd?: string }) => {
      return apiFetch<FirstCloseGuideResult>('/api/onboarding/first-close-guide', {
        method: 'POST',
        body: params,
      });
    },
  });
}

export function useMarkFirstTBUploaded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return apiFetch<OnboardingState>('/api/onboarding/first-tb-uploaded', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-state'] });
    },
  });
}

export function useMarkFirstCloseCompleted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return apiFetch<OnboardingState>('/api/onboarding/first-close-completed', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-state'] });
    },
  });
}
