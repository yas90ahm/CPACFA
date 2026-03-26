/**
 * Variance analysis — DB repository (tenant-scoped).
 */

import type { Pool } from 'pg';
import Decimal from 'decimal.js';
import type { VarianceRecord } from '../../types/variance_analysis.js';

interface VarianceRow {
  id: string;
  tenant_id: string;
  close_session_id: string;
  period_label: string;
  fs_line_id: string;
  statement: string;
  label: string | null;
  current_amount: string;
  prior_amount: string;
  change_amount: string;
  change_percentage: string | null;
  material_threshold_pct: string;
  explanation: string | null;
  ai_draft_explanation: string | null;
  explanation_source: string | null;
  approved_at: string | null;
  approved_by: string | null;
  human_reviewed_by: string | null;
  human_reviewed_at: string | null;
  variance_type: string | null;
  full_year_impact: string | null;
  created_at: string;
}

const SELECT_COLS = `id, tenant_id, close_session_id, period_label, fs_line_id, statement, label,
    current_amount, prior_amount, change_amount, change_percentage, material_threshold_pct,
    explanation, ai_draft_explanation, explanation_source, approved_at, approved_by,
    human_reviewed_by, human_reviewed_at, variance_type, full_year_impact, created_at`;

function rowToVariance(row: VarianceRow): VarianceRecord {
  const changeAmt = row.change_amount;
  const changePct = row.change_percentage ?? null;
  const thresholdPct = row.material_threshold_pct;
  const priorAmt = row.prior_amount;
  const priorDec = new Decimal(priorAmt);
  const isMaterial = priorDec.isZero()
    ? new Decimal(changeAmt).abs().greaterThan('0.01')
    : changePct != null ? new Decimal(changePct).abs().greaterThanOrEqualTo(thresholdPct) : false;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    closeSessionId: row.close_session_id,
    periodLabel: row.period_label,
    fsLineId: row.fs_line_id,
    statement: row.statement,
    label: row.label ?? undefined,
    currentAmount: row.current_amount,
    priorAmount: priorAmt,
    changeAmount: changeAmt,
    changePercentage: changePct,
    materialThresholdPct: thresholdPct,
    isMaterial,
    explanation: row.explanation ?? undefined,
    aiDraftExplanation: row.ai_draft_explanation ?? undefined,
    explanationSource: (row.explanation_source as VarianceRecord['explanationSource']) ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    humanReviewedBy: row.human_reviewed_by ?? undefined,
    humanReviewedAt: row.human_reviewed_at ?? undefined,
    varianceType: row.variance_type ?? undefined,
    fullYearImpact: row.full_year_impact ?? undefined,
    createdAt: row.created_at,
  };
}

export async function upsertVariance(
  pool: Pool,
  id: string,
  input: {
    tenantId: string;
    closeSessionId: string;
    periodLabel: string;
    fsLineId: string;
    statement: string;
    label?: string;
    currentAmount: number;
    priorAmount: number;
    materialThresholdPct?: number;
  }
): Promise<VarianceRecord> {
  await pool.query(
    `INSERT INTO tenant_variance_analysis (id, tenant_id, close_session_id, period_label, fs_line_id, statement, label, current_amount, prior_amount, material_threshold_pct)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (tenant_id, close_session_id, fs_line_id, statement)
     DO UPDATE SET current_amount = EXCLUDED.current_amount, prior_amount = EXCLUDED.prior_amount,
       label = COALESCE(EXCLUDED.label, tenant_variance_analysis.label),
       material_threshold_pct = COALESCE(EXCLUDED.material_threshold_pct, tenant_variance_analysis.material_threshold_pct)`,
    [
      id,
      input.tenantId,
      input.closeSessionId,
      input.periodLabel,
      input.fsLineId,
      input.statement,
      input.label ?? null,
      input.currentAmount,
      input.priorAmount,
      input.materialThresholdPct ?? 5,
    ]
  );
  const r = await pool.query<VarianceRow>(
    `SELECT ${SELECT_COLS}
     FROM tenant_variance_analysis WHERE tenant_id = $1 AND close_session_id = $2 AND fs_line_id = $3 AND statement = $4`,
    [input.tenantId, input.closeSessionId, input.fsLineId, input.statement]
  );
  if (r.rows.length === 0) throw new Error('Variance record not found after upsert');
  return rowToVariance(r.rows[0]);
}

export async function listVariancesForSession(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<VarianceRecord[]> {
  const r = await pool.query<VarianceRow>(
    `SELECT ${SELECT_COLS}
     FROM tenant_variance_analysis WHERE tenant_id = $1 AND close_session_id = $2 ORDER BY statement, fs_line_id`,
    [tenantId, closeSessionId]
  );
  return r.rows.map(rowToVariance);
}

export async function updateExplanation(
  pool: Pool,
  tenantId: string,
  id: string,
  explanation: string,
  explanationSource?: 'manual' | 'ai_draft' | 'ai_edited'
): Promise<VarianceRecord | null> {
  await pool.query(
    `UPDATE tenant_variance_analysis SET explanation = $1, explanation_source = $2 WHERE id = $3 AND tenant_id = $4`,
    [explanation, explanationSource ?? null, id, tenantId]
  );
  const r = await pool.query<VarianceRow>(
    `SELECT ${SELECT_COLS}
     FROM tenant_variance_analysis WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows.length > 0 ? rowToVariance(r.rows[0]) : null;
}

export async function getVarianceById(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<VarianceRecord | null> {
  const r = await pool.query<VarianceRow>(
    `SELECT ${SELECT_COLS}
     FROM tenant_variance_analysis WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows.length > 0 ? rowToVariance(r.rows[0]) : null;
}

export async function updateAiDraftExplanation(
  pool: Pool,
  tenantId: string,
  id: string,
  aiDraftExplanation: string
): Promise<void> {
  await pool.query(
    `UPDATE tenant_variance_analysis SET ai_draft_explanation = $1 WHERE id = $2 AND tenant_id = $3`,
    [aiDraftExplanation, id, tenantId]
  );
}

export async function approveVariance(
  pool: Pool,
  tenantId: string,
  id: string,
  approvedBy: string
): Promise<VarianceRecord | null> {
  const now = new Date().toISOString();
  await pool.query(
    `UPDATE tenant_variance_analysis
     SET approved_at = $1, approved_by = $2,
         human_reviewed_by = $2, human_reviewed_at = $1
     WHERE id = $3 AND tenant_id = $4`,
    [now, approvedBy, id, tenantId]
  );
  const r = await pool.query<VarianceRow>(
    `SELECT ${SELECT_COLS}
     FROM tenant_variance_analysis WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows.length > 0 ? rowToVariance(r.rows[0]) : null;
}

/** Classify a variance with type and full-year impact. */
export async function classifyVariance(
  pool: Pool,
  tenantId: string,
  id: string,
  varianceType: string,
  fullYearImpact: number | null
): Promise<VarianceRecord | null> {
  await pool.query(
    `UPDATE tenant_variance_analysis SET variance_type = $1, full_year_impact = $2 WHERE id = $3 AND tenant_id = $4`,
    [varianceType, fullYearImpact, id, tenantId]
  );
  const r = await pool.query<VarianceRow>(
    `SELECT ${SELECT_COLS}
     FROM tenant_variance_analysis WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows.length > 0 ? rowToVariance(r.rows[0]) : null;
}
