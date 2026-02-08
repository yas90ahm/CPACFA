/**
 * Evidence policy repository — tenant-scoped.
 * Default when no policy: enforcement_mode = 'off'.
 */

import type { Pool } from 'pg';
import type { EvidencePolicy, UpsertEvidencePolicyInput } from '../../types/evidence_policy.js';

interface EvidencePolicyRow {
  tenant_id: string;
  enforcement_mode: string;
  materiality_threshold: string | null;
  required_assertion_types: Record<string, string[]> | null;
  created_at: string;
  updated_at: string;
}

function rowToPolicy(row: EvidencePolicyRow): EvidencePolicy {
  return {
    tenantId: row.tenant_id,
    enforcementMode: row.enforcement_mode as EvidencePolicy['enforcementMode'],
    materialityThreshold: row.materiality_threshold ?? undefined,
    requiredAssertionTypes: row.required_assertion_types ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getEvidencePolicy(
  pool: Pool,
  tenantId: string
): Promise<EvidencePolicy | null> {
  const r = await pool.query<EvidencePolicyRow>(
    `SELECT tenant_id, enforcement_mode, materiality_threshold, required_assertion_types, created_at, updated_at
     FROM evidence_policy WHERE tenant_id = $1`,
    [tenantId]
  );
  if (r.rows.length === 0) return null;
  return rowToPolicy(r.rows[0]);
}

export async function upsertEvidencePolicy(
  pool: Pool,
  input: UpsertEvidencePolicyInput
): Promise<EvidencePolicy> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO evidence_policy (tenant_id, enforcement_mode, materiality_threshold, required_assertion_types, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (tenant_id) DO UPDATE SET
       enforcement_mode = EXCLUDED.enforcement_mode,
       materiality_threshold = EXCLUDED.materiality_threshold,
       required_assertion_types = EXCLUDED.required_assertion_types,
       updated_at = EXCLUDED.updated_at`,
    [
      input.tenantId,
      input.enforcementMode,
      input.materialityThreshold ?? null,
      input.requiredAssertionTypes ? JSON.stringify(input.requiredAssertionTypes) : null,
      now,
    ]
  );
  const policy = await getEvidencePolicy(pool, input.tenantId);
  return policy!;
}
