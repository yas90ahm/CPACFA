/**
 * Risk context conflicts — unresolved CPA-CFA conflicts (Integration only).
 * Resolved via Resolution Memo; export gate blocks until resolved.
 */

import type { Pool } from 'pg';

function nextId(): string {
  return `rcc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface RiskContextConflictRow {
  id: string;
  tenantId: string;
  periodLabel: string | null;
  sessionId: string | null;
  conflictReason: string;
  conflictSnapshot: Record<string, unknown>;
  resolvedAt: string | null;
  resolutionMemo: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface CreateRiskContextConflictInput {
  tenantId: string;
  periodLabel?: string;
  sessionId?: string;
  conflictReason: string;
  conflictSnapshot: Record<string, unknown>;
  createdBy?: string;
}

export async function create(
  pool: Pool,
  input: CreateRiskContextConflictInput
): Promise<RiskContextConflictRow> {
  const id = nextId();
  await pool.query(
    `INSERT INTO risk_context_conflicts (
      id, tenant_id, period_label, session_id, conflict_reason, conflict_snapshot, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.tenantId,
      input.periodLabel ?? null,
      input.sessionId ?? null,
      input.conflictReason,
      JSON.stringify(input.conflictSnapshot),
      input.createdBy ?? null,
    ]
  );
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string | null;
    session_id: string | null;
    conflict_reason: string;
    conflict_snapshot: unknown;
    resolved_at: string | null;
    resolution_memo: string | null;
    created_at: string;
    created_by: string | null;
  }>('SELECT * FROM risk_context_conflicts WHERE id = $1', [id]);
  const row = r.rows[0]!;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label ?? null,
    sessionId: row.session_id ?? null,
    conflictReason: row.conflict_reason,
    conflictSnapshot: (row.conflict_snapshot as Record<string, unknown>) ?? {},
    resolvedAt: row.resolved_at ?? null,
    resolutionMemo: row.resolution_memo ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  };
}

export async function listUnresolved(
  pool: Pool,
  tenantId: string,
  periodLabel?: string
): Promise<RiskContextConflictRow[]> {
  let sql = 'SELECT * FROM risk_context_conflicts WHERE tenant_id = $1 AND resolved_at IS NULL';
  const params: unknown[] = [tenantId];
  if (periodLabel != null) {
    params.push(periodLabel);
    sql += ' AND period_label = $2';
  }
  sql += ' ORDER BY created_at DESC';
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string | null;
    session_id: string | null;
    conflict_reason: string;
    conflict_snapshot: unknown;
    resolved_at: string | null;
    resolution_memo: string | null;
    created_at: string;
    created_by: string | null;
  }>(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label ?? null,
    sessionId: row.session_id ?? null,
    conflictReason: row.conflict_reason,
    conflictSnapshot: (row.conflict_snapshot as Record<string, unknown>) ?? {},
    resolvedAt: row.resolved_at ?? null,
    resolutionMemo: row.resolution_memo ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  }));
}

export async function resolve(
  pool: Pool,
  id: string,
  resolutionMemo: string,
  resolvedBy?: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE risk_context_conflicts SET resolved_at = $1, resolution_memo = $2
     WHERE id = $3 AND resolved_at IS NULL`,
    [now, resolutionMemo, id]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Count resolved conflicts for tenant/period (for integrity check). */
export async function countResolvedByTenantPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<number> {
  const r = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM risk_context_conflicts WHERE tenant_id = $1 AND period_label = $2 AND resolved_at IS NOT NULL',
    [tenantId, periodLabel]
  );
  return Number(r.rows[0]?.count ?? 0);
}

export async function getById(pool: Pool, id: string): Promise<RiskContextConflictRow | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string | null;
    session_id: string | null;
    conflict_reason: string;
    conflict_snapshot: unknown;
    resolved_at: string | null;
    resolution_memo: string | null;
    created_at: string;
    created_by: string | null;
  }>('SELECT * FROM risk_context_conflicts WHERE id = $1', [id]);
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label ?? null,
    sessionId: row.session_id ?? null,
    conflictReason: row.conflict_reason,
    conflictSnapshot: (row.conflict_snapshot as Record<string, unknown>) ?? {},
    resolvedAt: row.resolved_at ?? null,
    resolutionMemo: row.resolution_memo ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  };
}
