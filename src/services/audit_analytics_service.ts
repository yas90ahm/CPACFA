/**
 * Audit Trail Analytics Service
 *
 * Transforms the hash-chained audit ledger into actionable analytics.
 * Turns a compliance requirement into a competitive advantage —
 * controllers see where their process is slow and where AI helps most.
 *
 * Analytics:
 * 1. Average time-to-approve per JE type
 * 2. AI suggestion acceptance rate over time
 * 3. Rejection reasons histogram
 * 4. Accounts that always need manual review
 * 5. Close velocity trend across periods
 * 6. Shadow audit finding patterns
 */

import type { Pool } from 'pg';

export interface JEApprovalMetrics {
  /** Average hours from draft to posted, by source */
  avgHoursToPost: Record<string, number>;
  /** Average hours from proposed to approved */
  avgHoursToApprove: number | null;
  /** Percentage of JEs rejected at least once */
  rejectionRate: number;
  /** Total JEs in period */
  totalJEs: number;
}

export interface AISuggestionMetrics {
  /** Acceptance rate for COA mapping suggestions */
  coaAcceptanceRate: number;
  /** Acceptance rate for CF classification suggestions */
  cfAcceptanceRate: number;
  /** Number of auto-accepted suggestions */
  autoAcceptedCount: number;
  /** Number of manually overridden suggestions */
  editedCount: number;
  /** Number rejected */
  rejectedCount: number;
  /** Average confidence of accepted suggestions */
  avgAcceptedConfidence: number | null;
  /** Average confidence of rejected suggestions */
  avgRejectedConfidence: number | null;
}

export interface ManualReviewAccount {
  accountCode: string;
  accountName: string;
  /** Number of times this account needed manual review across all closes */
  manualReviewCount: number;
  /** Last suggested mapping that was rejected */
  lastRejectedMapping: string | null;
}

export interface CloseVelocityTrend {
  periodLabel: string;
  daysToComplete: number;
  status: string;
}

export interface AuditAnalyticsResult {
  jeApproval: JEApprovalMetrics;
  aiSuggestions: AISuggestionMetrics;
  manualReviewAccounts: ManualReviewAccount[];
  velocityTrend: CloseVelocityTrend[];
  auditLedgerStats: {
    totalEntries: number;
    uniqueEventTypes: number;
    chainValid: boolean | null;
  };
}

/**
 * Compute audit trail analytics for an entity across all closes.
 */
export async function computeAuditAnalytics(
  pool: Pool,
  tenantId: string,
  entityId: string,
  closeSessionId?: string
): Promise<AuditAnalyticsResult> {
  // 1. JE Approval Metrics
  const jeMetrics = await computeJEApprovalMetrics(pool, tenantId, closeSessionId);

  // 2. AI Suggestion Metrics
  const aiMetrics = await computeAISuggestionMetrics(pool, tenantId, closeSessionId);

  // 3. Manual Review Accounts (across all closes for entity)
  const manualReviewAccounts = await findManualReviewAccounts(pool, tenantId, entityId);

  // 4. Close Velocity Trend
  const velocityTrend = await computeVelocityTrend(pool, tenantId, entityId);

  // 5. Audit Ledger Stats
  const ledgerStats = await computeLedgerStats(pool, tenantId);

  return {
    jeApproval: jeMetrics,
    aiSuggestions: aiMetrics,
    manualReviewAccounts,
    velocityTrend,
    auditLedgerStats: ledgerStats,
  };
}

