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
  CertificationArtifactAiMetadata,
  CertificationArtifactGateSnapshot,
} from '../types/certification_artifact.js';
import type { Pool, PoolClient } from 'pg';
import type { LedgerSnapshotPayload } from '../types/ledger_snapshot.js';
import type { AuditLedgerVerifyResult } from '../types/audit_ledger.js';
import { listDecisionRecords } from '../db/repositories/decision_record_repository.js';
import { listVariancesForSession } from '../db/repositories/variance_analysis_repository.js';

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
  /** AI usage metadata gathered at certification time. */
  aiMetadata?: CertificationArtifactAiMetadata;
  /** Gate readiness snapshot at moment of certification. */
  gateSnapshot?: CertificationArtifactGateSnapshot;
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
    ...(input.aiMetadata && { aiMetadata: input.aiMetadata }),
    ...(input.gateSnapshot && { gateSnapshot: input.gateSnapshot }),
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

type Queryable = Pool | PoolClient;

/** Gather AI usage metadata at certification time from decision records, variances, and audit ledger. */
export async function gatherAiMetadata(
  pool: Queryable,
  tenantId: string,
  closeSessionId: string
): Promise<CertificationArtifactAiMetadata> {
  // Gather decision records for this session
  // Cast to Pool since both Pool and PoolClient expose .query() — repos typed for Pool only
  const queryPool = pool as Pool;
  const decisions = await listDecisionRecords(queryPool, { tenantId, closeSessionId });

  // Count COA mapping AI suggestion events from audit ledger
  const aiMappingCounts = { accepted: 0, edited: 0, rejected: 0 };
  try {
    const r = await pool.query<{ event_type: string; cnt: string }>(
      `SELECT event_type, COUNT(*)::text AS cnt FROM audit_ledger
       WHERE tenant_id = $1 AND event_type IN ('ai_mapping_suggestion_accepted', 'ai_mapping_suggestion_edited', 'ai_mapping_suggestion_rejected')
       GROUP BY event_type`,
      [tenantId]
    );
    for (const row of r.rows) {
      if (row.event_type === 'ai_mapping_suggestion_accepted') aiMappingCounts.accepted = parseInt(row.cnt, 10);
      else if (row.event_type === 'ai_mapping_suggestion_edited') aiMappingCounts.edited = parseInt(row.cnt, 10);
      else if (row.event_type === 'ai_mapping_suggestion_rejected') aiMappingCounts.rejected = parseInt(row.cnt, 10);
    }
  } catch (_) {
    /* non-fatal */
  }

  // Count variance explanation sources for this session
  const variances = await listVariancesForSession(queryPool, tenantId, closeSessionId);
  let aiDraftCount = 0;
  let aiEditedCount = 0;
  let manualCount = 0;
  for (const v of variances) {
    if (v.explanationSource === 'ai_draft') aiDraftCount++;
    else if (v.explanationSource === 'ai_edited') aiEditedCount++;
    else if (v.explanation) manualCount++;
  }

  // Extract model versions and confidence tiers from decision records
  const modelVersionSet = new Set<string>();
  const tiers = { high: 0, medium: 0, low: 0 };
  for (const d of decisions) {
    if (d.engineVersion) modelVersionSet.add(d.engineVersion);
    if (d.confidenceScore != null) {
      if (d.confidenceScore >= 0.9) tiers.high++;
      else if (d.confidenceScore >= 0.7) tiers.medium++;
      else tiers.low++;
    }
  }

  // Count AI call log entries for this tenant
  let aiCallLogCount = 0;
  try {
    const r = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM ai_call_log WHERE tenant_id = $1`,
      [tenantId]
    );
    aiCallLogCount = parseInt(r.rows[0]?.cnt ?? '0', 10);
  } catch (_) {
    /* non-fatal: table may not exist in some environments */
  }

  return {
    coaMappingSuggestionsAccepted: aiMappingCounts.accepted,
    coaMappingSuggestionsEdited: aiMappingCounts.edited,
    coaMappingSuggestionsRejected: aiMappingCounts.rejected,
    varianceExplanationsAiDraft: aiDraftCount,
    varianceExplanationsAiEdited: aiEditedCount,
    varianceExplanationsManual: manualCount,
    decisionRecordCount: decisions.length,
    aiCallLogCount,
    modelVersions: [...modelVersionSet].sort(),
    confidenceTiers: tiers,
  };
}
