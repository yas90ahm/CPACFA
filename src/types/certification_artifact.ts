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

export interface ValidationStateCheck {
  check_name: string;
  check_type: 'hard' | 'soft';
  passes: boolean;
  message: string | null;
}

/** AI usage summary captured at certification time for audit/verification. */
export interface CertificationArtifactAiMetadata {
  /** Total AI-assisted COA mapping decisions accepted this session. */
  coaMappingSuggestionsAccepted: number;
  /** Total AI-assisted COA mapping decisions edited before acceptance. */
  coaMappingSuggestionsEdited: number;
  /** Total AI-assisted COA mapping decisions rejected. */
  coaMappingSuggestionsRejected: number;
  /** Total variance explanations sourced from AI draft (accepted as-is). */
  varianceExplanationsAiDraft: number;
  /** Total variance explanations where AI draft was edited by human. */
  varianceExplanationsAiEdited: number;
  /** Total variance explanations written manually (no AI). */
  varianceExplanationsManual: number;
  /** Decision record count for this session (explainability log). */
  decisionRecordCount: number;
  /** AI call log entries for this tenant (total, not session-scoped). */
  aiCallLogCount: number;
  /** Model identifiers observed in decision records for this session. */
  modelVersions: string[];
  /** Confidence tier distribution from decision records: { high: n, medium: n, low: n }. */
  confidenceTiers: { high: number; medium: number; low: number };
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
  /** Cross-statement tie checks at moment of certification. */
  validationStateAtCertification?: ValidationStateCheck[];
  /** AI usage metadata captured at certification — advisory only. */
  aiMetadata?: CertificationArtifactAiMetadata;
  mode: 'dev' | 'demo' | 'staging' | 'prod';
}
