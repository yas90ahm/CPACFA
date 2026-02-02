/**
 * Close audit trail — per period/run: standard used, prior period, key assumptions.
 */

import type { Pool } from 'pg';

function nextId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createAuditTrailRecord(
  pool: Pool,
  tenantId: string,
  record: {
    periodLabel: string;
    runId?: string;
    standard?: string;
    priorPeriodLabel?: string;
    assumptions?: Record<string, unknown>;
  }
): Promise<void> {
  const id = nextId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO close_audit_trail (id, tenant_id, period_label, run_id, standard, prior_period_label, assumptions, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      tenantId,
      record.periodLabel,
      record.runId ?? null,
      record.standard ?? null,
      record.priorPeriodLabel ?? null,
      JSON.stringify(record.assumptions ?? {}),
      now,
    ]
  );
}