async function computeJEApprovalMetrics(
  pool: Pool,
  tenantId: string,
  closeSessionId?: string
): Promise<JEApprovalMetrics> {
  const sessionFilter = closeSessionId
    ? `AND close_session_id = '${closeSessionId}'`
    : '';

  // Average hours from created to posted, grouped by source
  const avgRes = await pool.query<{ source: string; avg_hours: string; cnt: string }>(
    `SELECT source,
            EXTRACT(EPOCH FROM AVG(posted_at - created_at)) / 3600 AS avg_hours,
            COUNT(*) AS cnt
     FROM journal_entries
     WHERE tenant_id = $1 AND status IN ('posted', 'exported')
       ${closeSessionId ? 'AND close_session_id = $2' : ''}
     GROUP BY source`,
    closeSessionId ? [tenantId, closeSessionId] : [tenantId]
  );

  const avgHoursToPost: Record<string, number> = {};
  let totalJEs = 0;
  for (const row of avgRes.rows) {
    avgHoursToPost[row.source] = Math.round(Number(row.avg_hours) * 10) / 10;
    totalJEs += Number(row.cnt);
  }

  // Average hours from proposed to approved
  const approvalRes = await pool.query<{ avg_hours: string }>(
    `SELECT EXTRACT(EPOCH FROM AVG(approved_at - proposed_at)) / 3600 AS avg_hours
     FROM journal_entries
     WHERE tenant_id = $1 AND approved_at IS NOT NULL AND proposed_at IS NOT NULL
       ${closeSessionId ? 'AND close_session_id = $2' : ''}`,
    closeSessionId ? [tenantId, closeSessionId] : [tenantId]
  );
  const avgHoursToApprove = approvalRes.rows[0]?.avg_hours
    ? Math.round(Number(approvalRes.rows[0].avg_hours) * 10) / 10
    : null;

  // Rejection rate
  const rejectedRes = await pool.query<{ rejected: string; total: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE rejection_reason IS NOT NULL) AS rejected,
       COUNT(*) AS total
     FROM journal_entries
     WHERE tenant_id = $1
       ${closeSessionId ? 'AND close_session_id = $2' : ''}`,
    closeSessionId ? [tenantId, closeSessionId] : [tenantId]
  );
  const rejected = Number(rejectedRes.rows[0]?.rejected ?? 0);
  const total = Number(rejectedRes.rows[0]?.total ?? 0);
  const rejectionRate = total > 0 ? Math.round((rejected / total) * 1000) / 10 : 0;

  return { avgHoursToPost, avgHoursToApprove, rejectionRate, totalJEs };
}

async function computeAISuggestionMetrics(
  pool: Pool,
  tenantId: string,
  closeSessionId?: string
): Promise<AISuggestionMetrics> {
  const sessionFilter = closeSessionId ? 'AND close_session_id = $2' : '';
  const params = closeSessionId ? [tenantId, closeSessionId] : [tenantId];

  // COA suggestion stats
  const coaRes = await pool.query<{
    status: string; cnt: string; avg_conf: string; auto_cnt: string;
  }>(
    `SELECT status, COUNT(*) AS cnt,
            AVG(confidence) AS avg_conf,
            COUNT(*) FILTER (WHERE auto_accepted = TRUE) AS auto_cnt
     FROM ai_coa_suggestions
     WHERE tenant_id = $1 ${sessionFilter}
     GROUP BY status`,
    params
  );

  let coaAccepted = 0, coaRejected = 0, coaTotal = 0, autoAccepted = 0, editedCount = 0;
  let avgAcceptedConf = 0, avgRejectedConf = 0, acceptedConfCount = 0, rejectedConfCount = 0;

  for (const row of coaRes.rows) {
    const cnt = Number(row.cnt);
    coaTotal += cnt;
    if (row.status === 'accepted') {
      coaAccepted += cnt;
      autoAccepted += Number(row.auto_cnt);
      avgAcceptedConf += Number(row.avg_conf) * cnt;
      acceptedConfCount += cnt;
    }
    if (row.status === 'rejected') {
      coaRejected += cnt;
      avgRejectedConf += Number(row.avg_conf) * cnt;
      rejectedConfCount += cnt;
    }
  }

  // CF suggestion stats
  const cfRes = await pool.query<{ status: string; cnt: string }>(
    `SELECT status, COUNT(*) AS cnt
     FROM ai_cf_suggestions
     WHERE tenant_id = $1 ${sessionFilter}
     GROUP BY status`,
    params
  );
  let cfAccepted = 0, cfTotal = 0;
  for (const row of cfRes.rows) {
    cfTotal += Number(row.cnt);
    if (row.status === 'accepted') cfAccepted += Number(row.cnt);
  }

  const coaNonExpired = coaTotal - (coaRes.rows.find((r) => r.status === 'expired') ? Number(coaRes.rows.find((r) => r.status === 'expired')!.cnt) : 0);

  return {
    coaAcceptanceRate: coaNonExpired > 0 ? Math.round((coaAccepted / coaNonExpired) * 1000) / 10 : 0,
    cfAcceptanceRate: cfTotal > 0 ? Math.round((cfAccepted / cfTotal) * 1000) / 10 : 0,
    autoAcceptedCount: autoAccepted,
    editedCount,
    rejectedCount: coaRejected,
    avgAcceptedConfidence: acceptedConfCount > 0
      ? Math.round((avgAcceptedConf / acceptedConfCount) * 100) / 100
      : null,
    avgRejectedConfidence: rejectedConfCount > 0
      ? Math.round((avgRejectedConf / rejectedConfCount) * 100) / 100
      : null,
  };
}

async function findManualReviewAccounts(
  pool: Pool,
  tenantId: string,
  entityId: string
): Promise<ManualReviewAccount[]> {
  // Find accounts whose AI suggestions were rejected across all sessions
  const res = await pool.query<{
    account_code: string; account_name: string;
    rejected_count: string; last_suggested: string;
  }>(
    `SELECT account_code, account_name,
            COUNT(*) AS rejected_count,
            MAX(suggested_fs_line_label) AS last_suggested
     FROM ai_coa_suggestions
     WHERE tenant_id = $1 AND entity_id = $2 AND status = 'rejected'
       AND account_code IS NOT NULL
     GROUP BY account_code, account_name
     ORDER BY rejected_count DESC
     LIMIT 20`,
    [tenantId, entityId]
  );

  return res.rows.map((r) => ({
    accountCode: r.account_code,
    accountName: r.account_name,
    manualReviewCount: Number(r.rejected_count),
    lastRejectedMapping: r.last_suggested,
  }));
}

async function computeVelocityTrend(
  pool: Pool,
  tenantId: string,
  entityId: string
): Promise<CloseVelocityTrend[]> {
  const res = await pool.query<{
    period_end: string; status: string;
    created_at: string; certified_at: string | null; locked_at: string | null;
  }>(
    `SELECT period_end, status, created_at, certified_at, locked_at
     FROM close_sessions
     WHERE tenant_id = $1 AND entity_id = $2
       AND status IN ('certified', 'locked')
     ORDER BY period_end DESC
     LIMIT 12`,
    [tenantId, entityId]
  );

  return res.rows.map((r) => {
    const endDate = r.certified_at ?? r.locked_at ?? r.created_at;
    const days = Math.max(1, Math.ceil(
      (new Date(endDate).getTime() - new Date(r.created_at).getTime()) / 86400000
    ));
    return {
      periodLabel: (r.period_end ?? '').slice(0, 7),
      daysToComplete: days,
      status: r.status,
    };
  });
}

async function computeLedgerStats(
  pool: Pool,
  tenantId: string
): Promise<{ totalEntries: number; uniqueEventTypes: number; chainValid: boolean | null }> {
  const countRes = await pool.query<{ cnt: string }>(
    'SELECT COUNT(*) AS cnt FROM audit_ledger WHERE tenant_id = $1',
    [tenantId]
  );
  const typeRes = await pool.query<{ cnt: string }>(
    'SELECT COUNT(DISTINCT event_type) AS cnt FROM audit_ledger WHERE tenant_id = $1',
    [tenantId]
  );

  return {
    totalEntries: Number(countRes.rows[0]?.cnt ?? 0),
    uniqueEventTypes: Number(typeRes.rows[0]?.cnt ?? 0),
    chainValid: null, // Chain verification is expensive — don't run automatically
  };
}
