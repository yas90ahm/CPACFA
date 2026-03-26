/**
 * Portfolio Alerts Service (GAP I3)
 *
 * Generates real-time alerts for portfolio entities:
 * - CLOSE_OVERDUE: session IN_PROGRESS > 10 business days
 * - VARIANCE_UNRESOLVED: material variances unresolved > 48 hours
 * - GATE_FAILING: blocking gates failing > 24 hours
 */

import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { getTenantPool } from '../db/index.js';
import { getPortfolioEntities } from './portfolio_service.js';
import { plus, round2 } from '../utils/decimal.js';

export interface PortfolioAlert {
  id: string;
  entityId: string;
  entityName: string;
  alertType: 'CLOSE_OVERDUE' | 'VARIANCE_UNRESOLVED' | 'GATE_FAILING';
  severity: 'critical' | 'high' | 'medium';
  message: string;
  createdAt: string;
  data: Record<string, unknown>;
}

/** Count business days between two dates (Mon-Fri only). */
function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current < end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Get portfolio alerts for all entities the user has access to.
 * Checks three alert conditions per entity and returns a flat list.
 */
export async function getPortfolioAlerts(
  controlPool: Pool,
  userId: string
): Promise<PortfolioAlert[]> {
  const entities = await getPortfolioEntities(controlPool, userId);
  const alerts: PortfolioAlert[] = [];
  const now = new Date();

  for (const entity of entities) {
    let pool: Pool;
    try {
      pool = await getTenantPool(entity.tenant_id);
    } catch {
      continue; // Skip entities with unreachable databases
    }

    // --- CLOSE_OVERDUE: session IN_PROGRESS for > 10 business days ---
    try {
      const sessResult = await pool.query<{
        id: string;
        status: string;
        created_at: string;
        period_end: string | null;
      }>(
        `SELECT id, status, created_at, period_end
         FROM close_sessions
         WHERE tenant_id = $1 AND status = 'in_progress'
         ORDER BY created_at DESC
         LIMIT 1`,
        [entity.tenant_id]
      );
      const session = sessResult.rows[0];
      if (session) {
        const sessionStart = new Date(session.created_at);
        const bDays = businessDaysBetween(sessionStart, now);
        if (bDays > 10) {
          alerts.push({
            id: randomUUID(),
            entityId: entity.tenant_id,
            entityName: entity.tenant_name,
            alertType: 'CLOSE_OVERDUE',
            severity: bDays > 20 ? 'critical' : 'high',
            message: `Close session has been in progress for ${bDays} business days (threshold: 10)`,
            createdAt: now.toISOString(),
            data: {
              sessionId: session.id,
              businessDays: bDays,
              sessionStartedAt: session.created_at,
              periodEnd: session.period_end,
            },
          });
        }
      }
    } catch {
      // Skip alert type on query failure
    }

    // --- VARIANCE_UNRESOLVED: material variances unresolved > 48 hours ---
    try {
      const varResult = await pool.query<{
        id: string;
        account_code: string;
        variance_amount: string;
        created_at: string;
        close_session_id: string;
      }>(
        `SELECT v.id, v.account_code, v.variance_amount::text, v.created_at, v.close_session_id
         FROM tenant_variance_analysis v
         JOIN close_sessions cs ON cs.id = v.close_session_id AND cs.tenant_id = v.tenant_id
         WHERE v.tenant_id = $1
           AND v.is_material = true
           AND (v.explanation IS NULL OR v.explanation = '')
           AND cs.status IN ('in_progress', 'under_review')
         ORDER BY v.created_at ASC`,
        [entity.tenant_id]
      );
      for (const v of varResult.rows) {
        const createdAt = new Date(v.created_at);
        const hoursElapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursElapsed > 48) {
          alerts.push({
            id: randomUUID(),
            entityId: entity.tenant_id,
            entityName: entity.tenant_name,
            alertType: 'VARIANCE_UNRESOLVED',
            severity: hoursElapsed > 96 ? 'critical' : 'high',
            message: `Material variance on ${v.account_code} unresolved for ${Math.round(hoursElapsed)} hours (threshold: 48)`,
            createdAt: now.toISOString(),
            data: {
              varianceId: v.id,
              accountCode: v.account_code,
              varianceAmount: v.variance_amount,
              hoursUnresolved: Math.round(hoursElapsed),
              sessionId: v.close_session_id,
            },
          });
        }
      }
    } catch {
      // Skip alert type on query failure
    }

    // --- GATE_FAILING: blocking gates failing > 24 hours ---
    try {
      const issueResult = await pool.query<{
        id: string;
        title: string;
        severity: string;
        created_at: string;
        period_id: string;
        category: string;
      }>(
        `SELECT i.id, i.title, i.severity, i.created_at, i.period_id, i.category
         FROM tenant_issues i
         JOIN close_sessions cs ON cs.id = i.period_id AND cs.tenant_id = i.tenant_id
         WHERE i.tenant_id = $1
           AND i.severity = 'blocking'
           AND i.resolved_at IS NULL
           AND cs.status IN ('in_progress', 'under_review')
         ORDER BY i.created_at ASC`,
        [entity.tenant_id]
      );
      for (const issue of issueResult.rows) {
        const createdAt = new Date(issue.created_at);
        const hoursElapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursElapsed > 24) {
          alerts.push({
            id: randomUUID(),
            entityId: entity.tenant_id,
            entityName: entity.tenant_name,
            alertType: 'GATE_FAILING',
            severity: hoursElapsed > 72 ? 'critical' : 'high',
            message: `Blocking gate "${issue.title}" failing for ${Math.round(hoursElapsed)} hours (threshold: 24)`,
            createdAt: now.toISOString(),
            data: {
              issueId: issue.id,
              issueTitle: issue.title,
              category: issue.category,
              hoursBlocked: Math.round(hoursElapsed),
              sessionId: issue.period_id,
            },
          });
        }
      }
    } catch {
      // Skip alert type on query failure
    }
  }

  // Sort by severity (critical first), then by createdAt desc
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  alerts.sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return alerts;
}

