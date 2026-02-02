/**
 * Professional audit flags repository (Judgment Layer).
 * Flag-only; human sign-off via updateStatus.
 */

import type { Pool } from 'pg';
import type {
  ProfessionalAuditFlag,
  ProfessionalAuditFlagCategory,
  ProfessionalAuditFlagSeverity,
  ProfessionalAuditFlagStatus,
} from '../../types/professional_review.js';

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToFlag(row: {
  id: string;
  tenant_id: string;
  period_label: string | null;
  run_id: string | null;
  category: string;
  severity: string;
  message: string;
  recommendation: string;
  citation_standard: string;
  citation_excerpt: string | null;
  source_document_id: string | null;
  source_document_line: string | null;
  status: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}): ProfessionalAuditFlag {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label ?? undefined,
    runId: row.run_id ?? undefined,
    category: row.category as ProfessionalAuditFlagCategory,
    severity: row.severity as ProfessionalAuditFlagSeverity,
    message: row.message,
    recommendation: row.recommendation,
    citationStandard: row.citation_standard,
    citationExcerpt: row.citation_excerpt ?? undefined,
    sourceDocumentId: row.source_document_id ?? undefined,
    sourceDocumentLine: row.source_document_line ?? undefined,
    status: row.status as ProfessionalAuditFlagStatus,
    acknowledgedAt: row.acknowledged_at ?? undefined,
    acknowledgedBy: row.acknowledged_by ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateProfessionalAuditFlagInput {
  tenantId: string;
  periodLabel?: string;
  runId?: string;
  category: ProfessionalAuditFlagCategory;
  severity: ProfessionalAuditFlagSeverity;
  message: string;
  recommendation: string;
  citationStandard: string;
  citationExcerpt?: string;
  sourceDocumentId?: string;
  sourceDocumentLine?: string;
}

export async function create(
  pool: Pool,
  input: CreateProfessionalAuditFlagInput
): Promise<ProfessionalAuditFlag> {
  const id = nextId('paf');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO professional_audit_flags (
      id, tenant_id, period_label, run_id, category, severity, message, recommendation,
      citation_standard, citation_excerpt, source_document_id, source_document_line,
      status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'open', $13, $14)`,
    [
      id,
      input.tenantId,
      input.periodLabel ?? null,
      input.runId ?? null,
      input.category,
      input.severity,
      input.message,
      input.recommendation,
      input.citationStandard,
      input.citationExcerpt ?? null,
      input.sourceDocumentId ?? null,
      input.sourceDocumentLine ?? null,
      now,
      now,
    ]
  );
  return {
    id,
    tenantId: input.tenantId,
    periodLabel: input.periodLabel,
    runId: input.runId,
    category: input.category,
    severity: input.severity,
    message: input.message,
    recommendation: input.recommendation,
    citationStandard: input.citationStandard,
    citationExcerpt: input.citationExcerpt,
    sourceDocumentId: input.sourceDocumentId,
    sourceDocumentLine: input.sourceDocumentLine,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
}

export async function list(
  pool: Pool,
  tenantId: string,
  params?: {
    periodLabel?: string;
    runId?: string;
    category?: ProfessionalAuditFlagCategory;
    status?: ProfessionalAuditFlagStatus;
    limit?: number;
  }
): Promise<ProfessionalAuditFlag[]> {
  let sql =
    'SELECT id, tenant_id, period_label, run_id, category, severity, message, recommendation, citation_standard, citation_excerpt, source_document_id, source_document_line, status, acknowledged_at, acknowledged_by, resolved_at, resolved_by, note, created_at, updated_at FROM professional_audit_flags WHERE tenant_id = $1';
  const args: unknown[] = [tenantId];
  let i = 2;
  if (params?.periodLabel) {
    sql += ` AND period_label = $${i}`;
    args.push(params.periodLabel);
    i += 1;
  }
  if (params?.runId) {
    sql += ` AND run_id = $${i}`;
    args.push(params.runId);
    i += 1;
  }
  if (params?.category) {
    sql += ` AND category = $${i}`;
    args.push(params.category);
    i += 1;
  }
  if (params?.status) {
    sql += ` AND status = $${i}`;
    args.push(params.status);
    i += 1;
  }
  sql += ' ORDER BY created_at DESC';
  if (params?.limit != null && params.limit > 0) {
    sql += ` LIMIT $${i}`;
    args.push(params.limit);
  }
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string | null;
    run_id: string | null;
    category: string;
    severity: string;
    message: string;
    recommendation: string;
    citation_standard: string;
    citation_excerpt: string | null;
    source_document_id: string | null;
    source_document_line: string | null;
    status: string;
    acknowledged_at: string | null;
    acknowledged_by: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>(sql, args);
  return r.rows.map(rowToFlag);
}

/** Returns MAX(created_at) for tenant+period, or null if no flags (no completed review run). */
export async function getLatestReviewRunAt(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<string | null> {
  const r = await pool.query<{ created_at: string }>(
    'SELECT MAX(created_at) AS created_at FROM professional_audit_flags WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
  const row = r.rows[0];
  return row?.created_at ?? null;
}

export async function get(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<ProfessionalAuditFlag | null> {
  const r = await pool.query<Parameters<typeof rowToFlag>[0]>(
    'SELECT id, tenant_id, period_label, run_id, category, severity, message, recommendation, citation_standard, citation_excerpt, source_document_id, source_document_line, status, acknowledged_at, acknowledged_by, resolved_at, resolved_by, note, created_at, updated_at FROM professional_audit_flags WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToFlag(row);
}

export async function updateStatus(
  pool: Pool,
  id: string,
  tenantId: string,
  update: {
    status: ProfessionalAuditFlagStatus;
    acknowledgedBy?: string;
    resolvedBy?: string;
    note?: string;
  }
): Promise<ProfessionalAuditFlag | null> {
  const now = new Date().toISOString();
  if (update.status === 'acknowledged') {
    await pool.query(
      'UPDATE professional_audit_flags SET status = $1, acknowledged_at = $2, acknowledged_by = $3, note = COALESCE($4, note), updated_at = $5 WHERE id = $6 AND tenant_id = $7',
      [update.status, now, update.acknowledgedBy ?? null, update.note ?? null, now, id, tenantId]
    );
  } else if (update.status === 'resolved') {
    await pool.query(
      'UPDATE professional_audit_flags SET status = $1, resolved_at = $2, resolved_by = $3, note = COALESCE($4, note), updated_at = $5 WHERE id = $6 AND tenant_id = $7',
      [update.status, now, update.resolvedBy ?? null, update.note ?? null, now, id, tenantId]
    );
  } else {
    await pool.query(
      'UPDATE professional_audit_flags SET status = $1, note = COALESCE($2, note), updated_at = $3 WHERE id = $4 AND tenant_id = $5',
      [update.status, update.note ?? null, now, id, tenantId]
    );
  }
  return get(pool, id, tenantId);
}
