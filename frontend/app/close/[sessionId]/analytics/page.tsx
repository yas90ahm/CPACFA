'use client';

import { useParams } from 'next/navigation';
import { useCloseSession } from '@/lib/queries/close-session';
import { useAuditAnalytics } from '@/lib/queries/audit-analytics';
import type { AuditAnalyticsResult, ManualReviewAccount, CloseVelocityTrend } from '@/lib/queries/audit-analytics';
import { MetricCard } from '@/components/shared/MetricCard';
import { Card } from '@/components/shared/Card';
import { BarChart3, Brain, AlertTriangle, Timer } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fmt(n: number | null | undefined, suffix = ''): string {
  if (n == null) return '--';
  return `${n}${suffix}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return '--';
  return `${n}%`;
}

function confidenceLabel(n: number | null | undefined): string {
  if (n == null) return '--';
  return `${(n * 100).toFixed(1)}%`;
}

/* -------------------------------------------------------------------------- */
/*  Section: JE Approval Metrics                                                */
/* -------------------------------------------------------------------------- */

function JEApprovalSection({ data }: { data: AuditAnalyticsResult['jeApproval'] }) {
  const sources = Object.entries(data.avgHoursToPost);
  const avgPost = sources.length > 0
    ? (sources.reduce((s, [, v]) => s + v, 0) / sources.length).toFixed(1)
    : '--';

  return (
    <Card title="JE Approval Metrics" subtitle="Journal entry processing performance" status="info">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--space-4)]">
        <MetricCard label="Avg Hours to Post" value={fmt(Number(avgPost), 'h')} icon={<Timer className="w-5 h-5" />} />
        <MetricCard label="Avg Hours to Approve" value={fmt(data.avgHoursToApprove, 'h')} />
        <MetricCard label="Rejection Rate" value={pct(data.rejectionRate)} />
        <MetricCard label="Total JEs" value={data.totalJEs.toLocaleString()} />
      </div>
      {sources.length > 1 && (
        <div className="mt-[var(--space-4)]">
          <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-[var(--space-2)]">
            Avg Hours to Post by Source
          </p>
          <div className="flex gap-[var(--space-3)] flex-wrap">
            {sources.map(([source, hours]) => (
              <div
                key={source}
                className="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] bg-[var(--bg-surface-sunken)] rounded-[var(--radius-md)] text-sm"
              >
                <span className="text-[var(--text-secondary)] capitalize">{source}:</span>
                <span className="font-semibold text-[var(--text-primary)] tabular-nums">{hours}h</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section: AI Suggestion Performance                                          */
/* -------------------------------------------------------------------------- */

function AISuggestionSection({ data }: { data: AuditAnalyticsResult['aiSuggestions'] }) {
  return (
    <Card title="AI Suggestion Performance" subtitle="Acceptance rates and confidence analysis" status="info">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-[var(--space-4)]">
        <MetricCard label="COA Acceptance" value={pct(data.coaAcceptanceRate)} icon={<Brain className="w-5 h-5" />} />
        <MetricCard label="CF Acceptance" value={pct(data.cfAcceptanceRate)} />
        <MetricCard label="Auto-Accepted" value={data.autoAcceptedCount.toLocaleString()} />
        <MetricCard label="Edited" value={data.editedCount.toLocaleString()} />
        <MetricCard label="Rejected" value={data.rejectedCount.toLocaleString()} />
      </div>
      <div className="mt-[var(--space-4)] flex gap-[var(--space-6)]">
        <div className="flex items-center gap-[var(--space-2)] text-sm">
          <span className="text-[var(--text-secondary)]">Avg Confidence (Accepted):</span>
          <span className="font-semibold text-[var(--status-success)] tabular-nums">
            {confidenceLabel(data.avgAcceptedConfidence)}
          </span>
        </div>
        <div className="flex items-center gap-[var(--space-2)] text-sm">
          <span className="text-[var(--text-secondary)]">Avg Confidence (Rejected):</span>
          <span className="font-semibold text-[var(--status-error)] tabular-nums">
            {confidenceLabel(data.avgRejectedConfidence)}
          </span>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section: Manual Review Accounts                                             */
/* -------------------------------------------------------------------------- */

function ManualReviewSection({ accounts }: { accounts: ManualReviewAccount[] }) {
  if (accounts.length === 0) {
    return (
      <Card title="Manual Review Accounts" subtitle="Accounts requiring repeated manual intervention">
        <p className="text-sm text-[var(--text-tertiary)]">No accounts flagged for manual review.</p>
      </Card>
    );
  }

  return (
    <Card title="Manual Review Accounts" subtitle="Accounts with repeated AI suggestion rejections" status="warning">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="table">
          <thead>
            <tr className="border-b border-[var(--border-table-header)]">
              <th className="text-left py-[var(--space-2)] pr-[var(--space-4)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Account Code</th>
              <th className="text-left py-[var(--space-2)] pr-[var(--space-4)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Account Name</th>
              <th className="text-right py-[var(--space-2)] pr-[var(--space-4)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Rejections</th>
              <th className="text-left py-[var(--space-2)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Last Rejected Mapping</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acct) => (
              <tr
                key={acct.accountCode}
                className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-table-row-hover)] transition-colors duration-[var(--transition-fast)]"
              >
                <td className="py-[var(--space-2)] pr-[var(--space-4)] font-mono text-[var(--text-primary)]">{acct.accountCode}</td>
                <td className="py-[var(--space-2)] pr-[var(--space-4)] text-[var(--text-primary)]">{acct.accountName}</td>
                <td className="py-[var(--space-2)] pr-[var(--space-4)] text-right tabular-nums font-semibold text-[var(--status-warning)]">{acct.manualReviewCount}</td>
                <td className="py-[var(--space-2)] text-[var(--text-secondary)]">{acct.lastRejectedMapping ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section: Close Velocity Trend                                               */
/* -------------------------------------------------------------------------- */

function VelocityTrendSection({ trend }: { trend: CloseVelocityTrend[] }) {
  if (trend.length === 0) {
    return (
      <Card title="Close Velocity Trend" subtitle="Duration trend across recent close periods">
        <p className="text-sm text-[var(--text-tertiary)]">No completed closes to display.</p>
      </Card>
    );
  }

  const avgDays = trend.reduce((s, t) => s + t.daysToComplete, 0) / trend.length;

  return (
    <Card title="Close Velocity Trend" subtitle="Days to complete across recent periods" status="info">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="table">
          <thead>
            <tr className="border-b border-[var(--border-table-header)]">
              <th className="text-left py-[var(--space-2)] pr-[var(--space-4)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Period</th>
              <th className="text-right py-[var(--space-2)] pr-[var(--space-4)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Days</th>
              <th className="text-left py-[var(--space-2)] pr-[var(--space-4)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">vs Avg</th>
              <th className="text-left py-[var(--space-2)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((t) => {
              const delta = t.daysToComplete - avgDays;
              const isFaster = delta < -0.5;
              const isSlower = delta > 0.5;
              return (
                <tr
                  key={t.periodLabel}
                  className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-table-row-hover)] transition-colors duration-[var(--transition-fast)]"
                >
                  <td className="py-[var(--space-2)] pr-[var(--space-4)] font-medium text-[var(--text-primary)]">{t.periodLabel}</td>
                  <td className="py-[var(--space-2)] pr-[var(--space-4)] text-right tabular-nums font-semibold text-[var(--text-primary)]">{t.daysToComplete}</td>
                  <td className="py-[var(--space-2)] pr-[var(--space-4)]">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${
                        isFaster ? 'text-[var(--status-success)]' : isSlower ? 'text-[var(--status-error)]' : 'text-[var(--text-tertiary)]'
                      }`}
                    >
                      {isFaster ? `${Math.abs(delta).toFixed(1)}d faster` : isSlower ? `${delta.toFixed(1)}d slower` : 'on avg'}
                    </span>
                  </td>
                  <td className="py-[var(--space-2)] capitalize text-[var(--text-secondary)]">{t.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-[var(--space-3)] text-xs text-[var(--text-tertiary)]">
        Average: {avgDays.toFixed(1)} days across {trend.length} period{trend.length !== 1 ? 's' : ''}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function AnalyticsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { data: session } = useCloseSession(sessionId);
  const entityId = session?.entityId ?? null;
  const { data, isLoading, error } = useAuditAnalytics(entityId, sessionId);

  if (isLoading || !session) {
    return (
      <div className="p-[var(--space-8)]">
        <div className="animate-pulse space-y-[var(--space-6)]">
          <div className="h-8 w-48 bg-[var(--bg-surface-sunken)] rounded-[var(--radius-md)]" />
          <div className="h-40 bg-[var(--bg-surface-sunken)] rounded-[var(--radius-lg)]" />
          <div className="h-40 bg-[var(--bg-surface-sunken)] rounded-[var(--radius-lg)]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-[var(--space-8)]">
        <Card status="error" title="Analytics Error">
          <p className="text-sm text-[var(--status-error)]">
            Failed to load audit analytics: {(error as Error).message}
          </p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-[var(--space-8)] max-w-[1280px] mx-auto space-y-[var(--space-6)]">
      {/* Header */}
      <div className="flex items-center gap-[var(--space-3)]">
        <BarChart3 className="w-6 h-6 text-[var(--interactive-primary)]" />
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Audit Analytics</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {session.entityName} &middot; {session.periodLabel}
          </p>
        </div>
      </div>

      {/* Audit Ledger Summary */}
      <div className="grid grid-cols-3 gap-[var(--space-4)]">
        <MetricCard label="Audit Ledger Entries" value={data.auditLedgerStats.totalEntries.toLocaleString()} />
        <MetricCard label="Unique Event Types" value={data.auditLedgerStats.uniqueEventTypes.toLocaleString()} />
        <MetricCard
          label="Chain Integrity"
          value={data.auditLedgerStats.chainValid === null ? 'Not Verified' : data.auditLedgerStats.chainValid ? 'Valid' : 'Broken'}
        />
      </div>

      {/* Section 1 */}
      <JEApprovalSection data={data.jeApproval} />

      {/* Section 2 */}
      <AISuggestionSection data={data.aiSuggestions} />

      {/* Section 3 */}
      <ManualReviewSection accounts={data.manualReviewAccounts} />

      {/* Section 4 */}
      <VelocityTrendSection trend={data.velocityTrend} />
    </div>
  );
}
