/**
 * Unified close issues — DB repository (tenant_close_issues + tenant_close_issue_history).
 */

import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;
import type {
  CloseIssue,
  CloseIssueStatus,
  IssueHistoryEntry,
  CreateCloseIssueInput,
  ResolutionType,
} from '../../types/close_issue.js';

interface IssueRow {
  issue_id: string;
  tenant_id: string;
  period_id: string;
  entity_id: string;
  issue_type: string;
  severity: string;
  category: string;
  status: string;
  title: string;
  description: string;
  affected_accounts: string[] | null;
  affected_amount: string | null;
  source_check: string | null;
  source_details: unknown;
  assigned_to: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  resolution_type: string | null;
  resolution_description: string | null;
  resolution_aje_id: string | null;
  resolution_recon_id: string | null;
  resolution_mapping_change: unknown;
  resolved_by: string | null;
  resolved_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_method: string | null;
  created_at: string;
  updated_at: string;
}

const COLS = `issue_id, tenant_id, period_id, entity_id, issue_type, severity, category, status,
  title, description, affected_accounts, affected_amount, source_check, source_details,
  assigned_to, assigned_at, assigned_by,
  resolution_type, resolution_description, resolution_aje_id, resolution_recon_id, resolution_mapping_change,
  resolved_by, resolved_at, verified_by, verified_at, verification_method,
  created_at, updated_at`;

