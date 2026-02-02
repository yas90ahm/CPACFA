/**
 * Budget versions and lines — tenant-scoped.
 */

import type { Pool } from 'pg';
import type { BudgetVersion, BudgetVersionLine, BudgetStatus } from '../../types/budget_forecast.js';

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createBudgetVersion(
  pool: Pool,
  tenantId: string,
  params: { name: string; periodLabel: string; lines: BudgetVersionLine[] }
): Promise<BudgetVersion> {
  const id = nextId('bv');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO budget_versions (id, tenant_id, name, period_label, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'draft', $5, $5)`,
    [id, tenantId, params.name, params.periodLabel, now]
  );
  for (const line of params.lines) {
    const lineId = nextId('bvl');
    await pool.query(
      `INSERT INTO budget_version_lines (id, budget_version_id, label, amount, category, driver_ref)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        lineId,
        id,
        line.label,
        line.amount,
        line.category ?? null,
        line.driverRef ?? null,
      ]
    );
  }
  const lines = await getBudgetVersionLines(pool, id);
  return {
    id,
    name: params.name,
    periodLabel: params.periodLabel,
    status: 'draft',
    lines,
    createdAt: now,
    updatedAt: now,
  };
}

async function getBudgetVersionLines(pool: Pool, budgetVersionId: string): Promise<BudgetVersionLine[]> {
  const r = await pool.query<{ label: string; amount: number; category: string | null; driver_ref: string | null }>(
    'SELECT label, amount, category, driver_ref FROM budget_version_lines WHERE budget_version_id = $1 ORDER BY id',
    [budgetVersionId]
  );
  return r.rows.map((row) => ({
    label: row.label,
    amount: Number(row.amount),
    category: (row.category as BudgetVersionLine['category']) ?? undefined,
    driverRef: row.driver_ref ?? undefined,
  }));
}

export async function getBudgetVersion(pool: Pool, id: string, tenantId: string): Promise<BudgetVersion | null> {
  const r = await pool.query<{
    id: string;
    name: string;
    period_label: string;
    status: string;
    created_at: string;
    updated_at: string;
    locked_at: string | null;
    locked_by: string | null;
  }>(
    'SELECT id, name, period_label, status, created_at, updated_at, locked_at, locked_by FROM budget_versions WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const lines = await getBudgetVersionLines(pool, row.id);
  return {
    id: row.id,
    name: row.name,
    periodLabel: row.period_label,
    status: row.status as BudgetStatus,
    lines,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockedAt: row.locked_at ?? undefined,
    lockedBy: row.locked_by ?? undefined,
  };
}

export async function listBudgetVersions(
  pool: Pool,
  tenantId: string,
  periodLabel?: string
): Promise<BudgetVersion[]> {
  let sql =
    'SELECT id, name, period_label, status, created_at, updated_at, locked_at, locked_by FROM budget_versions WHERE tenant_id = $1';
  const args: unknown[] = [tenantId];
  if (periodLabel) {
    sql += ' AND period_label = $2';
    args.push(periodLabel);
  }
  sql += ' ORDER BY updated_at DESC';
  const r = await pool.query<{
    id: string;
    name: string;
    period_label: string;
    status: string;
    created_at: string;
    updated_at: string;
    locked_at: string | null;
    locked_by: string | null;
  }>(sql, args);
  const out: BudgetVersion[] = [];
  for (const row of r.rows) {
    const lines = await getBudgetVersionLines(pool, row.id);
    out.push({
      id: row.id,
      name: row.name,
      periodLabel: row.period_label,
      status: row.status as BudgetStatus,
      lines,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lockedAt: row.locked_at ?? undefined,
      lockedBy: row.locked_by ?? undefined,
    });
  }
  return out;
}

export async function updateBudgetVersion(
  pool: Pool,
  id: string,
  tenantId: string,
  updates: { name?: string; lines?: BudgetVersionLine[] }
): Promise<BudgetVersion | null> {
  const existing = await getBudgetVersion(pool, id, tenantId);
  if (!existing || existing.status === 'locked') return null;
  const now = new Date().toISOString();
  if (updates.name != null) {
    await pool.query(
      'UPDATE budget_versions SET name = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4',
      [updates.name, now, id, tenantId]
    );
  }
  if (updates.lines != null) {
    await pool.query('DELETE FROM budget_version_lines WHERE budget_version_id = $1', [id]);
    for (const line of updates.lines) {
      const lineId = nextId('bvl');
      await pool.query(
        `INSERT INTO budget_version_lines (id, budget_version_id, label, amount, category, driver_ref)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [lineId, id, line.label, line.amount, line.category ?? null, line.driverRef ?? null]
      );
    }
  }
  if (updates.name != null || updates.lines != null) {
    await pool.query(
      'UPDATE budget_versions SET updated_at = $1 WHERE id = $2 AND tenant_id = $3',
      [now, id, tenantId]
    );
  }
  return getBudgetVersion(pool, id, tenantId);
}

export async function lockBudgetVersion(
  pool: Pool,
  id: string,
  tenantId: string,
  lockedBy: string
): Promise<BudgetVersion | null> {
  const existing = await getBudgetVersion(pool, id, tenantId);
  if (!existing || existing.status === 'locked') return null;
  const lockedAt = new Date().toISOString();
  await pool.query(
    "UPDATE budget_versions SET status = 'locked', locked_at = $1, locked_by = $2, updated_at = $1 WHERE id = $3 AND tenant_id = $4",
    [lockedAt, lockedBy, id, tenantId]
  );
  return getBudgetVersion(pool, id, tenantId);
}

export async function setBudgetStatus(
  pool: Pool,
  id: string,
  tenantId: string,
  status: BudgetStatus
): Promise<BudgetVersion | null> {
  const existing = await getBudgetVersion(pool, id, tenantId);
  if (!existing) return null;
  const now = new Date().toISOString();
  if (status === 'locked' && !existing.lockedAt) {
    await pool.query(
      'UPDATE budget_versions SET status = $1, locked_at = $2, updated_at = $2 WHERE id = $3 AND tenant_id = $4',
      [status, now, id, tenantId]
    );
  } else {
    await pool.query(
      'UPDATE budget_versions SET status = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4',
      [status, now, id, tenantId]
    );
  }
  return getBudgetVersion(pool, id, tenantId);
}
