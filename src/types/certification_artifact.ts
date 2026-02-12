/**
 * Certification Artifact v1 — signed attestation for certified closes.
 * Verifiable even if server is compromised; Ed25519 signature over artifact hash.
 */

export interface CertificationArtifactSnapshot {
  snapshotId: string;
  snapshotHash: string;
  hashVersion: string;
}

export interface CertificationArtifactAuditChain {
  lastEntryId: string;
  lastEntryHash: string;
  entryCount: number;
  verifiedAt: string;
}

export interface CertificationArtifactEvidenceManifest {
  manifestId: string;
  manifestHash: string;
  hashVersion: string;
}

export interface CertificationArtifactV1 {
  contractVersion: 'v1';
  artifactId: string;
  tenantId: string;
  closeSessionId: string;
  periodLabel: string;
  certifiedAt: string;
  certifiedBy: string | null;
  snapshot: CertificationArtifactSnapshot;
  auditChain?: CertificationArtifactAuditChain;
  evidenceManifest?: CertificationArtifactEvidenceManifest;
  mode: 'dev' | 'demo' | 'staging' | 'prod';
}
