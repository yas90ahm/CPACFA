/**
 * Advisor pillar: persist AI proposals to draft-only table. Never posted or applied automatically.
 */

import type { Pool } from 'pg';

export interface SaveProposalsParams {
  tenantId: string;
  periodLabel: string;
  stagingId?: string | null;
  proposal: { prompt_version?: string; proposals: unknown[] };
  promptVersion?: string | null;
  model?: string | null;
}

export interface ProposalRow {
  id: string;
  tenant_id: string;
  period_label: string;
  staging_id: string | null;
  proposal: unknown;
  prompt_version: string | null;
  model: string | null;
  created_at: string;
}

export async function saveProposals(
  pool: Pool,
  params: SaveProposalsParams
): Promise<{ id: string; createdAt: string }> {
  const r = await pool.query<{ id: string; created_at: string }>(
    `INSERT INTO tenant_ai_proposals (tenant_id, period_label, staging_id, proposal, prompt_version, model)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [
      params.tenantId,
      params.periodLabel,
      params.stagingId ?? null,
      JSON.stringify(params.proposal),
      params.promptVersion ?? null,
      params.model ?? null,
    ]
  );
  const row = r.rows[0];
  if (!row) throw new Error('Failed to insert tenant_ai_proposals');
  return { id: row.id, createdAt: row.created_at };
}

export async function listProposalsByStaging(
  pool: Pool,
  tenantId: string,
  stagingId: string
): Promise<ProposalRow[]> {
  const r = await pool.query<ProposalRow>(
    `SELECT id, tenant_id, period_label, staging_id, proposal, prompt_version, model, created_at
     FROM tenant_ai_proposals
     WHERE tenant_id = $1 AND staging_id = $2
     ORDER BY created_at DESC`,
    [tenantId, stagingId]
  );
  return r.rows;
}

export async function listProposalsByPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<ProposalRow[]> {
  const r = await pool.query<ProposalRow>(
    `SELECT id, tenant_id, period_label, staging_id, proposal, prompt_version, model, created_at
     FROM tenant_ai_proposals
     WHERE tenant_id = $1 AND period_label = $2
     ORDER BY created_at DESC`,
    [tenantId, periodLabel]
  );
  return r.rows;
}
