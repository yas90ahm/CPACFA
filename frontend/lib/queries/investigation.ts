'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { InvestigationResult, AccountDrilldown, ChatResponse } from '@/lib/types/investigation';

export function useInvestigateVariance(sessionId: string | null) {
  return useMutation({
    mutationFn: async (params: {
      fs_line_id: string;
      current_period_id: string;
      prior_period_id: string;
    }): Promise<InvestigationResult> => {
      if (!sessionId) throw new Error('No sessionId');
      return apiFetch<InvestigationResult>(
        `/api/close/sessions/${sessionId}/investigate`,
        { method: 'POST', body: params }
      );
    },
  });
}

export function useDrilldownAccount(sessionId: string | null) {
  return useMutation({
    mutationFn: async (params: {
      account_code: string;
      period_id: string;
    }): Promise<AccountDrilldown> => {
      if (!sessionId) throw new Error('No sessionId');
      return apiFetch<AccountDrilldown>(
        `/api/close/sessions/${sessionId}/investigate/drilldown`,
        { method: 'POST', body: params }
      );
    },
  });
}

export function useInvestigateChat(sessionId: string | null) {
  return useMutation({
    mutationFn: async (params: {
      fs_line_id: string;
      question: string;
      conversation_history: Array<{ role: 'user' | 'assistant'; content: string }>;
    }): Promise<ChatResponse> => {
      if (!sessionId) throw new Error('No sessionId');
      return apiFetch<ChatResponse>(
        `/api/close/sessions/${sessionId}/investigate/chat`,
        { method: 'POST', body: params }
      );
    },
  });
}
