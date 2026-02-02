/**
 * Risk context last DCF per tenant/period — for Going Concern vs DCF conflict (Integration).
 * Written on DCF save/calculate; read in step3Supervisor.
 */

import type { Pool } from 'pg';

export interface RiskContextLastDcfRow {
  tenantId: string;
  periodLabel: string;
  terminalGrowthRate: number;
  updatedAt: string;
}

export async function upsert(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  terminalGrowthRate: number
): Promise<void> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO risk_context_last_dcf (tenant_id, period_label, terminal_growth_rate, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, period_label)
     DO UPDATE SET terminal_growth_rate = $3, updated_at = $4`,
    [tenantId, periodLabel, terminalGrowthRate, now]
  );
}

export async function getByTenantPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<RiskContextLastDcfRow | null> {
  const r = await pool.query<{
    tenant_id: string;
    period_label: string;
    terminal_growth_rate: string;
    updated_at: string;
  }>(
    'SELECT tenant_id, period_label, terminal_growth_rate, updated_at FROM risk_context_last_dcf WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    periodLabel: row.period_label,
    terminalGrowthRate: Number(row.terminal_growth_rate),
    updatedAt: row.updated_at,
  };
}
