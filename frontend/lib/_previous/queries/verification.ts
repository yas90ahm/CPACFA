'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 30_000;

// --- Types ---

export interface CertificationArtifact {
  id: string;
  sessionId: string;
  certifiedBy: string;
  certifiedAt: string;
  snapshotHash: string;
  signature: string;
  publicKey: string;
  validationResults: Array<{ check: string; passed: boolean; detail: string }>;
  verified: boolean;
}

export interface VerificationResult {
  contractVersion: string;
  artifactHash: string;
  signatureValid: boolean;
  snapshotHashMatches?: boolean;
  auditChainVerified?: boolean;
}

export interface AuditChainResult {
  contractVersion: string;
  auditChain: {
    tenantId: string;
    verified: boolean;
    entryCount: number;
    verifiedAt: string;
    lastEntryId?: string;
    lastEntryHash?: string;
    error?: { code: string; message: string; brokenAtEntryId?: string };
  };
  dbEnforcement: {
    appendOnlyTrigger: boolean;
    snapshotImmutabilityTrigger: boolean;
  };
}

export interface EvidenceManifest {
  contractVersion: string;
  snapshotId: string;
  supported: boolean;
  reason?: string;
  evidenceManifest?: {
    entryCount: number;
    storedManifestHash: string;
    recomputedManifestHash: string;
    matchesSnapshotBinding: boolean;
  };
  manifestDetails?: Array<{
    journalEntryId: string;
    evidenceId: string;
    hashSha256: string;
    assertionType: string;
    requiredness: string;
  }>;
}

export interface PublicKeyResult {
  publicKey: string;
  algorithm: string;
}

export interface SnapshotVerification {
  contractVersion: string;
  snapshot: {
    snapshotId: string;
    tenantId: string;
    closeSessionId: string;
    periodLabel: string;
    createdAt: string;
    hashVersion: string;
    storedHash: string;
    recomputedHash: string;
    hashMatches: boolean;
    includesGL: boolean;
  };
}

// --- Hooks ---

export function usePublicKey() {
  return useQuery({
    queryKey: ['verification-public-key'],
    queryFn: async (): Promise<PublicKeyResult> => {
      return apiFetch<PublicKeyResult>('/api/verification/certification/public-key');
    },
    staleTime: 300_000,
  });
}

export function useCertificationArtifact(sessionId: string | null) {
  return useQuery({
    queryKey: ['verification-artifact', sessionId],
    queryFn: async (): Promise<CertificationArtifact | null> => {
      try {
        return await apiFetch<CertificationArtifact>(`/api/verification/certification/artifacts/${sessionId}`);
      } catch (e: unknown) {
        if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 404) return null;
        throw e;
      }
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useVerifyCertification() {
  return useMutation({
    mutationFn: async (params: { closeSessionId: string }) => {
      return apiFetch<VerificationResult>('/api/verification/certification/verify', {
        method: 'POST',
        body: params,
      });
    },
  });
}

export function useAuditChain() {
  return useQuery({
    queryKey: ['verification-audit-chain'],
    queryFn: async (): Promise<AuditChainResult> => {
      return apiFetch<AuditChainResult>('/api/verification/audit-chain');
    },
    staleTime: STALE_TIME,
  });
}

export function useEvidenceManifest(snapshotId: string | null) {
  return useQuery({
    queryKey: ['verification-evidence-manifest', snapshotId],
    queryFn: async (): Promise<EvidenceManifest> => {
      return apiFetch<EvidenceManifest>(`/api/verification/evidence-manifest/${snapshotId}`, {
        params: { includeDetails: '1' },
      });
    },
    enabled: !!snapshotId,
    staleTime: STALE_TIME,
  });
}

export function useSnapshotVerification(snapshotId: string | null) {
  return useQuery({
    queryKey: ['verification-snapshot', snapshotId],
    queryFn: async (): Promise<SnapshotVerification> => {
      return apiFetch<SnapshotVerification>(`/api/verification/snapshots/${snapshotId}`);
    },
    enabled: !!snapshotId,
    staleTime: STALE_TIME,
  });
}
