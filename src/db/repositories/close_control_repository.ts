/**
 * Close controls catalogue — DB repository (tenant-scoped).
 * control_evidence links rec/sampling/PBC evidence to controls.
 */

import type { Pool } from 'pg';
import type { CloseControl } from '../../types/close_and_controls.js';

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToControl(row: {
  id: string;
  name: string;
  description: string | null;
  owner: string | null;
  frequency: string | null;
  evidence_type: string | null;
}): CloseControl {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    owner: row.owner ?? undefined,
    frequency: (row.frequency as CloseControl['frequency']) ?? undefined,
    evidenceType: (row.evidence_type as CloseControl['evidenceType']) ?? undefined,
  };
}

export async function createControl(
  pool: Pool,
  tenantId: string,
  control: Omit<CloseControl, 'id'>
): Promise<CloseControl> {
  const id = nextId('ctrl');
  await pool.query(
    `INSERT INTO close_controls (id, tenant_id, name, description, owner, frequency, evidence_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      tenantId,
      control.name,
      control.description ?? null,
      control.owner ?? null,
      control.frequency ?? null,
      control.evidenceType ?? null,
    ]
  );
  return { ...control, id };
}

export async function getControl(pool: Pool, tenantId: string, id: string): Promise<CloseControl | null> {
  const r = await pool.query<{
    id: string;
    name: string;
    description: string | null;
    owner: string | null;
    frequency: string | null;
    evidence_type: string | null;
  }>('SELECT id, name, description, owner, frequency, evidence_type FROM close_controls WHERE id = $1 AND tenant_id = $2', [
    id,
    tenantId,
  ]);
  const row = r.rows[0];
  if (!row) return null;
  return rowToControl(row);
}

export async function listControls(pool: Pool, tenantId: string): Promise<CloseControl[]> {
  const r = await pool.query<{
    id: string;
    name: string;
    description: string | null;
    owner: string | null;
    frequency: string | null;
    evidence_type: string | null;
  }>('SELECT id, name, description, owner, frequency, evidence_type FROM close_controls WHERE tenant_id = $1 ORDER BY name', [
    tenantId,
  ]);
  return r.rows.map(rowToControl);
}

export async function updateControl(
  pool: Pool,
  tenantId: string,
  id: string,
  patch: Partial<Omit<CloseControl, 'id'>>
): Promise<CloseControl | null> {
  const existing = await getControl(pool, tenantId, id);
  if (!existing) return null;
  const name = patch.name ?? existing.name;
  const description = patch.description !== undefined ? patch.description : existing.description;
  const owner = patch.owner !== undefined ? patch.owner : existing.owner;
  const frequency = patch.frequency !== undefined ? patch.frequency : existing.frequency;
  const evidenceType = patch.evidenceType !== undefined ? patch.evidenceType : existing.evidenceType;
  await pool.query(
    `UPDATE close_controls SET name = $1, description = $2, owner = $3, frequency = $4, evidence_type = $5 WHERE id = $6 AND tenant_id = $7`,
    [name, description ?? null, owner ?? null, frequency ?? null, evidenceType ?? null, id, tenantId]
  );
  return { ...existing, ...patch, id };
}

/** Control evidence link (rec/sampling/PBC → control). */
export interface ControlEvidenceRow {
  id: string;
  tenantId: string;
  controlId: string;
  evidenceType: string;
  evidenceId: string;
  periodLabel: string;
  createdAt: string;
}

export async function linkControlEvidence(
  pool: Pool,
  tenantId: string,
  params: { controlId: string; evidenceType: string; evidenceId: string; periodLabel: string }
): Promise<ControlEvidenceRow> {
  const id = nextId('ce');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO control_evidence (id, tenant_id, control_id, evidence_type, evidence_id, period_label, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, tenantId, params.controlId, params.evidenceType, params.evidenceId, params.periodLabel, now]
  );
  return {
    id,
    tenantId,
    controlId: params.controlId,
    evidenceType: params.evidenceType,
    evidenceId: params.evidenceId,
    periodLabel: params.periodLabel,
    createdAt: now,
  };
}

export async function listControlEvidenceByPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<ControlEvidenceRow[]> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    control_id: string;
    evidence_type: string;
    evidence_id: string;
    period_label: string;
    created_at: string;
  }>('SELECT * FROM control_evidence WHERE tenant_id = $1 AND period_label = $2 ORDER BY created_at DESC', [
    tenantId,
    periodLabel,
  ]);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    controlId: row.control_id,
    evidenceType: row.evidence_type,
    evidenceId: row.evidence_id,
    periodLabel: row.period_label,
    createdAt: row.created_at,
  }));
}

export async function listControlEvidenceByControl(
  pool: Pool,
  tenantId: string,
  controlId: string,
  periodLabel?: string
): Promise<ControlEvidenceRow[]> {
  let sql = 'SELECT * FROM control_evidence WHERE tenant_id = $1 AND control_id = $2';
  const params: unknown[] = [tenantId, controlId];
  if (periodLabel) {
    sql += ' AND period_label = $3';
    params.push(periodLabel);
  }
  sql += ' ORDER BY created_at DESC';
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    control_id: string;
    evidence_type: string;
    evidence_id: string;
    period_label: string;
    created_at: string;
  }>(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    controlId: row.control_id,
    evidenceType: row.evidence_type,
    evidenceId: row.evidence_id,
    periodLabel: row.period_label,
    createdAt: row.created_at,
  }));
}
