/**
 * KPI snapshots per tenant — DB when pool/tenantId present.
 */

import type { Pool } from 'pg';
import type { CFOKPIs } from '../../types/cfo-dashboard.js';
import type { KPISnapshot } from '../../types/kpi_history.js';

export async function append(
  pool: Pool,
  tenantId: string,
  snapshot: { id: string; periodLabel: string; asAt: string; kpis: CFOKPIs }
): Promise<KPISnapshot> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO kpi_snapshots (id, tenant_id, period_label, as_at, kpis, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [snapshot.id, tenantId, snapshot.periodLabel, snapshot.asAt, JSON.stringify(snapshot.kpis), now]
  );
  return {
    id: snapshot.id,
    periodLabel: snapshot.periodLabel,
    asAt: snapshot.asAt,
    kpis: snapshot.kpis,
    createdAt: now,
  };
}

export async function list(
  pool: Pool,
  tenantId: string,
  filters?: { periodLabel?: string; from?: string; to?: string; limit?: number }
): Promise<KPISnapshot[]> {
  const params: unknown[] = [tenantId];
  let sql = 'SELECT id, tenant_id, period_label, as_at, kpis, created_at FROM kpi_snapshots WHERE tenant_id = $1';
  if (filters?.periodLabel) {
    params.push(filters.periodLabel);
    sql += ` AND period_label = $${params.length}`;
  }
  if (filters?.from) {
    params.push(filters.from);
    sql += ` AND as_at >= $${params.length}`;
  }
  if (filters?.to) {
    params.push(filters.to);
    sql += ` AND as_at <= $${params.length}`;
  }
  sql += ' ORDER BY as_at DESC';
  const limit = Math.min(500, Math.max(1, filters?.limit ?? 50));
  params.push(limit);
  sql += ` LIMIT $${params.length}`;
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string;
    as_at: string;
    kpis: unknown;
    created_at: string;
  }>(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    periodLabel: row.period_label,
    asAt: row.as_at,
    kpis: row.kpis as CFOKPIs,
    createdAt: row.created_at,
  }));
}
