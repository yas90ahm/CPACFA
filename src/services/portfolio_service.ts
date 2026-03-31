/**
 * Portfolio Service
 *
 * Cross-tenant aggregation for PE operating partners.
 * Queries close session status, financial data, gate readiness, and summaries
 * across entities the operating partner has access to via portfolio_access.
 */

import type { Pool } from 'pg';
import { getTenantPool } from '../db/index.js';
import { getReadinessGates } from './session_readiness_gates_service.js';
import type { CloseSession } from '../types/close_session.js';
import Decimal from 'decimal.js';

export interface PortfolioEntity {
  tenant_id: string;
  tenant_name: string;
}

export interface PortfolioFinancials {
  revenue: string | null;
  netIncome: string | null;
  grossProfit: string | null;
  operatingIncome: string | null;
  ebitda: string | null;
  totalAssets: string | null;
  totalLiabilities: string | null;
  totalEquity: string | null;
  cashPosition: string | null;
  grossMarginPercent: string | null;
  operatingMarginPercent: string | null;
  marginPercent: string | null;
}

export interface PortfolioEntitySummary {
  id: string;
  name: string;
  currentPeriod: string | null;
  currentState: string;
  currentSessionId: string | null;
  daysInClose: number | null;
  avgCloseDuration: number | null;
  priorAvgCloseDays: number | null;
  blockingIssues: number;
  gatesPassing: number;
  gatesTotal: number;
  lastCertifiedAt: string | null;
  revenue: string | null;
  netIncome: string | null;
  financials: PortfolioFinancials | null;
  /** 'certified' | 'locked' | 'draft' | null — where financial data comes from */
  dataSource: string | null;
  marginPercent: string | null;
  marginVsPriorPp: string | null;
  preparer: string | null;
  reviewer: string | null;
  lastActivity: string | null;
  closeDurationHistory: (number | null)[];
  needsAttention: boolean;
  attentionReason: string | null;
}

