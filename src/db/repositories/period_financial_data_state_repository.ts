/**
 * Last financial data update time per tenant+period (TB ingest / FS).
 * Used by Freshness Interlock: valuation blocked if data_updated_at > review_completed_at.
 */

import type { Pool } from 'pg';

export async function upsert(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<void> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO period_financial_data_state (tenant_id, period_label, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, period_label)
     DO UPDATE SET updated_at = EXCLUDED.updated_at`,
    [tenantId, periodLabel, now]
  );
}

export async function getLatestUpdatedAt(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<string | null> {
  const r = await pool.query<{ updated_at: string }>(
    'SELECT updated_at FROM period_financial_data_state WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  return row?.updated_at ?? null;
}
