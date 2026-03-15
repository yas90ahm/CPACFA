/**
 * Fixed asset repository — fixed_assets, depreciation_runs, depreciation_run_details.
 */

import type { Pool } from 'pg';

export type DepreciationMethod = 'straight_line' | 'declining_balance' | 'units_of_production';

export interface FixedAssetRow {
  id: string;
  tenantId: string;
  assetNumber: string;
  description?: string;
  assetType: string;
  acquisitionDate: string;
  cost: string;
  usefulLifeYears: number;
  residualValue: string;
  method: DepreciationMethod;
  depreciationStartDate: string;
  disposedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepreciationRunRow {
  id: string;
  tenantId: string;
  periodLabel: string;
  runAt: string;
  totalDepreciation: string;
  createdAt: string;
}

export interface DepreciationRunDetailRow {
  id: string;
  runId: string;
  fixedAssetId: string;
  periodStart: string;
  periodEnd: string;
  depreciationAmount: string;
  accumulatedDepreciation: string;
  createdAt: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToFA(row: Record<string, unknown>): FixedAssetRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    assetNumber: row.asset_number as string,
    description: row.description as string | undefined,
    assetType: row.asset_type as string,
    acquisitionDate: (row.acquisition_date as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.acquisition_date),
    cost: String(row.cost),
    usefulLifeYears: Number(row.useful_life_years),
    residualValue: String(row.residual_value ?? 0),
    method: row.method as DepreciationMethod,
    depreciationStartDate: (row.depreciation_start_date as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.depreciation_start_date),
    disposedDate: row.disposed_date != null ? ((row.disposed_date as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.disposed_date)) : undefined,
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
    updatedAt: (row.updated_at as Date)?.toISOString?.() ?? String(row.updated_at),
  };
}

function rowToRun(row: Record<string, unknown>): DepreciationRunRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    periodLabel: row.period_label as string,
    runAt: (row.run_at as Date)?.toISOString?.() ?? String(row.run_at),
    totalDepreciation: String(row.total_depreciation ?? 0),
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
  };
}

function rowToDetail(row: Record<string, unknown>): DepreciationRunDetailRow {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    fixedAssetId: row.fixed_asset_id as string,
    periodStart: (row.period_start as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.period_start),
    periodEnd: (row.period_end as Date)?.toISOString?.()?.slice(0, 10) ?? String(row.period_end),
    depreciationAmount: String(row.depreciation_amount),
    accumulatedDepreciation: String(row.accumulated_depreciation),
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
  };
}

export async function createFixedAsset(
  pool: Pool,
  tenantId: string,
  row: Omit<FixedAssetRow, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>
): Promise<FixedAssetRow> {
  const id = nextId('fa');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO fixed_assets (id, tenant_id, asset_number, description, asset_type, acquisition_date, cost, useful_life_years, residual_value, method, depreciation_start_date, disposed_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id, tenantId, row.assetNumber, row.description ?? null, row.assetType, row.acquisitionDate, row.cost,
      row.usefulLifeYears, row.residualValue ?? 0, row.method, row.depreciationStartDate, row.disposedDate ?? null, now, now,
    ]
  );
  return { id, tenantId, ...row, createdAt: now, updatedAt: now };
}

