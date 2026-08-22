/**
 * Certification artifact repository — tenant-scoped.
 */

import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;
import type { CertificationArtifactV1 } from '../../types/certification_artifact.js';

interface ArtifactRow {
  id: string;
  tenant_id: string;
  close_session_id: string;
  period_label: string;
  artifact_json: unknown;
  artifact_hash: string;
  signature_b64: string;
  public_key_b64: string;
  alg: string;
  created_at: string;
}

export interface InsertCertificationArtifactParams {
  tenantId: string;
  closeSessionId: string;
  periodLabel: string;
  artifact: CertificationArtifactV1;
  artifactHash: string;
  signatureB64: string;
  publicKeyB64: string;
  alg: string;
}

export async function insertCertificationArtifact(
  client: Queryable,
  params: InsertCertificationArtifactParams
): Promise<{ id: string }> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO certification_artifacts (
      tenant_id, close_session_id, period_label,
      artifact_json, artifact_hash, signature_b64, public_key_b64, alg
    ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
    RETURNING id`,
    [
      params.tenantId,
      params.closeSessionId,
      params.periodLabel,
      JSON.stringify(params.artifact),
      params.artifactHash,
      params.signatureB64,
      params.publicKeyB64,
      params.alg,
    ]
  );
  if (r.rows.length === 0) throw new Error('Insert certification_artifact did not return row');
  return { id: r.rows[0].id };
}

export async function getArtifactByCloseSessionId(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<{
  id: string;
  artifact: CertificationArtifactV1;
  artifactHash: string;
  signatureB64: string;
  publicKeyB64: string;
  alg: string;
  createdAt: string;
} | null> {
  const r = await pool.query<ArtifactRow>(
    `SELECT id, tenant_id, close_session_id, period_label, artifact_json, artifact_hash,
      signature_b64, public_key_b64, alg, created_at
     FROM certification_artifacts
     WHERE tenant_id = $1 AND close_session_id = $2`,
    [tenantId, closeSessionId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    artifact: row.artifact_json as CertificationArtifactV1,
    artifactHash: row.artifact_hash,
    signatureB64: row.signature_b64,
    publicKeyB64: row.public_key_b64,
    alg: row.alg,
    createdAt: typeof row.created_at === 'string' ? row.created_at : (row.created_at as Date).toISOString(),
  };
}

export async function getArtifactById(
  pool: Pool,
  tenantId: string,
  artifactId: string
): Promise<{
  id: string;
  artifact: CertificationArtifactV1;
  artifactHash: string;
  signatureB64: string;
  publicKeyB64: string;
  alg: string;
  createdAt: string;
} | null> {
  const r = await pool.query<ArtifactRow>(
    `SELECT id, tenant_id, close_session_id, period_label, artifact_json, artifact_hash,
      signature_b64, public_key_b64, alg, created_at
     FROM certification_artifacts
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, artifactId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    artifact: row.artifact_json as CertificationArtifactV1,
    artifactHash: row.artifact_hash,
    signatureB64: row.signature_b64,
    publicKeyB64: row.public_key_b64,
    alg: row.alg,
    createdAt: typeof row.created_at === 'string' ? row.created_at : (row.created_at as Date).toISOString(),
  };
}

/**
 * Get the most recent certified period's retained earnings from the ledger snapshot.
 * Returns null if no prior certified period exists (first close).
 */
export async function getPriorPeriodRetainedEarnings(
  client: Queryable,
  tenantId: string,
  entityId: string,
  currentPeriodLabel: string
): Promise<number | null> {
  // Find the most recent still-certified artifact for this entity before the current period.
  const r = await client.query<{ artifact_json: unknown }>(
    `SELECT ca.artifact_json
     FROM certification_artifacts ca
     JOIN close_sessions cs
       ON cs.id = ca.close_session_id AND cs.tenant_id = ca.tenant_id
     WHERE ca.tenant_id = $1
       AND cs.entity_id = $2
       AND ca.period_label < $3
       AND cs.status IN ('certified', 'subsequent_events_review', 'locked')
     ORDER BY ca.period_label DESC LIMIT 1`,
    [tenantId, entityId, currentPeriodLabel]
  );
  if (r.rows.length === 0) return null;

  // Extract snapshot ID from the artifact, then look up the snapshot's TB
  const artifact = r.rows[0].artifact_json as CertificationArtifactV1;
  const snapshotId = artifact?.snapshot?.snapshotId;
  if (!snapshotId) return null;

  const snap = await client.query<{ snapshot_payload_json: unknown }>(
    `SELECT snapshot_payload_json FROM ledger_snapshots WHERE id = $1 AND tenant_id = $2`,
    [snapshotId, tenantId]
  );
  if (snap.rows.length === 0) return null;

  const payload = snap.rows[0].snapshot_payload_json as { trialBalance?: { entries?: Array<{ accountName: string; debit: number; credit: number; accountType?: string }> } };
  const entries = payload?.trialBalance?.entries;
  if (!entries) return null;

  // Find retained earnings in the TB: equity accounts matching "retained earnings"
  const reEntries = entries.filter((e) => /retained earnings/i.test(e.accountName));
  if (reEntries.length === 0) return null;

  // RE is a credit-normal account: balance = credit - debit
  let total = 0;
  for (const e of reEntries) {
    total += (e.credit ?? 0) - (e.debit ?? 0);
  }
  return Math.round(total * 100) / 100;
}

export async function existsForCloseSession(
  client: Queryable,
  tenantId: string,
  closeSessionId: string
): Promise<boolean> {
  const r = await client.query<{ n: number }>(
    'SELECT 1 AS n FROM certification_artifacts WHERE tenant_id = $1 AND close_session_id = $2 LIMIT 1',
    [tenantId, closeSessionId]
  );
  return r.rows.length > 0;
}
