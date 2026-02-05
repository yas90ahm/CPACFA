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
  const r = await pool.query<TriageAssessmentRow>(
    'SELECT id, close_session_id, risk_score, materiality_threshold, basis_used, summary_json, created_at FROM triage_assessments WHERE id = $1',
    [input.id]
  );
  return rowToAssessment(r.rows[0]);
}

export async function getLatestTriageByCloseSessionId(
  pool: Pool,
  closeSessionId: string
): Promise<TriageAssessment | null> {
  const r = await pool.query<TriageAssessmentRow>(
    `SELECT id, close_session_id, risk_score, materiality_threshold, basis_used, summary_json, created_at
     FROM triage_assessments WHERE close_session_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [closeSessionId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToAssessment(row);
}
