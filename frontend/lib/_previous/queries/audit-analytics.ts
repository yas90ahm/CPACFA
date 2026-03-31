'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface JEApprovalMetrics {
  avgHoursToPost: Record<string, number>;
  avgHoursToApprove: number | null;
  rejectionRate: number;
  totalJEs: number;
}

export interface AISuggestionMetrics {
  coaAcceptanceRate: number;
  cfAcceptanceRate: number;
  autoAcceptedCount: number;
  editedCount: number;
  rejectedCount: number;
  avgAcceptedConfidence: number | null;
  avgRejectedConfidence: number | null;
}

export interface ManualReviewAccount {
  accountCode: string;
  accountName: string;
  manualReviewCount: number;
  lastRejectedMapping: string | null;
}

export interface CloseVelocityTrend {
  periodLabel: string;
  daysToComplete: number;
  status: string;
}

export interface AuditAnalyticsResult {
  jeApproval: JEApprovalMetrics;
  aiSuggestions: AISuggestionMetrics;
  manualReviewAccounts: ManualReviewAccount[];
  velocityTrend: CloseVelocityTrend[];
  auditLedgerStats: {
    totalEntries: number;
    uniqueEventTypes: number;
    chainValid: boolean | null;
  };
}

const STALE_TIME = 60_000;

export function useAuditAnalytics(entityId: string | null, closeSessionId?: string) {
  return useQuery({
    queryKey: ['audit-analytics', entityId, closeSessionId],
    queryFn: async (): Promise<AuditAnalyticsResult> => {
      if (!entityId) throw new Error('No entityId');
      return apiFetch<AuditAnalyticsResult>(
        `/api/portfolio/analytics/${entityId}`,
        { params: closeSessionId ? { closeSessionId } : undefined }
      );
    },
    enabled: !!entityId,
    staleTime: STALE_TIME,
  });
}