function rowToIssue(r: IssueRow): CloseIssue {
  return {
    issueId: r.issue_id,
    tenantId: r.tenant_id,
    periodId: r.period_id,
    entityId: r.entity_id,
    issueType: r.issue_type as CloseIssue['issueType'],
    severity: r.severity as CloseIssue['severity'],
    category: r.category as CloseIssue['category'],
    status: r.status as CloseIssueStatus,
    title: r.title,
    description: r.description ?? '',
    affectedAccounts: r.affected_accounts ?? [],
    affectedAmount: r.affected_amount,
    sourceCheck: r.source_check,
    sourceDetails:
      r.source_details != null && typeof r.source_details === 'object'
        ? (r.source_details as Record<string, unknown>)
        : {},
    assignedTo: r.assigned_to,
    assignedAt: r.assigned_at,
    assignedBy: r.assigned_by,
    resolutionType: r.resolution_type as CloseIssue['resolutionType'],
    resolutionDescription: r.resolution_description,
    resolutionAjeId: r.resolution_aje_id,
    resolutionReconId: r.resolution_recon_id,
    resolutionMappingChange:
      r.resolution_mapping_change != null && typeof r.resolution_mapping_change === 'object'
        ? (r.resolution_mapping_change as Record<string, unknown>)
        : null,
    resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at,
    verifiedBy: r.verified_by,
    verifiedAt: r.verified_at,
    verificationMethod: r.verification_method,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function insertCloseIssue(
  client: Queryable,
  issueId: string,
  input: CreateCloseIssueInput & { status: CloseIssueStatus }
): Promise<CloseIssue> {
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO tenant_close_issues (
      issue_id, tenant_id, period_id, entity_id, issue_type, severity, category, status,
      title, description, affected_accounts, affected_amount, source_check, source_details,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
    [
      issueId,
      input.tenantId,
      input.periodId,
      input.entityId,
      input.issueType,
      input.severity,
      input.category,
      input.status,
      input.title,
      input.description ?? '',
      input.affectedAccounts?.length ? input.affectedAccounts : [],
      input.affectedAmount ?? null,
      input.sourceCheck ?? null,
      input.sourceDetails ? JSON.stringify(input.sourceDetails) : '{}',
      now,
    ]
  );
  const r = await client.query<IssueRow>(
    `SELECT ${COLS} FROM tenant_close_issues WHERE issue_id = $1 AND tenant_id = $2`,
    [issueId, input.tenantId]
  );
  return rowToIssue(r.rows[0]);
}

export async function getCloseIssueById(
  client: Queryable,
  tenantId: string,
  issueId: string
): Promise<CloseIssue | null> {
  const r = await client.query<IssueRow>(
    `SELECT ${COLS} FROM tenant_close_issues WHERE tenant_id = $1 AND issue_id = $2`,
    [tenantId, issueId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToIssue(row);
}

export async function listCloseIssues(
  client: Queryable,
  filters: {
    tenantId: string;
    periodId?: string;
    status?: CloseIssueStatus;
    severity?: string;
    category?: string;
    issueType?: string;
  }
): Promise<CloseIssue[]> {
  const params: unknown[] = [filters.tenantId];
  const conditions: string[] = ['tenant_id = $1'];
  let i = 2;
  if (filters.periodId) {
    conditions.push(`period_id = $${i}`);
    params.push(filters.periodId);
    i += 1;
  }
  if (filters.status) {
    conditions.push(`status = $${i}`);
    params.push(filters.status);
    i += 1;
  }
  if (filters.severity) {
    conditions.push(`severity = $${i}`);
    params.push(filters.severity);
    i += 1;
  }
  if (filters.category) {
    conditions.push(`category = $${i}`);
    params.push(filters.category);
    i += 1;
  }
  if (filters.issueType) {
    conditions.push(`issue_type = $${i}`);
    params.push(filters.issueType);
    i += 1;
  }
  const r = await client.query<IssueRow>(
    `SELECT ${COLS} FROM tenant_close_issues WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params
  );
  return r.rows.map(rowToIssue);
}

export async function appendIssueHistory(
  client: Queryable,
  issueId: string,
  fromStatus: CloseIssueStatus,
  toStatus: CloseIssueStatus,
  changedBy: string,
  comment?: string | null
): Promise<void> {
  const historyId = randomUUID();
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO tenant_close_issue_history (history_id, issue_id, from_status, to_status, changed_by, changed_at, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [historyId, issueId, fromStatus, toStatus, changedBy, now, comment ?? null]
  );
}

export async function getIssueHistory(
  client: Queryable,
  issueId: string
): Promise<IssueHistoryEntry[]> {
  const r = await client.query<{
    history_id: string;
    issue_id: string;
    from_status: string;
    to_status: string;
    changed_by: string;
    changed_at: string;
    comment: string | null;
  }>(
    `SELECT history_id, issue_id, from_status, to_status, changed_by, changed_at, comment
     FROM tenant_close_issue_history WHERE issue_id = $1 ORDER BY changed_at ASC`,
    [issueId]
  );
  return r.rows.map((row) => ({
    historyId: row.history_id,
    issueId: row.issue_id,
    fromStatus: row.from_status as CloseIssueStatus,
    toStatus: row.to_status as CloseIssueStatus,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    comment: row.comment,
  }));
}

export async function updateIssueStatus(
  client: Queryable,
  tenantId: string,
  issueId: string,
  status: CloseIssueStatus,
  extra: Partial<{
    assignedTo: string | null;
    assignedAt: string;
    assignedBy: string | null;
    resolutionType: ResolutionType | null;
    resolutionDescription: string | null;
    resolutionAjeId: string | null;
    resolutionReconId: string | null;
    resolutionMappingChange: Record<string, unknown> | null;
    resolvedBy: string | null;
    resolvedAt: string;
    verifiedBy: string | null;
    verifiedAt: string;
    verificationMethod: string | null;
  }> = {}
): Promise<CloseIssue | null> {
  const now = new Date().toISOString();
  const sets: string[] = ['status = $1', 'updated_at = $2'];
  const params: unknown[] = [status, now];
  let i = 3;
  if (extra.assignedTo !== undefined) {
    sets.push(`assigned_to = $${i}`);
    params.push(extra.assignedTo);
    i += 1;
  }
  if (extra.assignedAt !== undefined) {
    sets.push(`assigned_at = $${i}`);
    params.push(extra.assignedAt);
    i += 1;
  }
  if (extra.assignedBy !== undefined) {
    sets.push(`assigned_by = $${i}`);
    params.push(extra.assignedBy);
    i += 1;
  }
  if (extra.resolutionType !== undefined) {
    sets.push(`resolution_type = $${i}`);
    params.push(extra.resolutionType);
    i += 1;
  }
  if (extra.resolutionDescription !== undefined) {
    sets.push(`resolution_description = $${i}`);
    params.push(extra.resolutionDescription);
    i += 1;
  }
  if (extra.resolutionAjeId !== undefined) {
    sets.push(`resolution_aje_id = $${i}`);
    params.push(extra.resolutionAjeId);
    i += 1;
  }
  if (extra.resolutionReconId !== undefined) {
    sets.push(`resolution_recon_id = $${i}`);
    params.push(extra.resolutionReconId);
    i += 1;
  }
  if (extra.resolutionMappingChange !== undefined) {
    sets.push(`resolution_mapping_change = $${i}`);
    params.push(extra.resolutionMappingChange ? JSON.stringify(extra.resolutionMappingChange) : null);
    i += 1;
  }
  if (extra.resolvedBy !== undefined) {
    sets.push(`resolved_by = $${i}`);
    params.push(extra.resolvedBy);
    i += 1;
  }
  if (extra.resolvedAt !== undefined) {
    sets.push(`resolved_at = $${i}`);
    params.push(extra.resolvedAt);
    i += 1;
  }
  if (extra.verifiedBy !== undefined) {
    sets.push(`verified_by = $${i}`);
    params.push(extra.verifiedBy);
    i += 1;
  }
  if (extra.verifiedAt !== undefined) {
    sets.push(`verified_at = $${i}`);
    params.push(extra.verifiedAt);
    i += 1;
  }
  if (extra.verificationMethod !== undefined) {
    sets.push(`verification_method = $${i}`);
    params.push(extra.verificationMethod);
    i += 1;
  }
  params.push(tenantId, issueId);
  const r = await client.query(
    `UPDATE tenant_close_issues SET ${sets.join(', ')} WHERE tenant_id = $${i} AND issue_id = $${i + 1}`,
    params
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return getCloseIssueById(client, tenantId, issueId);
}
