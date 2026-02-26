'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { CertificationArtifact } from '@/lib/types/certification';

const STALE_TIME = 30_000;

export function useCertification(sessionId: string | null) {
  return useQuery({
    queryKey: ['certification', sessionId],
    queryFn: async (): Promise<CertificationArtifact | null> => {
      if (!sessionId) throw new Error('No sessionId');
      try {
        const raw = await apiFetch<Record<string, unknown>>(
          `/api/verification/certification/artifacts/${sessionId}`
        );
        if (!raw) return null;
        return {
          id: (raw.id as string) ?? '',
          sessionId,
          certifiedBy: (raw.certifiedBy as string) ?? '',
          certifiedAt: (raw.certifiedAt as string) ?? '',
          snapshotHash: (raw.snapshotHash as string) ?? '',
          signature: (raw.signature as string) ?? '',
          publicKey: (raw.publicKey as string) ?? '',
          validationResults: ((raw.validationResults as Array<{ check: string; passed: boolean; detail: string }>) ?? []).map((v) => ({
            check: v.check,
            passed: v.passed,
            detail: v.detail,
          })),
          verified: (raw.verified as boolean) ?? false,
        };
      } catch {
        return null;
      }
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
