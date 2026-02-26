/**
 * Triage assessments — DB repository (tenant-scoped pool).
 */

import type { Pool } from 'pg';
import type { TriageAssessment, TriageSummaryJson } from '../../types/triage.js';

interface TriageAssessmentRow {
  id: string;
  close_session_id: string;
  risk_score: number;
  materiality_threshold: string;
  basis_used: string;
  summary_json: unknown;
  created_at: string;
}

function rowToAssessment(row: TriageAssessmentRow): TriageAssessment {
  return {
    id: row.id,
    closeSessionId: row.close_session_id,
    riskScore: row.risk_score,
    materialityThreshold: Number(row.materiality_threshold),
    basisUsed: row.basis_used,
    summaryJson: (row.summary_json ?? {}) as TriageSummaryJson,
    createdAt: row.created_at,
  };
}

export async function insertTriageAssessment(
  pool: Pool,
  tenantId: string,
  input: {
    id: string;
    closeSessionId: string;
    riskScore: number;
    materialityThreshold: number;
    basisUsed: string;
    summaryJson: TriageSummaryJson;
  }
): Promise<TriageAssessment> {
  await pool.query(
    `INSERT INTO triage_assessments (id, close_session_id, risk_score, materiality_threshold, basis_used, summary_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.id,
      input.closeSessionId,
      input.riskScore,
      input.materialityThreshold,
      input.basisUsed,
      JSON.stringify(input.summaryJson),
    ]
  );
  const row = await getById(pool, tenantId, input.id);
  if (!row) throw new Error('Failed to fetch triage assessment after insert');
  return row;
}

export async function getById(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<TriageAssessment | null> {
  const r = await pool.query<TriageAssessmentRow>(
    `SELECT ta.id, ta.close_session_id, ta.risk_score, ta.materiality_threshold, ta.basis_used, ta.summary_json, ta.created_at
     FROM triage_assessments ta
     JOIN close_sessions cs ON ta.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND ta.id = $2`,
    [tenantId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToAssessment(row);
}

export async function getLatestTriageByCloseSessionId(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<TriageAssessment | null> {
  const r = await pool.query<TriageAssessmentRow>(
    `SELECT ta.id, ta.close_session_id, ta.risk_score, ta.materiality_threshold, ta.basis_used, ta.summary_json, ta.created_at
     FROM triage_assessments ta
     JOIN close_sessions cs ON ta.close_session_id = cs.id
     WHERE cs.tenant_id = $1 AND ta.close_session_id = $2
     ORDER BY ta.created_at DESC LIMIT 1`,
    [tenantId, closeSessionId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToAssessment(row);
}
