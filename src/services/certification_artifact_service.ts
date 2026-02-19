/**
 * Certification Artifact v1 — build, hash, sign attestation for certified closes.
 */

import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { canonicalStringifyKeysOnly } from '../lib/canonical_json.js';
import { signArtifactHash } from '../lib/cert_signing.js';
import { getMode } from '../lib/runtime_mode.js';
import { hashManifestContent } from '../lib/snapshot_hash.js';
import type {
  CertificationArtifactV1,
  CertificationArtifactSnapshot,
  CertificationArtifactAuditChain,
  CertificationArtifactEvidenceManifest,
} from '../types/certification_artifact.js';
import type { LedgerSnapshotPayload } from '../types/ledger_snapshot.js';
import type { AuditLedgerVerifyResult } from '../types/audit_ledger.js';

export function computeArtifactHash(artifact: CertificationArtifactV1): string {
  const canonical = canonicalStringifyKeysOnly(artifact);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export interface BuildArtifactInput {
  tenantId: string;
  closeSessionId: string;
  periodLabel: string;
  certifiedAt: string;
  certifiedBy: string | null;
  snapshotId: string;
  snapshotHash: string;
  hashVersion: number;
  snapshotPayload: LedgerSnapshotPayload;
  auditChainResult?: AuditLedgerVerifyResult;
  /** Cross-statement validation at certification. */
  validationStateAtCertification?: Array<{ check_name: string; check_type: 'hard' | 'soft'; passes: boolean; message: string | null }>;
}

export function buildCertificationArtifact(input: BuildArtifactInput): {
  artifact: CertificationArtifactV1;
  artifactHash: string;
  signatureB64: string;
  publicKeyB64: string;
  alg: string;
  signed: boolean;
} {
  const mode = getMode();
  const snapshot: CertificationArtifactSnapshot = {
    snapshotId: input.snapshotId,
    snapshotHash: input.snapshotHash,
    hashVersion: String(input.hashVersion),
  };

  let auditChain: CertificationArtifactAuditChain | undefined;
  if (input.auditChainResult?.valid && input.auditChainResult.latestEntryId && input.auditChainResult.latestEntryHash) {
    auditChain = {
      lastEntryId: input.auditChainResult.latestEntryId,
      lastEntryHash: input.auditChainResult.latestEntryHash,
      entryCount: input.auditChainResult.entryCount,
      verifiedAt: input.auditChainResult.verifiedAt,
    };
  }

  let evidenceManifest: CertificationArtifactEvidenceManifest | undefined;
  const manifest = input.snapshotPayload.evidenceManifest;
  if (manifest && manifest.journalEntries && manifest.journalEntries.length > 0) {
    const manifestHash = hashManifestContent(manifest);
    evidenceManifest = {
      manifestId: randomUUID(),
      manifestHash,
      hashVersion: 'v1',
    };
  }

  const artifact: CertificationArtifactV1 = {
    contractVersion: 'v1',
    artifactId: randomUUID(),
    tenantId: input.tenantId,
    closeSessionId: input.closeSessionId,
    periodLabel: input.periodLabel,
    certifiedAt: input.certifiedAt,
    certifiedBy: input.certifiedBy,
    snapshot,
    ...(auditChain && { auditChain }),
    ...(evidenceManifest && { evidenceManifest }),
    ...(input.validationStateAtCertification && input.validationStateAtCertification.length > 0 && {
      validationStateAtCertification: input.validationStateAtCertification,
    }),
    mode,
  };

  const artifactHash = computeArtifactHash(artifact);
  const signResult = signArtifactHash(artifactHash);

  return {
    artifact,
    artifactHash,
    signatureB64: signResult.signed ? signResult.signatureB64 : '',
    publicKeyB64: signResult.signed ? signResult.publicKeyB64 : '',
    alg: signResult.alg,
    signed: signResult.signed,
  };
}
