/**
 * Reconciliation resolutions per tenant — DB repository.
 */

import type { Pool } from 'pg';
import type { ReconciliationResolution } from '../../types/close_and_controls.js';

function nextId(): string {
  return `rec-res-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToResolution(row: {
  id: string;
  tenant_id: string;
  period_label: string;
  reconciliation_type: string;
  passed: boolean;
  message: string | null;
  detail: string | null;
  assignee: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  waived_at: string | null;
  waived_by: string | null;
  waived_reason: string | null;
}): ReconciliationResolution {
  return {
    id: row.id,
    periodLabel: row.period_label,
    reconciliationType: row.reconciliation_type as ReconciliationResolution['reconciliationType'],
    passed: row.passed,
    message: row.message ?? undefined,
    detail: row.detail ?? undefined,
    assignee: row.assignee ?? undefined,
    dueDate: row.due_date ?? undefined,
    status: row.status as ReconciliationResolution['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    waivedAt: row.waived_at ?? undefined,
    waivedBy: row.waived_by ?? undefined,
    waivedReason: row.waived_reason ?? undefined,
  };
}

const COLS =
  'id, tenant_id, period_label, reconciliation_type, passed, message, detail, assignee, due_date, status, created_at, updated_at, resolved_at, resolved_by, waived_at, waived_by, waived_reason';

export interface CreateResolutionInput {
  periodLabel: string;
  reconciliationType: ReconciliationResolution['reconciliationType'];
  passed: boolean;
  message?: string;
  detail?: string;
  assignee?: string;
  dueDate?: string;
}

export async function createResolution(
  pool: Pool,
  tenantId: string,
  input: CreateResolutionInput
): Promise<ReconciliationResolution> {
  const id = nextId();
  const now = new Date().toISOString();
  const status = input.passed ? 'resolved' : 'open';
  await pool.query(
    `INSERT INTO reconciliation_resolutions (id, tenant_id, period_label, reconciliation_type, passed, message, detail, assignee, due_date, status, created_at, updated_at, resolved_at, resolved_by, waived_at, waived_by, waived_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      tenantId,
      input.periodLabel,
      input.reconciliationType,
      input.passed,
      input.message ?? null,
      input.detail ?? null,
      input.assignee ?? null,
      input.dueDate ?? null,
      status,
      now,
      input.passed ? now : null,
      input.passed ? 'system' : null,
      null,
      null,
      null,
    ]
  );
  return rowToResolution({
    id,
    tenant_id: tenantId,
    period_label: input.periodLabel,
    reconciliation_type: input.reconciliationType,
    passed: input.passed,
    message: input.message ?? null,
    detail: input.detail ?? null,
    assignee: input.assignee ?? null,
    due_date: input.dueDate ?? null,
    status,
    created_at: now,
    updated_at: now,
    resolved_at: input.passed ? now : null,
    resolved_by: input.passed ? 'system' : null,
    waived_at: null,
    waived_by: null,
    waived_reason: null,
  });
}

export async function getResolution(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<ReconciliationResolution | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string;
    reconciliation_type: string;
    passed: boolean;
    message: string | null;
    detail: string | null;
    assignee: string | null;
    due_date: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    waived_at: string | null;
    waived_by: string | null;
    waived_reason: string | null;
  }>(`SELECT ${COLS} FROM reconciliation_resolutions WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  const row = r.rows[0];
  if (!row) return null;
  return rowToResolution(row);
}

export async function listResolutions(
  pool: Pool,
  tenantId: string,
  options?: {
    periodLabel?: string;
    status?: string;
    reconciliationType?: string;
    limit?: number;
  }
): Promise<ReconciliationResolution[]> {
  let sql = `SELECT ${COLS} FROM reconciliation_resolutions WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];
  if (options?.periodLabel) {
    params.push(options.periodLabel);
    sql += ` AND period_label = $${params.length}`;
  }
  if (options?.status) {
    params.push(options.status);
    sql += ` AND status = $${params.length}`;
  }
  if (options?.reconciliationType) {
    params.push(options.reconciliationType);
    sql += ` AND reconciliation_type = $${params.length}`;
  }
  sql += ' ORDER BY updated_at DESC';
  const limit = options?.limit ?? 100;
  params.push(limit);
  sql += ` LIMIT $${params.length}`;
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string;
    reconciliation_type: string;
    passed: boolean;
    message: string | null;
    detail: string | null;
    assignee: string | null;
    due_date: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    waived_at: string | null;
    waived_by: string | null;
    waived_reason: string | null;
  }>(sql, params);
  return r.rows.map(rowToResolution);
}

