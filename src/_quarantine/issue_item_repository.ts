/**
 * Issue (Exception) items — DB repository (tenant-scoped pool).
 */

import type { Pool } from 'pg';
import type { IssueItem, IssueSeverity, IssueStatus } from '../../types/issue_item.js';

interface IssueItemRow {
  id: string;
  close_session_id: string;
  tenant_id: string;
  category: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  impact_pl: string | null;
  impact_bs: string | null;
  impact_cash: string | null;
  currency: string | null;
  materiality_estimate: string | null;
  materiality_threshold_used: string | null;
  confidence_score: string | null;
  source_ref: unknown;
  assigned_to: string | null;
  due_date: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToIssue(row: IssueItemRow): IssueItem {
  return {
    id: row.id,
    closeSessionId: row.close_session_id,
    tenantId: row.tenant_id,
    category: row.category as IssueItem['category'],
    severity: row.severity as IssueItem['severity'],
    status: row.status as IssueStatus,
    title: row.title,
    description: row.description ?? undefined,
    impactPl: row.impact_pl != null ? Number(row.impact_pl) : undefined,
    impactBs: row.impact_bs != null ? Number(row.impact_bs) : undefined,
    impactCash: row.impact_cash != null ? Number(row.impact_cash) : undefined,
    currency: row.currency ?? undefined,
    materialityEstimate: row.materiality_estimate != null ? Number(row.materiality_estimate) : undefined,
    materialityThresholdUsed: row.materiality_threshold_used != null ? Number(row.materiality_threshold_used) : undefined,
    confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : undefined,
    sourceRef: row.source_ref != null && typeof row.source_ref === 'object' ? (row.source_ref as Record<string, unknown>) : undefined,
    assignedTo: row.assigned_to ?? undefined,
    dueDate: row.due_date ?? undefined,
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS = `id, close_session_id, tenant_id, category, severity, status, title, description,
  impact_pl, impact_bs, impact_cash, currency, materiality_estimate, materiality_threshold_used,
  confidence_score, source_ref, assigned_to, due_date, created_by, updated_by, created_at, updated_at`;

export async function insertIssueItem(
  pool: Pool,
  id: string,
  input: {
    closeSessionId: string;
    tenantId: string;
    category: string;
    severity: string;
    status: string;
    title: string;
    description?: string | null;
    impactPl?: number | null;
    impactBs?: number | null;
    impactCash?: number | null;
    currency?: string | null;
    materialityEstimate?: number | null;
    materialityThresholdUsed?: number | null;
    confidenceScore?: number | null;
    sourceRef?: unknown;
    assignedTo?: string | null;
    dueDate?: string | null;
    createdBy?: string | null;
    updatedBy?: string | null;
  }
): Promise<IssueItem> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO issue_items (
      id, close_session_id, tenant_id, category, severity, status, title, description,
      impact_pl, impact_bs, impact_cash, currency, materiality_estimate, materiality_threshold_used,
      confidence_score, source_ref, assigned_to, due_date, created_by, updated_by, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $21
    )`,
    [
      id,
      input.closeSessionId,
      input.tenantId,
      input.category,
      input.severity,
      input.status,
      input.title,
      input.description ?? null,
      input.impactPl ?? null,
      input.impactBs ?? null,
      input.impactCash ?? null,
      input.currency ?? null,
      input.materialityEstimate ?? null,
      input.materialityThresholdUsed ?? null,
      input.confidenceScore ?? null,
      input.sourceRef != null ? JSON.stringify(input.sourceRef) : null,
      input.assignedTo ?? null,
      input.dueDate ?? null,
      input.createdBy ?? null,
      input.updatedBy ?? null,
      now,
    ]
  );
  const r = await pool.query<IssueItemRow>(
    `SELECT ${SELECT_COLS} FROM issue_items WHERE id = $1 AND tenant_id = $2`,
    [id, input.tenantId]
  );
  return rowToIssue(r.rows[0]);
}

export async function getIssueItemById(pool: Pool, tenantId: string, id: string): Promise<IssueItem | null> {
  const r = await pool.query<IssueItemRow>(
    `SELECT ${SELECT_COLS} FROM issue_items WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToIssue(row);
}

export async function listIssueItems(
  pool: Pool,
  filters: {
    tenantId: string;
    closeSessionId?: string;
    category?: string;
    severity?: string;
    status?: string;
    assignedTo?: string;
  }
): Promise<IssueItem[]> {
  const params: unknown[] = [filters.tenantId];
  let i = 2;
  const conditions: string[] = ['tenant_id = $1'];
  if (filters.closeSessionId) {
    conditions.push(`close_session_id = $${i}`);
    params.push(filters.closeSessionId);
    i += 1;
  }
  if (filters.category) {
    conditions.push(`category = $${i}`);
    params.push(filters.category);
    i += 1;
  }
  if (filters.severity) {
    conditions.push(`severity = $${i}`);
    params.push(filters.severity);
    i += 1;
  }
  if (filters.status) {
    conditions.push(`status = $${i}`);
    params.push(filters.status);
    i += 1;
  }
  if (filters.assignedTo) {
    conditions.push(`assigned_to = $${i}`);
    params.push(filters.assignedTo);
  }
  const sql = `SELECT ${SELECT_COLS} FROM issue_items WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
  const r = await pool.query<IssueItemRow>(sql, params);
  return r.rows.map(rowToIssue);
}

export async function updateIssueStatus(
  pool: Pool,
  tenantId: string,
  id: string,
  status: IssueStatus,
  updatedBy?: string
): Promise<IssueItem | null> {
  const now = new Date().toISOString();
  const r = await pool.query(
    'UPDATE issue_items SET status = $1, updated_by = COALESCE($2, updated_by), updated_at = $3 WHERE tenant_id = $4 AND id = $5',
    [status, updatedBy ?? null, now, tenantId, id]
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getIssueItemById(pool, tenantId, id);
}

export async function updateIssueAssignment(
  pool: Pool,
  tenantId: string,
  id: string,
  assignedTo: string | null,
  dueDate?: string | null,
  updatedBy?: string
): Promise<IssueItem | null> {
  const now = new Date().toISOString();
  const r = await pool.query(
    'UPDATE issue_items SET assigned_to = $1, due_date = COALESCE($2, due_date), updated_by = COALESCE($3, updated_by), updated_at = $4 WHERE tenant_id = $5 AND id = $6',
    [assignedTo, dueDate ?? null, updatedBy ?? null, now, tenantId, id]
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getIssueItemById(pool, tenantId, id);
}

export async function updateIssueItem(
  pool: Pool,
  tenantId: string,
  id: string,
  updates: Partial<{
    status: IssueStatus;
    title: string;
    description: string;
    severity: IssueSeverity;
    assignedTo: string | null;
    dueDate: string | null;
    updatedBy: string;
  }>
): Promise<IssueItem | null> {
  // Used for full PATCH; we have updateStatus and updateAssignment as dedicated methods, so keep this minimal or add if needed
  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = $1'];
  const params: unknown[] = [now];
  let i = 2;
  if (updates.status !== undefined) {
    setClauses.push(`status = $${i}`);
    params.push(updates.status);
    i += 1;
  }
  if (updates.title !== undefined) {
    setClauses.push(`title = $${i}`);
    params.push(updates.title);
    i += 1;
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${i}`);
    params.push(updates.description);
    i += 1;
  }
  if (updates.severity !== undefined) {
    setClauses.push(`severity = $${i}`);
    params.push(updates.severity);
    i += 1;
  }
  if (updates.assignedTo !== undefined) {
    setClauses.push(`assigned_to = $${i}`);
    params.push(updates.assignedTo);
    i += 1;
  }
  if (updates.dueDate !== undefined) {
    setClauses.push(`due_date = $${i}`);
    params.push(updates.dueDate);
    i += 1;
  }
  if (updates.updatedBy !== undefined) {
    setClauses.push(`updated_by = $${i}`);
    params.push(updates.updatedBy);
    i += 1;
  }
  if (params.length <= 1) return getIssueItemById(pool, tenantId, id);
  params.push(tenantId, id);
  const r = await pool.query(
    `UPDATE issue_items SET ${setClauses.join(', ')} WHERE tenant_id = $${i} AND id = $${i + 1}`,
    params
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getIssueItemById(pool, tenantId, id);
}
