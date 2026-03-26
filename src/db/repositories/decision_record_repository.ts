/**
 * Decision records — DB repository (tenant-scoped, append-only).
 * No update or delete; immutability for explainability.
 */

import type { Pool } from 'pg';
import type { DecisionRecord } from '../../types/decision_record.js';

interface DecisionRecordRow {
  id: string;
  close_session_id: string | null;
  tenant_id: string;
  decision_type: string;
  subject_ref: unknown;
  input_hash: string | null;
  input_snapshot: unknown;
  output_snapshot: unknown;
  confidence_score: string | null;
  rationale_text: string | null;
  engine_version: string | null;
  prompt_snapshot: string | null;
  ai_call_log_id: string | null;
  created_at: string;
}

function rowToRecord(row: DecisionRecordRow): DecisionRecord {
  return {
    id: row.id,
    closeSessionId: row.close_session_id ?? null,
    tenantId: row.tenant_id,
    decisionType: row.decision_type as DecisionRecord['decisionType'],
    subjectRef: (row.subject_ref != null && typeof row.subject_ref === 'object' ? row.subject_ref : {}) as Record<string, unknown>,
    inputHash: row.input_hash ?? null,
    inputSnapshot: row.input_snapshot != null && typeof row.input_snapshot === 'object' ? (row.input_snapshot as Record<string, unknown>) : null,
    outputSnapshot: row.output_snapshot != null && typeof row.output_snapshot === 'object' ? (row.output_snapshot as Record<string, unknown>) : null,
    confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
    rationaleText: row.rationale_text ?? null,
    engineVersion: row.engine_version ?? null,
    promptSnapshot: row.prompt_snapshot ?? null,
    aiCallLogId: row.ai_call_log_id ?? null,
    createdAt: row.created_at,
  };
}

const SELECT_COLS = `id, close_session_id, tenant_id, decision_type, subject_ref, input_hash, input_snapshot,
  output_snapshot, confidence_score, rationale_text, engine_version, prompt_snapshot, ai_call_log_id, created_at`;

export async function insertDecisionRecord(
  pool: Pool,
  id: string,
  input: {
    closeSessionId?: string | null;
    tenantId: string;
    decisionType: string;
    subjectRef: unknown;
    inputHash?: string | null;
    inputSnapshot?: unknown;
    outputSnapshot?: unknown;
    confidenceScore?: number | null;
    rationaleText?: string | null;
    engineVersion?: string | null;
    promptSnapshot?: string | null;
    aiCallLogId?: string | null;
  }
): Promise<DecisionRecord> {
  await pool.query(
    `INSERT INTO decision_records (
      id, close_session_id, tenant_id, decision_type, subject_ref, input_hash, input_snapshot,
      output_snapshot, confidence_score, rationale_text, engine_version, prompt_snapshot, ai_call_log_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      input.closeSessionId ?? null,
      input.tenantId,
      input.decisionType,
      JSON.stringify(input.subjectRef ?? {}),
      input.inputHash ?? null,
      input.inputSnapshot != null ? JSON.stringify(input.inputSnapshot) : null,
      input.outputSnapshot != null ? JSON.stringify(input.outputSnapshot) : null,
      input.confidenceScore ?? null,
      input.rationaleText ?? null,
      input.engineVersion ?? null,
      input.promptSnapshot ?? null,
      input.aiCallLogId ?? null,
    ]
  );
  const r = await pool.query<DecisionRecordRow>(
    `SELECT ${SELECT_COLS} FROM decision_records WHERE id = $1 AND tenant_id = $2`,
    [id, input.tenantId]
  );
  return rowToRecord(r.rows[0]);
}

export async function getDecisionRecordById(pool: Pool, tenantId: string, id: string): Promise<DecisionRecord | null> {
  const r = await pool.query<DecisionRecordRow>(
    `SELECT ${SELECT_COLS} FROM decision_records WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToRecord(row);
}

export async function listDecisionRecords(
  pool: Pool,
  filters: { tenantId: string; closeSessionId?: string | null; decisionType?: string; limit?: number }
): Promise<DecisionRecord[]> {
  const params: unknown[] = [filters.tenantId];
  let i = 2;
  let sql = `SELECT ${SELECT_COLS} FROM decision_records WHERE tenant_id = $1`;
  if (filters.closeSessionId != null) {
    sql += ` AND close_session_id = $${i}`;
    params.push(filters.closeSessionId);
    i += 1;
  }
  if (filters.decisionType) {
    sql += ` AND decision_type = $${i}`;
    params.push(filters.decisionType);
    i += 1;
  }
  sql += ' ORDER BY created_at DESC';
  if (filters.limit != null && filters.limit > 0) {
    sql += ` LIMIT $${i}`;
    params.push(filters.limit);
  }
  const r = await pool.query<DecisionRecordRow>(sql, params);
  return r.rows.map(rowToRecord);
}