export async function getFixedAsset(pool: Pool, tenantId: string, id: string): Promise<FixedAssetRow | null> {
  const r = await pool.query('SELECT * FROM fixed_assets WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return r.rows[0] ? rowToFA(r.rows[0]) : null;
}

export async function listFixedAssets(pool: Pool, tenantId: string): Promise<FixedAssetRow[]> {
  const r = await pool.query('SELECT * FROM fixed_assets WHERE tenant_id = $1 ORDER BY acquisition_date DESC', [tenantId]);
  return r.rows.map(rowToFA);
}

export async function updateFixedAsset(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<Omit<FixedAssetRow, 'id' | 'tenantId' | 'createdAt'>>
): Promise<FixedAssetRow | null> {
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = $2'];
  const params: unknown[] = [id, now];
  let idx = 3;
  const set = (key: string, val: unknown) => {
    updates.push(`${key} = $${idx++}`);
    params.push(val);
  };
  if (patch.assetNumber !== undefined) set('asset_number', patch.assetNumber);
  if (patch.description !== undefined) set('description', patch.description);
  if (patch.assetType !== undefined) set('asset_type', patch.assetType);
  if (patch.acquisitionDate !== undefined) set('acquisition_date', patch.acquisitionDate);
  if (patch.cost !== undefined) set('cost', patch.cost);
  if (patch.usefulLifeYears !== undefined) set('useful_life_years', patch.usefulLifeYears);
  if (patch.residualValue !== undefined) set('residual_value', patch.residualValue);
  if (patch.method !== undefined) set('method', patch.method);
  if (patch.depreciationStartDate !== undefined) set('depreciation_start_date', patch.depreciationStartDate);
  if (patch.disposedDate !== undefined) set('disposed_date', patch.disposedDate);
  params.push(tenantId);
  const r = await pool.query(
    `UPDATE fixed_assets SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx} RETURNING *`,
    params
  );
  return r.rows[0] ? rowToFA(r.rows[0]) : null;
}

export async function deleteFixedAsset(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM fixed_assets WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);
  return r.rowCount != null && r.rowCount > 0;
}

export async function listActiveFixedAssets(pool: Pool, tenantId: string): Promise<FixedAssetRow[]> {
  const r = await pool.query(
    'SELECT * FROM fixed_assets WHERE tenant_id = $1 AND disposed_date IS NULL ORDER BY acquisition_date',
    [tenantId]
  );
  return r.rows.map(rowToFA);
}

export async function createDepreciationRun(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  totalDepreciation: number
): Promise<DepreciationRunRow> {
  const id = nextId('dr');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO depreciation_runs (id, tenant_id, period_label, run_at, total_depreciation, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tenantId, periodLabel, now, totalDepreciation, now]
  );
  return { id, tenantId, periodLabel, runAt: now, totalDepreciation: String(totalDepreciation), createdAt: now };
}

export async function createDepreciationRunDetails(
  pool: Pool,
  rows: Omit<DepreciationRunDetailRow, 'id' | 'createdAt'>[]
): Promise<DepreciationRunDetailRow[]> {
  const result: DepreciationRunDetailRow[] = [];
  for (const row of rows) {
    const id = nextId('drd');
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO depreciation_run_details (id, run_id, fixed_asset_id, period_start, period_end, depreciation_amount, accumulated_depreciation, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, row.runId, row.fixedAssetId, row.periodStart, row.periodEnd, row.depreciationAmount, row.accumulatedDepreciation, now]
    );
    result.push({ ...row, id, createdAt: now });
  }
  return result;
}

export async function listDepreciationRuns(pool: Pool, tenantId: string, periodLabel?: string): Promise<DepreciationRunRow[]> {
  let sql = 'SELECT * FROM depreciation_runs WHERE tenant_id = $1 ORDER BY run_at DESC';
  const params: unknown[] = [tenantId];
  if (periodLabel) {
    sql = 'SELECT * FROM depreciation_runs WHERE tenant_id = $1 AND period_label = $2 ORDER BY run_at DESC';
    params.push(periodLabel);
  }
  const r = await pool.query(sql, params);
  return r.rows.map(rowToRun);
}

export async function listDepreciationRunDetails(pool: Pool, tenantId: string, runId: string): Promise<DepreciationRunDetailRow[]> {
  const r = await pool.query(
    `SELECT drd.id, drd.run_id, drd.fixed_asset_id, drd.period_start, drd.period_end, drd.depreciation_amount, drd.accumulated_depreciation, drd.created_at
     FROM depreciation_run_details drd
     JOIN depreciation_runs dr ON drd.run_id = dr.id
     WHERE dr.tenant_id = $1 AND drd.run_id = $2
     ORDER BY drd.fixed_asset_id, drd.period_start`,
    [tenantId, runId]
  );
  return r.rows.map(rowToDetail);
}
