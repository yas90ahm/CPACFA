/**
 * Control assertions — map controls to assertions/risks (tenant-scoped).
 */

import type { Pool } from 'pg';
import type { ControlAssertion } from '../../types/close_and_controls.js';

function nextId(): string {
  return `ca-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToAssertion(row: {
  id: string;
  control_id: string;
  assertion_label: string;
  risk_category: string | null;
  created_at: string;
}): ControlAssertion {
  return {
    id: row.id,
    controlId: row.control_id,
    assertionLabel: row.assertion_label,
    riskCategory: row.risk_category ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listAssertionsForControl(
  pool: Pool,
  tenantId: string,
  controlId: string
): Promise<ControlAssertion[]> {
  const r = await pool.query<{
    id: string;
    control_id: string;
    assertion_label: string;
    risk_category: string | null;
    created_at: string;
  }>(
    'SELECT id, control_id, assertion_label, risk_category, created_at FROM control_assertions WHERE tenant_id = $1 AND control_id = $2 ORDER BY assertion_label',
    [tenantId, controlId]
  );
  return r.rows.map(rowToAssertion);
}

export async function addAssertion(
  pool: Pool,
  tenantId: string,
  controlId: string,
  assertionLabel: string,
  riskCategory?: string
): Promise<ControlAssertion> {
  const id = nextId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO control_assertions (id, tenant_id, control_id, assertion_label, risk_category, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, control_id, assertion_label) DO UPDATE SET risk_category = $5`,
    [id, tenantId, controlId, assertionLabel, riskCategory ?? null, now]
  );
  const r = await pool.query<{
    id: string;
    control_id: string;
    assertion_label: string;
    risk_category: string | null;
    created_at: string;
  }>(
    'SELECT id, control_id, assertion_label, risk_category, created_at FROM control_assertions WHERE tenant_id = $1 AND control_id = $2 AND assertion_label = $3',
    [tenantId, controlId, assertionLabel]
  );
  const row = r.rows[0];
  return row ? rowToAssertion(row) : { id, controlId, assertionLabel, riskCategory, createdAt: now };
}

export async function deleteAssertion(
  pool: Pool,
  tenantId: string,
  assertionId: string
): Promise<boolean> {
  const r = await pool.query(
    'DELETE FROM control_assertions WHERE id = $1 AND tenant_id = $2',
    [assertionId, tenantId]
  );
  return (r.rowCount ?? 0) > 0;
}
