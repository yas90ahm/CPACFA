'use client';

import { useMutation } from '@tanstack/react-query';
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
