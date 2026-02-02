/**
 * Risk context: QUALITATIVE_EVIDENCE_MISSING per tenant/period (Integration only).
 * Set when professional review runs with zero contract/lease narrative.
 */

import type { Pool } from 'pg';

export async function upsertQualitativeEvidenceMissing(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  missing: boolean
): Promise<void> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO risk_context_qualitative_evidence (tenant_id, period_label, qualitative_evidence_missing, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, period_label)
     DO UPDATE SET qualitative_evidence_missing = EXCLUDED.qualitative_evidence_missing, updated_at = EXCLUDED.updated_at`,
    [tenantId, periodLabel, missing, now]
  );
}

export async function getQualitativeEvidenceMissing(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<boolean> {
  const r = await pool.query<{ qualitative_evidence_missing: boolean }>(
    'SELECT qualitative_evidence_missing FROM risk_context_qualitative_evidence WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  return row ? Boolean(row.qualitative_evidence_missing) : false;
}
