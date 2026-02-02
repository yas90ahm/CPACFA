/**
 * Period-level export checks — rounding/materiality flags persisted when consolidation runs.
 * Export gate reads these so export can be blocked without trusting client-supplied flags.
 */

import type { Pool } from 'pg';

export interface PeriodExportChecksRow {
  tenantId: string;
  periodLabel: string;
  roundingGapExceedsMateriality: boolean;
  aggregateRoundingExceedsMateriality: boolean;
  updatedAt: string;
}

export async function upsertPeriodExportChecks(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  data: { roundingGapExceedsMateriality: boolean; aggregateRoundingExceedsMateriality?: boolean }
): Promise<PeriodExportChecksRow> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO period_export_checks (tenant_id, period_label, rounding_gap_exceeds_materiality, aggregate_rounding_exceeds_materiality, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, period_label)
     DO UPDATE SET
       rounding_gap_exceeds_materiality = EXCLUDED.rounding_gap_exceeds_materiality,
       aggregate_rounding_exceeds_materiality = EXCLUDED.aggregate_rounding_exceeds_materiality,
       updated_at = EXCLUDED.updated_at`,
    [
      tenantId,
      periodLabel,
      data.roundingGapExceedsMateriality,
      data.aggregateRoundingExceedsMateriality ?? false,
      now,
    ]
  );
  return {
    tenantId,
    periodLabel,
    roundingGapExceedsMateriality: data.roundingGapExceedsMateriality,
    aggregateRoundingExceedsMateriality: data.aggregateRoundingExceedsMateriality ?? false,
    updatedAt: now,
  };
}

export async function getPeriodExportChecks(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<PeriodExportChecksRow | null> {
  const r = await pool.query(
    'SELECT tenant_id, period_label, rounding_gap_exceeds_materiality, aggregate_rounding_exceeds_materiality, updated_at FROM period_export_checks WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    periodLabel: row.period_label,
    roundingGapExceedsMateriality: Boolean(row.rounding_gap_exceeds_materiality),
    aggregateRoundingExceedsMateriality: Boolean(row.aggregate_rounding_exceeds_materiality),
    updatedAt: (row.updated_at as Date)?.toISOString?.() ?? String(row.updated_at),
  };
}
