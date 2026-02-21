'use client';

import { useQuery } from '@tanstack/react-query';
import { getStatementsBySession } from '@/lib/mock/statements';
import { getValidationBySession } from '@/lib/mock/validation';

const STALE_TIME = 30_000;

export function useStatements(sessionId: string | null) {
  return useQuery({
    queryKey: ['statements', sessionId],
    queryFn: () => getStatementsBySession(sessionId!),
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useValidation(sessionId: string | null) {
  return useQuery({
    queryKey: ['validation', sessionId],
    queryFn: () => getValidationBySession(sessionId!),
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
