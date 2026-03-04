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
  consecutive_unchanged_applications: number;
  auto_apply_eligible: boolean;
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
  skip_reason: string | null;
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
    consecutiveUnchangedApplications: row.consecutive_unchanged_applications ?? 0,
    autoApplyEligible: row.auto_apply_eligible ?? false,
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
    skipReason: row.skip_reason ?? undefined,
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
    `SELECT id, tenant_id, entity_id, name, memo, lines, frequency, is_active,
       consecutive_unchanged_applications, auto_apply_eligible, created_at, updated_at
     FROM tenant_aje_templates WHERE id = $1 AND tenant_id = $2`,
    [id, input.tenantId]
  );
  if (r.rows.length === 0) throw new Error('Template not found after insert');
  return rowToTemplate(r.rows[0]);
}

export async function getTemplateById(pool: Pool, tenantId: string, id: string): Promise<AjeTemplate | null> {
  const r = await pool.query<TemplateRow>(
    `SELECT id, tenant_id, entity_id, name, memo, lines, frequency, is_active,
       consecutive_unchanged_applications, auto_apply_eligible, created_at, updated_at
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
  let sql = `SELECT id, tenant_id, entity_id, name, memo, lines, frequency, is_active,
       consecutive_unchanged_applications, auto_apply_eligible, created_at, updated_at
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
    // Reset consecutive counter when template lines change
    updates.push('consecutive_unchanged_applications = 0', 'auto_apply_eligible = FALSE');
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

/** Get templates eligible for auto-apply (consecutive unchanged >= N and auto_apply_eligible). */
export async function getAutoApplyEligibleTemplates(
  pool: Pool,
  tenantId: string,
  entityId?: string,
  minConsecutive?: number
): Promise<AjeTemplate[]> {
  const n = minConsecutive ?? 3;
  let sql = `SELECT id, tenant_id, entity_id, name, memo, lines, frequency, is_active,
       consecutive_unchanged_applications, auto_apply_eligible, created_at, updated_at
     FROM tenant_aje_templates
     WHERE tenant_id = $1 AND is_active = TRUE AND auto_apply_eligible = TRUE
       AND consecutive_unchanged_applications >= $2`;
  const params: unknown[] = [tenantId, n];
  if (entityId) {
    params.push(entityId);
    sql += ` AND (entity_id IS NULL OR entity_id = $${params.length})`;
  }
  sql += ` ORDER BY name`;
  const r = await pool.query<TemplateRow>(sql, params);
  return r.rows.map(rowToTemplate);
}

/** Increment consecutive unchanged counter and set eligible if threshold met. */
export async function incrementConsecutiveUnchanged(
  pool: Pool,
  tenantId: string,
  templateId: string,
  threshold: number
): Promise<void> {
  await pool.query(
    `UPDATE tenant_aje_templates
     SET consecutive_unchanged_applications = consecutive_unchanged_applications + 1,
         auto_apply_eligible = CASE WHEN consecutive_unchanged_applications + 1 >= $1 THEN TRUE ELSE auto_apply_eligible END,
         updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3`,
    [threshold, templateId, tenantId]
  );
}

/** Reset consecutive counter when a template is modified. */
export async function resetConsecutiveUnchanged(
  pool: Pool,
  tenantId: string,
  templateId: string
): Promise<void> {
  await pool.query(
    `UPDATE tenant_aje_templates
     SET consecutive_unchanged_applications = 0, auto_apply_eligible = FALSE, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [templateId, tenantId]
  );
}

export async function insertApplication(
  pool: Pool,
  id: string,
  input: {
    tenantId: string;
    templateId: string;
    closeSessionId: string;
    periodLabel: string;
    status: 'proposed' | 'applied' | 'skipped' | 'auto_applied';
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
    `SELECT id, tenant_id, template_id, close_session_id, period_label, status, applied_je_id, skipped_at, skip_reason, created_at
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
    `SELECT id, tenant_id, template_id, close_session_id, period_label, status, applied_je_id, skipped_at, skip_reason, created_at
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
  options?: { appliedJeId?: string; skippedAt?: string; skipReason?: string }
): Promise<AjeTemplateApplication | null> {
  const now = new Date().toISOString();
  if (status === 'applied') {
    await pool.query(
      `UPDATE tenant_aje_template_applications SET status = 'applied', applied_je_id = $1, skipped_at = NULL, skip_reason = NULL
       WHERE id = $2 AND tenant_id = $3`,
      [options?.appliedJeId ?? null, applicationId, tenantId]
    );
  } else {
    await pool.query(
      `UPDATE tenant_aje_template_applications SET status = 'skipped', skipped_at = $1, applied_je_id = NULL, skip_reason = $4
       WHERE id = $2 AND tenant_id = $3`,
      [options?.skippedAt ?? now, applicationId, tenantId, options?.skipReason ?? null]
    );
  }
  const r = await pool.query<ApplicationRow>(
    `SELECT id, tenant_id, template_id, close_session_id, period_label, status, applied_je_id, skipped_at, skip_reason, created_at
     FROM tenant_aje_template_applications WHERE id = $1 AND tenant_id = $2`,
    [applicationId, tenantId]
  );
  return r.rows.length > 0 ? rowToApplication(r.rows[0]) : null;
}
