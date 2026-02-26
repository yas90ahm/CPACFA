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
