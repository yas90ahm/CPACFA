/**
 * Portfolio Service
 *
 * Cross-tenant aggregation for PE operating partners.
 * Queries close session status, issues, and summaries across entities
 * the operating partner has access to via portfolio_access.
 */

import type { Pool } from 'pg';
import { getTenantPool } from '../db/index.js';

export interface PortfolioEntity {
  tenant_id: string;
  tenant_name: string;
}

export interface PortfolioEntitySummary {
  id: string;
  name: string;
  currentPeriod: string | null;
  currentState: string;
  daysInClose: number | null;
  avgCloseDuration: number | null;
  blockingIssues: number;
  gatesPassing: number;
  gatesTotal: number;
  lastCertifiedAt: string | null;
  revenue: string | null;
  netIncome: string | null;
}

/** Get tenants the user has portfolio access to. */
export async function getPortfolioEntities(
  controlPool: Pool,
  userId: string
): Promise<PortfolioEntity[]> {
  const r = await controlPool.query<{ tenant_id: string; tenant_name: string }>(
    `SELECT pa.tenant_id, t.name AS tenant_name
     FROM portfolio_access pa
     JOIN tenants t ON t.id = pa.tenant_id
     WHERE pa.user_id = $1
     ORDER BY t.name`,
    [userId]
  );
  return r.rows;
}

/** Get portfolio summary across all accessible tenants. */
export async function getPortfolioSummary(
  controlPool: Pool,
  userId: string
): Promise<PortfolioEntitySummary[]> {
  const entities = await getPortfolioEntities(controlPool, userId);
  const results: PortfolioEntitySummary[] = [];

  for (const entity of entities) {
    let pool: Pool;
    try {
      pool = await getTenantPool(entity.tenant_id);
    } catch {
      continue;
    }

    const sessionRow = await pool.query<{
      id: string;
      status: string;
      period_end: string | null;
      created_at: string;
      certified_at: string | null;
    }>(
      `SELECT id, status, period_end, created_at, certified_at
       FROM close_sessions
       WHERE tenant_id = $1
       ORDER BY period_end DESC NULLS LAST
       LIMIT 1`,
      [entity.tenant_id]
    );
    const session = sessionRow.rows[0];

    let blockingIssues = 0;
    if (session) {
      const issuesRow = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text FROM tenant_close_issues
         WHERE period_id = $1 AND severity IN ('critical', 'blocking')
         AND status NOT IN ('resolved', 'verified', 'waived')`,
        [session.id]
      );
      blockingIssues = parseInt(issuesRow.rows[0]?.count ?? '0', 10);
    }

    let daysInClose: number | null = null;
    if (session && session.status !== 'open') {
      const start = new Date(session.created_at);
      const end = session.certified_at ? new Date(session.certified_at) : new Date();
      daysInClose = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }

    let avgCloseDuration: number | null = null;
    const historyRow = await pool.query<{ avg_days: string | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (certified_at - created_at)) / 86400)::text AS avg_days
       FROM close_sessions
       WHERE tenant_id = $1 AND certified_at IS NOT NULL`,
      [entity.tenant_id]
    );
    const avgStr = historyRow.rows[0]?.avg_days;
    if (avgStr != null) {
      const n = parseFloat(avgStr);
      if (!Number.isNaN(n)) avgCloseDuration = Math.round(n);
    }

    let revenue: string | null = null;
    let netIncome: string | null = null;
    if (session) {
      const lineRow = await pool.query<{ fs_line_id: string; amount: string }>(
        `SELECT sl.fs_line_id, sl.amount::text
         FROM statement_lines sl
         JOIN statement_packages sp ON sp.id = sl.package_id
         WHERE sp.close_session_id = $1
         AND sl.fs_line_id IN ('total_revenue', 'net_income', 'revenue', 'net_income_loss')`,
        [session.id]
      );
      for (const line of lineRow.rows) {
        if (line.fs_line_id === 'total_revenue' || line.fs_line_id === 'revenue') revenue = line.amount;
        if (line.fs_line_id === 'net_income' || line.fs_line_id === 'net_income_loss') netIncome = line.amount;
      }
    }

    const periodLabel =
      session?.period_end != null && String(session.period_end).length >= 7
        ? new Date(session.period_end + 'T12:00:00Z').toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })
        : null;

    results.push({
      id: entity.tenant_id,
      name: entity.tenant_name,
      currentPeriod: periodLabel,
      currentState: session?.status ?? 'not_started',
      daysInClose,
      avgCloseDuration,
      blockingIssues,
      gatesPassing: 0,
      gatesTotal: 0,
      lastCertifiedAt:
        session?.certified_at != null && (session.status === 'certified' || session.status === 'locked')
          ? (typeof session.certified_at === 'string' ? session.certified_at : new Date(session.certified_at).toISOString())
          : null,
      revenue,
      netIncome,
    });
  }

  return results;
}

export interface CloseHistoryEntry {
  periodEnd: string;
  periodLabel: string;
  closeDays: number | null;
  issueCount: number;
  ajeCount: number;
  certifiedAt: string | null;
}

/** Get close history for one tenant (for trend chart). */
export async function getEntityCloseHistory(
  pool: Pool,
  tenantId: string,
  periods: number = 12
): Promise<CloseHistoryEntry[]> {
  const r = await pool.query<{
    id: string;
    period_end: string;
    certified_at: string | null;
    close_days: string | null;
  }>(
    `SELECT id, period_end, certified_at,
            EXTRACT(EPOCH FROM (certified_at - created_at)) / 86400 AS close_days
     FROM close_sessions
     WHERE tenant_id = $1 AND certified_at IS NOT NULL
     ORDER BY period_end DESC
     LIMIT $2`,
    [tenantId, periods]
  );

  const history: CloseHistoryEntry[] = [];
  for (const row of r.rows) {
    const issueRow = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text FROM tenant_close_issues WHERE period_id = $1',
      [row.id]
    );
    const jeRow = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text FROM journal_entries
       WHERE close_session_id = $1 AND status = 'posted'`,
      [row.id]
    );
    history.push({
      periodEnd: row.period_end,
      periodLabel: new Date(row.period_end + 'T12:00:00Z').toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      }),
      closeDays: row.close_days != null ? Math.round(parseFloat(row.close_days)) : null,
      issueCount: parseInt(issueRow.rows[0]?.count ?? '0', 10),
      ajeCount: parseInt(jeRow.rows[0]?.count ?? '0', 10),
      certifiedAt: row.certified_at,
    });
  }
  return history;
}
