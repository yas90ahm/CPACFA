'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type AccountFlag =
  | 'junk_account'
  | 'test_account'
  | 'inactive'
  | 'suspense_clearing'
  | 'duplicate_candidate'
  | 'contra_undetected'
  | 'balance_direction_mismatch'
  | 'industry_specific'
  | 'intercompany'
  | 'zero_balance_zero_activity';

export interface AccountIntelligence {
  accountCode: string;
  accountName: string;
  flags: AccountFlag[];
  suggestedAction: 'map' | 'exclude' | 'investigate' | 'merge';
  suggestedMapping?: string;
  confidence: number;
  reasoning: string;
}

export interface GLQualityAnalysis {
  totalAccounts: number;
  flaggedAccounts: AccountIntelligence[];
  cleanAccounts: number;
  summary: {
    junk: number;
    suspense: number;
    duplicates: number;
    contras: number;
    balanceMismatch: number;
    inactive: number;
    intercompany: number;
  };
}

export function useGLQualityAnalysis(sessionId: string) {
  return useQuery({
    queryKey: ['gl-quality', sessionId],
    queryFn: async (): Promise<GLQualityAnalysis> => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<GLQualityAnalysis>(
        '/api/gl/analyze-quality',
        { method: 'POST', body: { sessionId } }
      );
      return res;
    },
    enabled: !!sessionId,
    staleTime: 60_000,
  });
}

export function useExcludeAccounts(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountCodes: string[]): Promise<{ excluded: number }> => {
      if (!sessionId) throw new Error('No sessionId');
      return apiFetch<{ excluded: number }>(
        '/api/gl/exclude-accounts',
        { method: 'POST', body: { sessionId, accountCodes } }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gl-quality', sessionId] });
      qc.invalidateQueries({ queryKey: ['coa-mapping'] });
      qc.invalidateQueries({ queryKey: ['trial-balance', sessionId] });
    },
  });
}
