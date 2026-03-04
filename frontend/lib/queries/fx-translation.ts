'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { TranslationResult, RemeasurementResult, TranslationLine } from '@/lib/types/fx-translation';

export function useTranslate() {
  return useMutation({
    mutationFn: (body: {
      lines: TranslationLine[];
      reportingCurrency: string;
      fxRates: { closing?: Record<string, number>; average?: Record<string, number>; historic?: Record<string, number> };
      method?: 'current_rate';
    }) =>
      apiFetch<{ result: TranslationResult }>('/api/fx/translate', { method: 'POST', body }),
  });
}

export function useRemeasure() {
  return useMutation({
    mutationFn: (body: {
      lines: TranslationLine[];
      functionalCurrency: string;
      fxRates: { closing?: Record<string, number>; average?: Record<string, number>; historic?: Record<string, number> };
    }) =>
      apiFetch<{ result: RemeasurementResult }>('/api/fx/remeasure', { method: 'POST', body }),
  });
}

export interface FxTranslationConfig {
  mode: string;
  sourceCurrency: string;
  reportingCurrency: string;
  closingRate: string | null;
  averageRate: string | null;
  historicalRate: string | null;
  balanceLines: TranslationLine[];
}

export function useFxTranslationConfig(sessionId: string) {
  return useQuery({
    queryKey: ['fx-translation-config', sessionId],
    queryFn: () =>
      apiFetch<{ config: FxTranslationConfig | null }>(`/api/close/sessions/${sessionId}/fx-translation/config`),
    enabled: !!sessionId,
  });
}

export function useSaveFxTranslationConfig(sessionId: string) {
  return useMutation({
    mutationFn: (body: FxTranslationConfig) =>
      apiFetch('/api/close/sessions/' + sessionId + '/fx-translation/config', { method: 'PUT', body }),
  });
}
