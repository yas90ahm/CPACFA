/**
 * Close checklist templates per tenant — one per period_type (monthly, quarterly, annual).
 */

import type { Pool } from 'pg';

export interface CloseChecklistTemplateStepSpec {
  label: string;
  controlId?: string;
  dueOffsetDays?: number;
  assignee?: string;
}

export interface CloseChecklistTemplateRow {
  id: string;
  tenantId: string;
  name: string;
  stepsSpec: CloseChecklistTemplateStepSpec[];
  periodType: 'monthly' | 'quarterly' | 'annual';
  updatedAt: string;
}

function nextId(): string {
  return `cct-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToTemplate(row: {
  id: string;
  tenant_id: string;
  name: string;
  steps_spec: unknown;
  period_type: string;
  updated_at: string;
}): CloseChecklistTemplateRow {
  const stepsSpec = Array.isArray(row.steps_spec)
    ? (row.steps_spec as CloseChecklistTemplateStepSpec[])
    : [];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    stepsSpec,
    periodType: row.period_type as 'monthly' | 'quarterly' | 'annual',
    updatedAt: row.updated_at,
  };
}

export async function getTemplate(
  pool: Pool,
  tenantId: string,
  periodType: 'monthly' | 'quarterly' | 'annual'
): Promise<CloseChecklistTemplateRow | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    name: string;
    steps_spec: unknown;
    period_type: string;
    updated_at: string;
  }>(
    'SELECT id, tenant_id, name, steps_spec, period_type, updated_at FROM close_checklist_templates WHERE tenant_id = $1 AND period_type = $2',
    [tenantId, periodType]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToTemplate(row);
}

export async function listTemplates(
  pool: Pool,
  tenantId: string
): Promise<CloseChecklistTemplateRow[]> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    name: string;
    steps_spec: unknown;
    period_type: string;
    updated_at: string;
  }>(
    'SELECT id, tenant_id, name, steps_spec, period_type, updated_at FROM close_checklist_templates WHERE tenant_id = $1 ORDER BY period_type',
    [tenantId]
  );
  return r.rows.map(rowToTemplate);
}

export async function upsertTemplate(
  pool: Pool,
  tenantId: string,
  periodType: 'monthly' | 'quarterly' | 'annual',
  input: { name?: string; stepsSpec: CloseChecklistTemplateStepSpec[] }
): Promise<CloseChecklistTemplateRow> {
  const now = new Date().toISOString();
  const name = input.name ?? 'Default';
  const id = nextId();
  await pool.query(
    `INSERT INTO close_checklist_templates (id, tenant_id, name, steps_spec, period_type, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, period_type)
     DO UPDATE SET name = $3, steps_spec = $4, updated_at = $6`,
    [id, tenantId, name, JSON.stringify(input.stepsSpec), periodType, now]
  );
  const got = await getTemplate(pool, tenantId, periodType);
  return got!;
}
