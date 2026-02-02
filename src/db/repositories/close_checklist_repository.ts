/**
 * Close checklist per tenant — one row per (tenant_id, period_label), steps JSONB.
 */

import type { Pool } from 'pg';
import type { CloseChecklistStep } from '../../types/close_and_controls.js';

export async function getChecklist(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<CloseChecklistStep[] | null> {
  const r = await pool.query<{ steps: unknown }>(
    'SELECT steps FROM close_checklist WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  if (!row || !Array.isArray(row.steps)) return null;
  return row.steps as CloseChecklistStep[];
}

export async function upsertChecklist(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  steps: CloseChecklistStep[]
): Promise<CloseChecklistStep[]> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO close_checklist (tenant_id, period_label, steps, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, period_label)
     DO UPDATE SET steps = $3, updated_at = $4`,
    [tenantId, periodLabel, JSON.stringify(steps), now]
  );
  const got = await getChecklist(pool, tenantId, periodLabel);
  return got ?? steps;
}