/**
 * Get portfolio-level metrics: aggregate financial and operational stats.
 */
export async function getPortfolioMetrics(
  controlPool: Pool,
  userId: string
): Promise<{
  totalRevenue: string;
  totalEbitda: string;
  avgCloseDays: number | null;
  entitiesCertified: number;
  entitiesInProgress: number;
}> {
  const entities = await getPortfolioEntities(controlPool, userId);
  let totalRevenue = 0;
  let totalEbitda = 0;
  let totalCloseDays = 0;
  let closeDaysCount = 0;
  let entitiesCertified = 0;
  let entitiesInProgress = 0;

  for (const entity of entities) {
    let pool: Pool;
    try {
      pool = await getTenantPool(entity.tenant_id);
    } catch {
      continue;
    }

    try {
      // Get latest session status
      const sessResult = await pool.query<{
        id: string;
        status: string;
        created_at: string;
        certified_at: string | null;
      }>(
        `SELECT id, status, created_at, certified_at
         FROM close_sessions
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [entity.tenant_id]
      );
      const session = sessResult.rows[0];
      if (session) {
        if (session.status === 'certified' || session.status === 'locked') {
          entitiesCertified++;
          if (session.certified_at) {
            const days = Math.round(
              (new Date(session.certified_at).getTime() - new Date(session.created_at).getTime()) /
                (1000 * 60 * 60 * 24)
            );
            totalCloseDays += days;
            closeDaysCount++;
          }
        } else if (session.status === 'in_progress' || session.status === 'under_review') {
          entitiesInProgress++;
        }

        // Get financials from statement_lines
        const finResult = await pool.query<{ fs_line_id: string; amount: string }>(
          `SELECT sl.fs_line_id, sl.amount::text
           FROM statement_lines sl
           JOIN statement_packages sp ON sp.id = sl.package_id
           WHERE sp.close_session_id = $1
             AND sl.fs_line_id IN ('total_revenue', 'revenue', 'pl_ebitda', 'ebitda')`,
          [session.id]
        );
        for (const row of finResult.rows) {
          const amt = round2(row.amount ?? 0);
          if (row.fs_line_id === 'total_revenue' || row.fs_line_id === 'revenue') {
            totalRevenue = plus(totalRevenue, amt);
          }
          if (row.fs_line_id === 'pl_ebitda' || row.fs_line_id === 'ebitda') {
            totalEbitda = plus(totalEbitda, amt);
          }
        }
      }
    } catch {
      // Skip entity on query failure
    }
  }

  return {
    totalRevenue: totalRevenue.toFixed(2),
    totalEbitda: totalEbitda.toFixed(2),
    avgCloseDays: closeDaysCount > 0 ? Math.round(totalCloseDays / closeDaysCount) : null,
    entitiesCertified,
    entitiesInProgress,
  };
}
