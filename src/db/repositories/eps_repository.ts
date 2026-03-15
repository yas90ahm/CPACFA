/**
 * EPS repository — eps_calculations (ASC 260).
 */

import type { Pool } from 'pg';

export interface EpsCalculationRow {
  id: string;
  tenantId: string;
  periodLabel: string;
  basicIncomeAvailable: string;
  basicWeightedShares: string;
  basicEps: string;
  dilutedIncomeAvailable: string;
  dilutedWeightedShares: string;
  dilutedEps: string;
  treasuryStockAdjustments?: unknown;
  convertibleAdjustments?: unknown;
  optionsWarrants?: unknown;
  createdAt: string;
  updatedAt: string;
}

function nextId(): string {
  return `eps-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToEps(row: Record<string, unknown>): EpsCalculationRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    periodLabel: row.period_label as string,
    basicIncomeAvailable: String(row.basic_income_available),
    basicWeightedShares: String(row.basic_weighted_shares),
    basicEps: String(row.basic_eps),
    dilutedIncomeAvailable: String(row.diluted_income_available),
    dilutedWeightedShares: String(row.diluted_weighted_shares),
    dilutedEps: String(row.diluted_eps),
    treasuryStockAdjustments: row.treasury_stock_adjustments as unknown | undefined,
    convertibleAdjustments: row.convertible_adjustments as unknown | undefined,
    optionsWarrants: row.options_warrants as unknown | undefined,
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
    updatedAt: (row.updated_at as Date)?.toISOString?.() ?? String(row.updated_at),
  };
}

export async function createEpsCalculation(
  pool: Pool,
  tenantId: string,
  row: Omit<EpsCalculationRow, 'id' | 'createdAt' | 'updatedAt'>
): Promise<EpsCalculationRow> {
  const id = nextId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO eps_calculations (id, tenant_id, period_label, basic_income_available, basic_weighted_shares, basic_eps, diluted_income_available, diluted_weighted_shares, diluted_eps, treasury_stock_adjustments, convertible_adjustments, options_warrants, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id, tenantId, row.periodLabel, row.basicIncomeAvailable, row.basicWeightedShares,
      row.basicEps, row.dilutedIncomeAvailable, row.dilutedWeightedShares, row.dilutedEps,
      row.treasuryStockAdjustments != null ? JSON.stringify(row.treasuryStockAdjustments) : null,
      row.convertibleAdjustments != null ? JSON.stringify(row.convertibleAdjustments) : null,
      row.optionsWarrants != null ? JSON.stringify(row.optionsWarrants) : null,
      now, now,
    ]
  );
  return { id, ...row, createdAt: now, updatedAt: now };
}

export async function getEpsCalculation(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<EpsCalculationRow | null> {
  const r = await pool.query(
    'SELECT * FROM eps_calculations WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return r.rows[0] ? rowToEps(r.rows[0]) : null;
}

export async function getEpsByPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<EpsCalculationRow | null> {
  const r = await pool.query(
    'SELECT * FROM eps_calculations WHERE tenant_id = $1 AND period_label = $2 ORDER BY updated_at DESC LIMIT 1',
    [tenantId, periodLabel]
  );
  return r.rows[0] ? rowToEps(r.rows[0]) : null;
}

export async function listEpsCalculations(
  pool: Pool,
  tenantId: string
): Promise<EpsCalculationRow[]> {
  const r = await pool.query(
    'SELECT * FROM eps_calculations WHERE tenant_id = $1 ORDER BY period_label DESC',
    [tenantId]
  );
  return r.rows.map((row) => rowToEps(row));
}
