/**
 * tenant_recon_requirements — which accounts require reconciliation per entity.
 */

import type { Pool } from 'pg';
import type { ReconRequirement, ReconExpectedSource, ReconToleranceType } from '../../types/period_reconciliation.js';

interface Row {
  requirement_id: string;
  tenant_id: string;
  entity_id: string;
  account_code: string;
  account_name: string | null;
  is_required: boolean;
  tolerance_amount: string;
  tolerance_type: string;
  tolerance_percentage: string | null;
  expected_source: string;
  requires_reviewer_approval: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const COLS = `requirement_id, tenant_id, entity_id, account_code, account_name, is_required,
  tolerance_amount, tolerance_type, tolerance_percentage, expected_source, requires_reviewer_approval,
  created_at, updated_at, created_by`;

function rowToReq(r: Row): ReconRequirement {
  return {
    requirementId: r.requirement_id,
    tenantId: r.tenant_id,
    entityId: r.entity_id,
    accountCode: r.account_code,
    accountName: r.account_name,
    isRequired: r.is_required,
    toleranceAmount: r.tolerance_amount,
    toleranceType: r.tolerance_type as ReconToleranceType,
    tolerancePercentage: r.tolerance_percentage,
    expectedSource: r.expected_source as ReconExpectedSource,
    requiresReviewerApproval: r.requires_reviewer_approval,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
  };
}

export async function listRequirements(
  pool: Pool,
  tenantId: string,
  entityId: string
): Promise<ReconRequirement[]> {
  const r = await pool.query<Row>(
    `SELECT ${COLS} FROM tenant_recon_requirements WHERE tenant_id = $1 AND entity_id = $2 ORDER BY account_code`,
    [tenantId, entityId]
  );
  return r.rows.map(rowToReq);
}

export async function getRequirementById(
  pool: Pool,
  tenantId: string,
  requirementId: string
): Promise<ReconRequirement | null> {
  const r = await pool.query<Row>(
    `SELECT ${COLS} FROM tenant_recon_requirements WHERE tenant_id = $1 AND requirement_id = $2`,
    [tenantId, requirementId]
  );
  const row = r.rows[0];
  return row ? rowToReq(row) : null;
}

export async function insertRequirement(
  pool: Pool,
  requirementId: string,
  input: {
    tenantId: string;
    entityId: string;
    accountCode: string;
    accountName?: string | null;
    isRequired?: boolean;
    toleranceAmount?: number | string;
    toleranceType?: ReconToleranceType;
    tolerancePercentage?: number | string | null;
    expectedSource?: ReconExpectedSource;
    requiresReviewerApproval?: boolean;
    createdBy?: string | null;
  }
): Promise<ReconRequirement> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tenant_recon_requirements (
      requirement_id, tenant_id, entity_id, account_code, account_name, is_required,
      tolerance_amount, tolerance_type, tolerance_percentage, expected_source, requires_reviewer_approval,
      created_at, updated_at, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13)`,
    [
      requirementId,
      input.tenantId,
      input.entityId,
      input.accountCode,
      input.accountName ?? null,
      input.isRequired ?? true,
      String(input.toleranceAmount ?? 0),
      input.toleranceType ?? 'absolute',
      input.tolerancePercentage != null ? String(input.tolerancePercentage) : null,
      input.expectedSource ?? 'other',
      input.requiresReviewerApproval ?? false,
      now,
      input.createdBy ?? null,
    ]
  );
  const req = await getRequirementById(pool, input.tenantId, requirementId);
  if (!req) throw new Error('Failed to fetch requirement after insert');
  return req;
}

export async function updateRequirement(
  pool: Pool,
  tenantId: string,
  requirementId: string,
  patch: {
    accountName?: string | null;
    isRequired?: boolean;
    toleranceAmount?: number | string;
    toleranceType?: ReconToleranceType;
    tolerancePercentage?: number | string | null;
    expectedSource?: ReconExpectedSource;
    requiresReviewerApproval?: boolean;
  }
): Promise<ReconRequirement | null> {
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = $2'];
  const params: unknown[] = [tenantId, now];
  let i = 3;
  if (patch.accountName !== undefined) {
    sets.push(`account_name = $${i++}`);
    params.push(patch.accountName);
  }
  if (patch.isRequired !== undefined) {
    sets.push(`is_required = $${i++}`);
    params.push(patch.isRequired);
  }
  if (patch.toleranceAmount !== undefined) {
    sets.push(`tolerance_amount = $${i++}`);
    params.push(String(patch.toleranceAmount));
  }
  if (patch.toleranceType !== undefined) {
    sets.push(`tolerance_type = $${i++}`);
    params.push(patch.toleranceType);
  }
  if (patch.tolerancePercentage !== undefined) {
    sets.push(`tolerance_percentage = $${i++}`);
    params.push(patch.tolerancePercentage != null ? String(patch.tolerancePercentage) : null);
  }
  if (patch.expectedSource !== undefined) {
    sets.push(`expected_source = $${i++}`);
    params.push(patch.expectedSource);
  }
  if (patch.requiresReviewerApproval !== undefined) {
    sets.push(`requires_reviewer_approval = $${i++}`);
    params.push(patch.requiresReviewerApproval);
  }
  params.push(requirementId);
  const r = await pool.query(
    `UPDATE tenant_recon_requirements SET ${sets.join(', ')} WHERE tenant_id = $1 AND requirement_id = $${i}`,
    params
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getRequirementById(pool, tenantId, requirementId);
}

export async function deleteRequirement(
  pool: Pool,
  tenantId: string,
  requirementId: string
): Promise<boolean> {
  const r = await pool.query(
    'DELETE FROM tenant_recon_requirements WHERE tenant_id = $1 AND requirement_id = $2',
    [tenantId, requirementId]
  );
  return (r.rowCount ?? 0) > 0;
}