export async function updateResolution(
  pool: Pool,
  id: string,
  tenantId: string,
  patch: {
    assignee?: string;
    dueDate?: string;
    status?: ReconciliationResolution['status'];
    resolvedBy?: string;
    waivedBy?: string;
    waivedReason?: string;
  }
): Promise<ReconciliationResolution | null> {
  const existing = await getResolution(pool, id, tenantId);
  if (!existing) return null;
  const now = new Date().toISOString();
  let resolvedAt = existing.resolvedAt;
  let resolvedBy = existing.resolvedBy;
  let waivedAt = existing.waivedAt;
  let waivedBy = existing.waivedBy;
  let waivedReason = existing.waivedReason;
  if (patch.status === 'resolved' && !existing.resolvedAt) {
    resolvedAt = now;
    resolvedBy = patch.resolvedBy ?? existing.resolvedBy;
  }
  if (patch.status === 'waived') {
    waivedAt = now;
    waivedBy = patch.waivedBy;
    waivedReason = patch.waivedReason;
  }
  const status = patch.status ?? existing.status;
  const assignee = patch.assignee !== undefined ? patch.assignee : existing.assignee;
  const dueDate = patch.dueDate !== undefined ? patch.dueDate : existing.dueDate;

  await pool.query(
    `UPDATE reconciliation_resolutions SET assignee = $1, due_date = $2, status = $3, updated_at = $4, resolved_at = $5, resolved_by = $6, waived_at = $7, waived_by = $8, waived_reason = $9 WHERE id = $10 AND tenant_id = $11`,
    [
      assignee ?? null,
      dueDate ?? null,
      status,
      now,
      resolvedAt ?? null,
      resolvedBy ?? null,
      waivedAt ?? null,
      waivedBy ?? null,
      waivedReason ?? null,
      id,
      tenantId,
    ]
  );
  return getResolution(pool, id, tenantId);
}

/** Find resolution by tenant, period, and type (for sync from rec summary). */
export async function getResolutionByPeriodAndType(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  reconciliationType: string
): Promise<ReconciliationResolution | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string;
    reconciliation_type: string;
    passed: boolean;
    message: string | null;
    detail: string | null;
    assignee: string | null;
    due_date: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    waived_at: string | null;
    waived_by: string | null;
    waived_reason: string | null;
  }>(
    `SELECT ${COLS} FROM reconciliation_resolutions WHERE tenant_id = $1 AND period_label = $2 AND reconciliation_type = $3`,
    [tenantId, periodLabel, reconciliationType]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToResolution(row);
}

/** Upsert resolution for period + type (set passed, status, updated_at). Used by rec summary sync. */
export async function upsertResolutionFromSummary(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  reconciliationType: string,
  passed: boolean
): Promise<ReconciliationResolution> {
  const now = new Date().toISOString();
  const existing = await getResolutionByPeriodAndType(pool, tenantId, periodLabel, reconciliationType);
  if (existing) {
    await pool.query(
      `UPDATE reconciliation_resolutions SET passed = $1, status = $2, updated_at = $3, resolved_at = $4, resolved_by = $5 WHERE id = $6 AND tenant_id = $7`,
      [passed, passed ? 'resolved' : 'open', now, passed ? now : existing.resolvedAt ?? null, passed ? 'system' : existing.resolvedBy ?? null, existing.id, tenantId]
    );
    const updated = await getResolution(pool, existing.id, tenantId);
    return updated!;
  }
  const resolution = await createResolution(pool, tenantId, {
    periodLabel,
    reconciliationType: reconciliationType as ReconciliationResolution['reconciliationType'],
    passed,
    message: passed ? undefined : `Reconciliation ${reconciliationType} failed`,
  });
  return resolution;
}
