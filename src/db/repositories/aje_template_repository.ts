/**
 * AJE templates — DB repository (tenant-scoped).
 */

import type { Pool } from 'pg';
import type { AjeTemplate, AjeTemplateLine, AjeTemplateApplication } from '../../types/aje_template.js';

interface TemplateRow {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  name: string;
  memo: string;
  lines: unknown;
  frequency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ApplicationRow {
  id: string;
  tenant_id: string;
  template_id: string;
  close_session_id: string;
  period_label: string;
  status: string;
  applied_je_id: string | null;
  skipped_at: string | null;
  created_at: string;
}

function rowToTemplate(row: TemplateRow): AjeTemplate {
  const lines = Array.isArray(row.lines)
    ? (row.lines as AjeTemplateLine[])
    : typeof row.lines === 'object' && row.lines != null
      ? Object.values(row.lines)
      : [];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id ?? undefined,
    name: row.name,
    memo: row.memo,
    lines,
    frequency: row.frequency as AjeTemplate['frequency'],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToApplication(row: ApplicationRow): AjeTemplateApplication {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    templateId: row.template_id,
    closeSessionId: row.close_session_id,
    periodLabel: row.period_label,
    status: row.status as AjeTemplateApplication['status'],
    appliedJeId: row.applied_je_id ?? undefined,
    skippedAt: row.skipped_at ?? undefined,
    createdAt: row.created_at,
  };
}

export async function insertTemplate(
  pool: Pool,
  id: string,
  input: {
    tenantId: string;
    entityId?: string;
    name: string;
    memo: string;
    lines: AjeTemplateLine[];
    frequency: 'monthly' | 'quarterly' | 'annually';
  }
): Promise<AjeTemplate> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tenant_aje_templates (id, tenant_id, entity_id, name, memo, lines, frequency, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, true, $8, $8)`,
    [
      id,
      input.tenantId,
      input.entityId ?? null,
      input.name,
      input.memo,
      JSON.stringify(input.lines),
      input.frequency ?? 'monthly',
      now,
    ]
  );
  const r = await pool.query<TemplateRow>(
    `SELECT id, tenant_id, entity_id, name, memo, lines, frequency, is_active, created_at, updated_at
     FROM tenant_aje_templates WHERE id = $1 AND tenant_id = $2`,
    [id, input.tenantId]
  );
  if (r.rows.length === 0) throw new Error('Template not found after insert');
  return rowToTemplate(r.rows[0]);
}

export async function getTemplateById(pool: Pool, tenantId: string, id: string): Promise<AjeTemplate | null> {
  const r = await pool.query<TemplateRow>(
    `SELECT id, tenant_id, entity_id, name, memo, lines, frequency, is_active, created_at, updated_at
     FROM tenant_aje_templates WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows.length > 0 ? rowToTemplate(r.rows[0]) : null;
}

export async function listTemplates(
  pool: Pool,
  tenantId: string,
  filters?: { entityId?: string; isActive?: boolean }
): Promise<AjeTemplate[]> {
  let sql = `SELECT id, tenant_id, entity_id, name, memo, lines, frequency, is_active, created_at, updated_at
             FROM tenant_aje_templates WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];
  if (filters?.entityId != null) {
    params.push(filters.entityId);
    sql += ` AND (entity_id IS NULL OR entity_id = $${params.length})`;
  }
  if (filters?.isActive != null) {
    params.push(filters.isActive);
    sql += ` AND is_active = $${params.length}`;
  }
  sql += ' ORDER BY name';
  const r = await pool.query<TemplateRow>(sql, params);
  return r.rows.map(rowToTemplate);
}

export async function updateTemplate(
  pool: Pool,
  tenantId: string,
  id: string,
  input: Partial<{ name: string; memo: string; lines: AjeTemplateLine[]; frequency: string; isActive: boolean }>
): Promise<AjeTemplate | null> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.name != null) {
    updates.push(`name = $${i++}`);
    params.push(input.name);
  }
  if (input.memo != null) {
    updates.push(`memo = $${i++}`);
    params.push(input.memo);
  }
  if (input.lines != null) {
    updates.push(`lines = $${i++}::jsonb`);
    params.push(JSON.stringify(input.lines));
  }
  if (input.frequency != null) {
    updates.push(`frequency = $${i++}`);
    params.push(input.frequency);
  }
  if (input.isActive != null) {
    updates.push(`is_active = $${i++}`);
    params.push(input.isActive);
  }
  if (updates.length === 0) return getTemplateById(pool, tenantId, id);
  const now = new Date().toISOString();
  updates.push(`updated_at = $${i++}`);
  params.push(now);
  params.push(id, tenantId);
  await pool.query(
    `UPDATE tenant_aje_templates SET ${updates.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`,
    params
  );
  return getTemplateById(pool, tenantId, id);
}

export async function insertApplication(
  pool: Pool,
  id: string,
  input: {
    tenantId: string;
    templateId: string;
    closeSessionId: string;
    periodLabel: string;
    status: 'proposed' | 'applied' | 'skipped';
    appliedJeId?: string;
    skippedAt?: string;
  }
): Promise<AjeTemplateApplication> {
  await pool.query(
    `INSERT INTO tenant_aje_template_applications (id, tenant_id, template_id, close_session_id, period_label, status, applied_je_id, skipped_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      input.tenantId,
      input.templateId,
      input.closeSessionId,
      input.periodLabel,
      input.status,
      input.appliedJeId ?? null,
      input.skippedAt ?? null,
    ]
  );
  const r = await pool.query<ApplicationRow>(
    `SELECT id, tenant_id, template_id, close_session_id, period_label, status, applied_je_id, skipped_at, created_at
     FROM tenant_aje_template_applications WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) throw new Error('Application not found after insert');
  return rowToApplication(r.rows[0]);
}

export async function getApplicationsForSession(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<AjeTemplateApplication[]> {
  const r = await pool.query<ApplicationRow>(
    `SELECT id, tenant_id, template_id, close_session_id, period_label, status, applied_je_id, skipped_at, created_at
     FROM tenant_aje_template_applications WHERE tenant_id = $1 AND close_session_id = $2 ORDER BY created_at`,
    [tenantId, closeSessionId]
  );
  return r.rows.map(rowToApplication);
}

export async function updateApplicationStatus(
  pool: Pool,
  tenantId: string,
  applicationId: string,
  status: 'applied' | 'skipped',
  appliedJeId?: string,
  skippedAt?: string
): Promise<AjeTemplateApplication | null> {
  const now = new Date().toISOString();
  if (status === 'applied') {
    await pool.query(
      `UPDATE tenant_aje_template_applications SET status = 'applied', applied_je_id = $1, skipped_at = NULL
       WHERE id = $2 AND tenant_id = $3`,
      [appliedJeId ?? null, applicationId, tenantId]
    );
  } else {
    await pool.query(
      `UPDATE tenant_aje_template_applications SET status = 'skipped', skipped_at = $1, applied_je_id = NULL
       WHERE id = $2 AND tenant_id = $3`,
      [skippedAt ?? now, applicationId, tenantId]
    );
  }
  const r = await pool.query<ApplicationRow>(
    `SELECT id, tenant_id, template_id, close_session_id, period_label, status, applied_je_id, skipped_at, created_at
     FROM tenant_aje_template_applications WHERE id = $1 AND tenant_id = $2`,
    [applicationId, tenantId]
  );
  return r.rows.length > 0 ? rowToApplication(r.rows[0]) : null;
}
