/**
 * LBO model repository (CFA).
 */

import type { Pool } from 'pg';

export interface LboModelRow {
  id: string;
  tenantId: string;
  name: string;
  targetName?: string;
  entryEv?: number;
  entryMultipleMetric?: string;
  entryMultiple?: number;
  exitYear?: number;
  exitMultiple?: number;
  debtAmount?: number;
  equityAmount?: number;
  irr?: number;
  moic?: number;
  assumptions?: unknown;
  createdAt: string;
  updatedAt: string;
}

function nextId(): string {
  return `lbo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToLbo(row: Record<string, unknown>): LboModelRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    targetName: row.target_name as string | undefined,
    entryEv: row.entry_ev != null ? Number(row.entry_ev) : undefined,
    entryMultipleMetric: row.entry_multiple_metric as string | undefined,
    entryMultiple: row.entry_multiple != null ? Number(row.entry_multiple) : undefined,
    exitYear: row.exit_year != null ? Number(row.exit_year) : undefined,
    exitMultiple: row.exit_multiple != null ? Number(row.exit_multiple) : undefined,
    debtAmount: row.debt_amount != null ? Number(row.debt_amount) : undefined,
    equityAmount: row.equity_amount != null ? Number(row.equity_amount) : undefined,
    irr: row.irr != null ? Number(row.irr) : undefined,
    moic: row.moic != null ? Number(row.moic) : undefined,
    assumptions: row.assumptions as unknown | undefined,
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
    updatedAt: (row.updated_at as Date)?.toISOString?.() ?? String(row.updated_at),
  };
}

export async function createLboModel(
  pool: Pool,
  tenantId: string,
  row: Omit<LboModelRow, 'id' | 'createdAt' | 'updatedAt'>
): Promise<LboModelRow> {
  const id = nextId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO lbo_models (id, tenant_id, name, target_name, entry_ev, entry_multiple_metric, entry_multiple, exit_year, exit_multiple, debt_amount, equity_amount, irr, moic, assumptions, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id, tenantId, row.name, row.targetName ?? null, row.entryEv ?? null, row.entryMultipleMetric ?? null,
      row.entryMultiple ?? null, row.exitYear ?? null, row.exitMultiple ?? null, row.debtAmount ?? null,
      row.equityAmount ?? null, row.irr ?? null, row.moic ?? null,
      row.assumptions != null ? JSON.stringify(row.assumptions) : null, now, now,
    ]
  );
  return { id, ...row, createdAt: now, updatedAt: now };
}

export async function getLboModel(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<LboModelRow | null> {
  const r = await pool.query('SELECT * FROM lbo_models WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return r.rows[0] ? rowToLbo(r.rows[0]) : null;
}

export async function listLboModels(pool: Pool, tenantId: string): Promise<LboModelRow[]> {
  const r = await pool.query('SELECT * FROM lbo_models WHERE tenant_id = $1 ORDER BY updated_at DESC', [tenantId]);
  return r.rows.map((row) => rowToLbo(row));
}

export async function updateLboModel(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<Omit<LboModelRow, 'id' | 'tenantId' | 'createdAt'>>
): Promise<LboModelRow | null> {
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = $2'];
  const params: unknown[] = [id, now];
  let idx = 3;
  const set = (key: string, val: unknown) => {
    updates.push(`${key} = $${idx++}`);
    params.push(val);
  };
  if (patch.name !== undefined) set('name', patch.name);
  if (patch.targetName !== undefined) set('target_name', patch.targetName);
  if (patch.entryEv !== undefined) set('entry_ev', patch.entryEv);
  if (patch.entryMultipleMetric !== undefined) set('entry_multiple_metric', patch.entryMultipleMetric);
  if (patch.entryMultiple !== undefined) set('entry_multiple', patch.entryMultiple);
  if (patch.exitYear !== undefined) set('exit_year', patch.exitYear);
  if (patch.exitMultiple !== undefined) set('exit_multiple', patch.exitMultiple);
  if (patch.debtAmount !== undefined) set('debt_amount', patch.debtAmount);
  if (patch.equityAmount !== undefined) set('equity_amount', patch.equityAmount);
  if (patch.irr !== undefined) set('irr', patch.irr);
  if (patch.moic !== undefined) set('moic', patch.moic);
  if (patch.assumptions !== undefined) set('assumptions', JSON.stringify(patch.assumptions));
  params.push(tenantId);
  const r = await pool.query(
    `UPDATE lbo_models SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $${idx} RETURNING *`,
    params
  );
  return r.rows[0] ? rowToLbo(r.rows[0]) : null;
}

export async function deleteLboModel(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM lbo_models WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);
  return r.rowCount != null && r.rowCount > 0;
}
