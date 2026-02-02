/**
 * Tax returns — tenant-scoped (tenant DB).
 */

import type { Pool } from 'pg';
import type { TaxReturn, TaxReturnStatus, TaxReturnType } from '../../types/tax_statutory.js';

function nextId(): string {
  return `taxret-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createTaxReturn(
  pool: Pool,
  tenantId: string,
  ret: Omit<TaxReturn, 'id' | 'createdAt' | 'updatedAt'>
): Promise<TaxReturn> {
  const id = nextId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tax_returns (id, tenant_id, entity_id, jurisdiction, period_label, type, status, due_date, filed_at, provision_snapshot, prior_year_figures, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      tenantId,
      ret.entityId,
      ret.jurisdiction,
      ret.periodLabel,
      ret.type,
      ret.status ?? 'draft',
      ret.dueDate,
      ret.filedAt ?? null,
      ret.provisionSnapshot ? JSON.stringify(ret.provisionSnapshot) : null,
      ret.priorYearFigures ? JSON.stringify(ret.priorYearFigures) : null,
      now,
      now,
    ]
  );
  return { ...ret, id, createdAt: now, updatedAt: now };
}

export async function getTaxReturn(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<TaxReturn | null> {
  const r = await pool.query<{
    id: string;
    entity_id: string;
    jurisdiction: string;
    period_label: string;
    type: string;
    status: string;
    due_date: string;
    filed_at: string | null;
    provision_snapshot: unknown;
    prior_year_figures: unknown;
    created_at: string;
    updated_at: string;
  }>(
    'SELECT id, entity_id, jurisdiction, period_label, type, status, due_date, filed_at, provision_snapshot, prior_year_figures, created_at, updated_at FROM tax_returns WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    entityId: row.entity_id,
    jurisdiction: row.jurisdiction,
    periodLabel: row.period_label,
    type: row.type as TaxReturnType,
    status: row.status as TaxReturnStatus,
    dueDate: row.due_date,
    filedAt: row.filed_at ?? undefined,
    provisionSnapshot: row.provision_snapshot as Record<string, unknown> | undefined,
    priorYearFigures: row.prior_year_figures as Record<string, unknown> | undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTaxReturns(
  pool: Pool,
  tenantId: string,
  params?: { entityId?: string; jurisdiction?: string; periodLabel?: string; status?: TaxReturnStatus }
): Promise<TaxReturn[]> {
  let sql =
    'SELECT id, entity_id, jurisdiction, period_label, type, status, due_date, filed_at, provision_snapshot, prior_year_figures, created_at, updated_at FROM tax_returns WHERE tenant_id = $1';
  const args: unknown[] = [tenantId];
  let i = 2;
  if (params?.entityId) {
    sql += ` AND entity_id = $${i}`;
    args.push(params.entityId);
    i += 1;
  }
  if (params?.jurisdiction) {
    sql += ` AND jurisdiction = $${i}`;
    args.push(params.jurisdiction);
    i += 1;
  }
  if (params?.periodLabel) {
    sql += ` AND period_label = $${i}`;
    args.push(params.periodLabel);
    i += 1;
  }
  if (params?.status) {
    sql += ` AND status = $${i}`;
    args.push(params.status);
    i += 1;
  }
  sql += ' ORDER BY due_date DESC';
  const r = await pool.query<{
    id: string;
    entity_id: string;
    jurisdiction: string;
    period_label: string;
    type: string;
    status: string;
    due_date: string;
    filed_at: string | null;
    provision_snapshot: unknown;
    prior_year_figures: unknown;
    created_at: string;
    updated_at: string;
  }>(sql, args);
  return r.rows.map((row) => ({
    id: row.id,
    entityId: row.entity_id,
    jurisdiction: row.jurisdiction,
    periodLabel: row.period_label,
    type: row.type as TaxReturnType,
    status: row.status as TaxReturnStatus,
    dueDate: row.due_date,
    filedAt: row.filed_at ?? undefined,
    provisionSnapshot: row.provision_snapshot as Record<string, unknown> | undefined,
    priorYearFigures: row.prior_year_figures as Record<string, unknown> | undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateTaxReturnStatus(
  pool: Pool,
  id: string,
  tenantId: string,
  update: { status: TaxReturnStatus; filedAt?: string }
): Promise<TaxReturn | null> {
  const now = new Date().toISOString();
  const filedAt = update.status === 'filed' ? (update.filedAt ?? now) : null;
  await pool.query(
    'UPDATE tax_returns SET status = $3, filed_at = COALESCE($4, filed_at), updated_at = $5 WHERE id = $1 AND tenant_id = $2',
    [id, tenantId, update.status, filedAt, now]
  );
  return getTaxReturn(pool, id, tenantId);
}

export async function attachTaxReturnProvision(
  pool: Pool,
  id: string,
  tenantId: string,
  provisionSnapshot: Record<string, unknown>,
  priorYearFigures?: Record<string, unknown>
): Promise<TaxReturn | null> {
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE tax_returns SET provision_snapshot = $3, prior_year_figures = COALESCE($4, prior_year_figures), updated_at = $5 WHERE id = $1 AND tenant_id = $2',
    [id, tenantId, JSON.stringify(provisionSnapshot), priorYearFigures ? JSON.stringify(priorYearFigures) : null, now]
  );
  return getTaxReturn(pool, id, tenantId);
}