export interface PortfolioTotals {
  portfolioRevenue: string;
  portfolioNetIncome: string;
  portfolioEbitda: string | null;
  portfolioTotalAssets: string;
  portfolioTotalLiabilities: string;
  portfolioCashPosition: string | null;
  portfolioMargin: string;
  certifiedCount: number;
  totalWithData: number;
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

/** Extract financial metrics from statement_lines for a given close session. */
async function extractFinancials(
  pool: Pool,
  sessionId: string
): Promise<PortfolioFinancials | null> {
  const lineRow = await pool.query<{ fs_line_id: string; amount: string; statement: string }>(
    `SELECT sl.fs_line_id, sl.amount::text, sl.statement
     FROM statement_lines sl
     JOIN statement_packages sp ON sp.id = sl.package_id
     WHERE sp.close_session_id = $1
     AND sl.fs_line_id IN (
       'total_revenue', 'revenue',
       'net_income', 'net_income_loss',
       'pl_gross_profit', 'gross_profit',
       'pl_operating_income', 'operating_income',
       'pl_ebitda', 'ebitda',
       'bs_total_assets', 'total_assets',
       'bs_total_liabilities', 'total_liabilities',
       'bs_total_equity', 'total_equity',
       'bs_cash_and_cash_equivalents', 'cash_and_cash_equivalents', 'cash'
     )`,
    [sessionId]
  );

  if (lineRow.rows.length === 0) return null;

  let revenue: string | null = null;
  let netIncome: string | null = null;
  let grossProfit: string | null = null;
  let operatingIncome: string | null = null;
  let ebitda: string | null = null;
  let totalAssets: string | null = null;
  let totalLiabilities: string | null = null;
  let totalEquity: string | null = null;
  let cashPosition: string | null = null;

  for (const line of lineRow.rows) {
    const id = line.fs_line_id;
    const amt = line.amount;
    if (id === 'total_revenue' || id === 'revenue') revenue = amt;
    if (id === 'net_income' || id === 'net_income_loss') netIncome = amt;
    if (id === 'pl_gross_profit' || id === 'gross_profit') grossProfit = amt;
    if (id === 'pl_operating_income' || id === 'operating_income') operatingIncome = amt;
    if (id === 'pl_ebitda' || id === 'ebitda') ebitda = amt;
    if (id === 'bs_total_assets' || id === 'total_assets') totalAssets = amt;
    if (id === 'bs_total_liabilities' || id === 'total_liabilities') totalLiabilities = amt;
    if (id === 'bs_total_equity' || id === 'total_equity') totalEquity = amt;
    if (id === 'bs_cash_and_cash_equivalents' || id === 'cash_and_cash_equivalents' || id === 'cash') cashPosition = amt;
  }

  // Compute margins
  let grossMarginPercent: string | null = null;
  let operatingMarginPercent: string | null = null;
  let marginPercent: string | null = null;

  if (revenue != null) {
    const rev = new Decimal(revenue);
    if (rev.abs().greaterThan(0)) {
      if (grossProfit != null) {
        grossMarginPercent = new Decimal(grossProfit).div(rev).times(100).toDecimalPlaces(1).toString();
      }
      if (operatingIncome != null) {
        operatingMarginPercent = new Decimal(operatingIncome).div(rev).times(100).toDecimalPlaces(1).toString();
      }
      if (netIncome != null) {
        marginPercent = new Decimal(netIncome).div(rev).times(100).toDecimalPlaces(1).toString();
      }
    }
  }

  return {
    revenue,
    netIncome,
    grossProfit,
    operatingIncome,
    ebitda,
    totalAssets,
    totalLiabilities,
    totalEquity,
    cashPosition,
    grossMarginPercent,
    operatingMarginPercent,
    marginPercent,
  };
}

/** Build a CloseSession-like object from a raw DB row for gate computation. */
function rowToSession(row: {
  id: string;
  tenant_id: string;
  entity_id: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  certified_at: string | null;
  statements_stale_since: string | null;
}): CloseSession {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id ?? '',
    periodStart: row.period_start ?? '',
    periodEnd: row.period_end ?? '',
    basis: 'accrual',
    standard: 'us_gaap',
    status: row.status as CloseSession['status'],
    certifiedAt: row.certified_at ?? undefined,
    statementsStaleSince: row.statements_stale_since ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
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

    // Get the latest close session with full columns for gate computation
    const sessionRow = await pool.query<{
      id: string;
      tenant_id: string;
      entity_id: string;
      status: string;
      period_start: string | null;
      period_end: string | null;
      created_at: string;
      certified_at: string | null;
      statements_stale_since: string | null;
    }>(
      `SELECT id, tenant_id, entity_id, status, period_start, period_end,
              created_at, certified_at, statements_stale_since
       FROM close_sessions
       WHERE tenant_id = $1
       ORDER BY period_end DESC NULLS LAST
       LIMIT 1`,
      [entity.tenant_id]
    );
    const sessionRaw = sessionRow.rows[0];

    // Blocking issues
    let blockingIssues = 0;
    if (sessionRaw) {
      const issuesRow = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text FROM tenant_close_issues
         WHERE period_id = $1 AND severity IN ('critical', 'blocking')
         AND status NOT IN ('resolved', 'verified', 'waived')`,
        [sessionRaw.id]
      );
      blockingIssues = parseInt(issuesRow.rows[0]?.count ?? '0', 10);
    }

    // Days in close
    let daysInClose: number | null = null;
    if (sessionRaw && sessionRaw.status !== 'open') {
      const start = new Date(sessionRaw.created_at);
      const end = sessionRaw.certified_at ? new Date(sessionRaw.certified_at) : new Date();
      daysInClose = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Average close duration (all certified sessions)
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

    // Prior average close days (3-6 prior certified sessions, excluding most recent)
    let priorAvgCloseDays: number | null = null;
    const priorHistRow = await pool.query<{ avg_days: string | null }>(
      `SELECT AVG(close_days)::text AS avg_days FROM (
         SELECT EXTRACT(EPOCH FROM (certified_at - created_at)) / 86400 AS close_days
         FROM close_sessions
         WHERE tenant_id = $1 AND certified_at IS NOT NULL
         ORDER BY period_end DESC
         OFFSET 1 LIMIT 6
       ) sub`,
      [entity.tenant_id]
    );
    const priorAvgStr = priorHistRow.rows[0]?.avg_days;
    if (priorAvgStr != null) {
      const n = parseFloat(priorAvgStr);
      if (!Number.isNaN(n)) priorAvgCloseDays = Math.round(n);
    }

    // Close duration history (last 6 certified sessions for sparkline)
    const durationHistRow = await pool.query<{ close_days: string | null }>(
      `SELECT EXTRACT(EPOCH FROM (certified_at - created_at)) / 86400 AS close_days
       FROM close_sessions
       WHERE tenant_id = $1 AND certified_at IS NOT NULL
       ORDER BY period_end DESC
       LIMIT 6`,
      [entity.tenant_id]
    );
    const closeDurationHistory: (number | null)[] = durationHistRow.rows
      .map((r) => (r.close_days != null ? Math.round(parseFloat(r.close_days)) : null))
      .reverse();

    // Financial data: prefer certified/locked session, fall back to current session
    let financials: PortfolioFinancials | null = null;
    let dataSource: string | null = null;
    let financialSessionId: string | null = null;

    if (sessionRaw) {
      if (sessionRaw.status === 'certified' || sessionRaw.status === 'locked') {
        financialSessionId = sessionRaw.id;
        dataSource = sessionRaw.status;
      } else {
        // Find the most recent certified/locked session for this entity
        const certRow = await pool.query<{ id: string; status: string }>(
          `SELECT id, status FROM close_sessions
           WHERE tenant_id = $1 AND status IN ('certified', 'locked')
           ORDER BY period_end DESC LIMIT 1`,
          [entity.tenant_id]
        );
        if (certRow.rows[0]) {
          financialSessionId = certRow.rows[0].id;
          dataSource = certRow.rows[0].status;
        } else {
          // Fall back to current session's draft data
          financialSessionId = sessionRaw.id;
          dataSource = 'draft';
        }
      }

      if (financialSessionId) {
        financials = await extractFinancials(pool, financialSessionId);
      }
    }

    // Prior period margin for marginVsPriorPp
    let marginVsPriorPp: string | null = null;
    if (financials?.marginPercent != null && sessionRaw) {
      const priorSessionRow = await pool.query<{ id: string }>(
        `SELECT id FROM close_sessions
         WHERE tenant_id = $1 AND id != $2
         AND period_end < $3
         AND status IN ('certified', 'locked')
         ORDER BY period_end DESC LIMIT 1`,
        [entity.tenant_id, financialSessionId ?? sessionRaw.id, sessionRaw.period_end]
      );
      if (priorSessionRow.rows[0]) {
        const priorFinancials = await extractFinancials(pool, priorSessionRow.rows[0].id);
        if (priorFinancials?.marginPercent != null) {
          marginVsPriorPp = new Decimal(financials.marginPercent)
            .minus(new Decimal(priorFinancials.marginPercent))
            .toDecimalPlaces(1)
            .toString();
        }
      }
    }

    // Gate readiness — compute for active (non-terminal) sessions
    let gatesPassing = 0;
    let gatesTotal = 0;
    if (sessionRaw) {
      if (sessionRaw.status === 'certified' || sessionRaw.status === 'locked') {
        // All gates passed by definition — certified sessions passed all gates
        gatesTotal = 11;
        gatesPassing = 11;
      } else if (sessionRaw.status !== 'open') {
        try {
          const session = rowToSession(sessionRaw);
          const gateResult = await getReadinessGates(pool, entity.tenant_id, session);
          gatesPassing = gateResult.gatesPassing;
          gatesTotal = gateResult.gatesTotal;
        } catch (err) {
          console.warn(`[Portfolio] Gate computation failed for ${entity.tenant_name}:`, (err as Error).message);
          // Fall back to 0/0
        }
      }
    }

    // Preparer and reviewer
    let preparer: string | null = null;
    let reviewer: string | null = null;
    if (sessionRaw) {
      try {
        const usersRow = await controlPool.query<{ name: string | null; email: string; role: string }>(
          `SELECT name, email, role FROM users
           WHERE tenant_id = $1 AND status = 'active'
           AND role IN ('controller', 'senior_accountant', 'reviewer', 'cfo')
           ORDER BY last_active_at DESC NULLS LAST
           LIMIT 2`,
          [entity.tenant_id]
        );
        for (const u of usersRow.rows) {
          if ((u.role === 'senior_accountant' || u.role === 'controller') && !preparer) {
            preparer = u.name ?? u.email;
          }
          if ((u.role === 'reviewer' || u.role === 'cfo') && !reviewer) {
            reviewer = u.name ?? u.email;
          }
        }
      } catch {
        // users table query may fail if accessing cross-tenant
      }
    }

    // Last activity
    let lastActivity: string | null = null;
    if (sessionRaw) {
      lastActivity = sessionRaw.certified_at ?? sessionRaw.created_at;
    }

    // Attention detection
    let needsAttention = blockingIssues > 0;
    let attentionReason: string | null = null;
    if (blockingIssues > 0) {
      attentionReason = `${blockingIssues} blocking issue(s)`;
    } else if (daysInClose != null && avgCloseDuration != null && daysInClose > avgCloseDuration * 1.5) {
      needsAttention = true;
      attentionReason = 'Stalled';
    }

    const periodLabel =
      sessionRaw?.period_end != null && String(sessionRaw.period_end).length >= 7
        ? new Date(sessionRaw.period_end + 'T12:00:00Z').toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })
        : null;

    results.push({
      id: entity.tenant_id,
      name: entity.tenant_name,
      currentPeriod: periodLabel,
      currentState: sessionRaw?.status ?? 'not_started',
      currentSessionId: sessionRaw?.id ?? null,
      daysInClose,
      avgCloseDuration,
      priorAvgCloseDays,
      blockingIssues,
      gatesPassing,
      gatesTotal,
      lastCertifiedAt:
        sessionRaw?.certified_at != null && (sessionRaw.status === 'certified' || sessionRaw.status === 'locked')
          ? (typeof sessionRaw.certified_at === 'string' ? sessionRaw.certified_at : new Date(sessionRaw.certified_at).toISOString())
          : null,
      revenue: financials?.revenue ?? null,
      netIncome: financials?.netIncome ?? null,
      financials,
      dataSource,
      marginPercent: financials?.marginPercent ?? null,
      marginVsPriorPp,
      preparer,
      reviewer,
      lastActivity,
      closeDurationHistory,
      needsAttention,
      attentionReason,
    });
  }

  return results;
}

/** Compute portfolio totals from entity summaries. */
export function computePortfolioTotals(entities: PortfolioEntitySummary[]): PortfolioTotals {
  let totalRevenue = new Decimal(0);
  let totalNetIncome = new Decimal(0);
  let totalEbitda: Decimal | null = null;
  let totalGrossProfit = new Decimal(0);
  let totalAssets = new Decimal(0);
  let totalLiabilities = new Decimal(0);
  let totalCash: Decimal | null = null;
  let certifiedCount = 0;
  let totalWithData = 0;
  let hasGrossProfit = false;

  for (const e of entities) {
    if (!e.financials) continue;
    totalWithData++;
    if (e.dataSource === 'certified' || e.dataSource === 'locked') certifiedCount++;

    if (e.financials.revenue != null) totalRevenue = totalRevenue.plus(new Decimal(e.financials.revenue));
    if (e.financials.netIncome != null) totalNetIncome = totalNetIncome.plus(new Decimal(e.financials.netIncome));
    if (e.financials.grossProfit != null) {
      totalGrossProfit = totalGrossProfit.plus(new Decimal(e.financials.grossProfit));
      hasGrossProfit = true;
    }
    if (e.financials.ebitda != null) {
      totalEbitda = (totalEbitda ?? new Decimal(0)).plus(new Decimal(e.financials.ebitda));
    }
    if (e.financials.totalAssets != null) totalAssets = totalAssets.plus(new Decimal(e.financials.totalAssets));
    if (e.financials.totalLiabilities != null) totalLiabilities = totalLiabilities.plus(new Decimal(e.financials.totalLiabilities));
    if (e.financials.cashPosition != null) {
      totalCash = (totalCash ?? new Decimal(0)).plus(new Decimal(e.financials.cashPosition));
    }
  }

  // Weighted margin = total net income / total revenue (not average of percentages)
  let portfolioMargin = '0';
  if (totalRevenue.abs().greaterThan(0)) {
    portfolioMargin = totalNetIncome.div(totalRevenue).times(100).toDecimalPlaces(1).toString();
  }

  return {
    portfolioRevenue: totalRevenue.toDecimalPlaces(2).toString(),
    portfolioNetIncome: totalNetIncome.toDecimalPlaces(2).toString(),
    portfolioEbitda: totalEbitda?.toDecimalPlaces(2).toString() ?? null,
    portfolioTotalAssets: totalAssets.toDecimalPlaces(2).toString(),
    portfolioTotalLiabilities: totalLiabilities.toDecimalPlaces(2).toString(),
    portfolioCashPosition: totalCash?.toDecimalPlaces(2).toString() ?? null,
    portfolioMargin,
    certifiedCount,
    totalWithData,
  };
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
