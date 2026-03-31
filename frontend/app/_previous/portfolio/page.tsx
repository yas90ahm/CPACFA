'use client';

import { useState, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { usePortfolioCompanies, usePortfolioSummary } from '@/lib/queries/portfolio';
import { usePortfolioAlerts, usePortfolioMetrics } from '@/lib/queries/portfolio-alerts';
import type { PortfolioAlert } from '@/lib/queries/portfolio-alerts';
import type { PortfolioCompany } from '@/lib/types/portfolio';
import type { CloseState } from '@/lib/types/close-session';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/money';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ChevronLeft, ChevronRight, Lock, AlertTriangle, TrendingDown, TrendingUp, Minus, ShieldCheck, FileWarning, AlertCircle, Info, X, Check, Clock, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

const MARGIN_THRESHOLD = 10;

function DataSourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  const isCertified = source === 'certified' || source === 'locked';
  return (
    <StatusBadge
      status={isCertified ? 'certified' : 'pending'}
      size="sm"
      label={isCertified ? 'Certified' : 'Draft'}
    />
  );
}

function PortfolioTotalsBadge({ certifiedCount, totalWithData }: { certifiedCount: number; totalWithData: number }) {
  if (totalWithData === 0) return null;
  const allCertified = certifiedCount === totalWithData;
  return (
    <StatusBadge
      status={allCertified ? 'certified' : 'pending'}
      label={allCertified ? 'All Certified' : `${certifiedCount} of ${totalWithData} certified`}
      size="sm"
      className="ml-2"
    />
  );
}

function buildPeriods(currentPeriod: string | undefined): string[] {
  const now = currentPeriod ? new Date(currentPeriod + '-01') : new Date();
  if (isNaN(now.getTime())) {
    const fallback = new Date();
    return [
      new Date(fallback.getFullYear(), fallback.getMonth() - 1, 1),
      new Date(fallback.getFullYear(), fallback.getMonth(), 1),
      new Date(fallback.getFullYear(), fallback.getMonth() + 1, 1),
    ].map((d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  }
  return [
    new Date(now.getFullYear(), now.getMonth() - 1, 1),
    new Date(now.getFullYear(), now.getMonth(), 1),
    new Date(now.getFullYear(), now.getMonth() + 1, 1),
  ].map((d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
}

const STATE_TO_STATUS: Record<CloseState, 'not-started' | 'in-progress' | 'pending' | 'certified' | 'locked'> = {
  OPEN: 'not-started',
  IN_PROGRESS: 'in-progress',
  UNDER_REVIEW: 'pending',
  CERTIFIED: 'certified',
  LOCKED: 'locked',
};

function formatRev(n: string | null): string {
  return fmtMoney(n, { dollar: true });
}

function formatMargin(pct: string | null): string {
  if (!pct) return '—';
  return `${pct}%`;
}

function Sparkline({ history, target }: { history: (number | null)[]; target: number }) {
  const vals = history.filter((h): h is number => h != null);
  const max = Math.max(...vals, target, 1);
  return (
    <div className="flex items-end gap-0.5 h-6" title={vals.join(', ')}>
      {history.map((v, i) => {
        const h = v == null ? 0 : Math.max(2, (v / max) * 16);
        const over = v != null && v > target;
        const atOrUnder = v != null && v <= target;
        const bg = v == null
          ? 'var(--status-neutral-bg)'
          : over
            ? 'var(--status-warning)'
            : atOrUnder
              ? 'var(--status-success)'
              : 'var(--text-tertiary)';
        return (
          <div
            key={i}
            className="w-1.5 rounded-sm shrink-0"
            style={{ height: `${h}px`, background: bg }}
          />
        );
      })}
    </div>
  );
}

function alertIcon(severity: PortfolioAlert['severity']) {
  if (severity === 'critical') return <AlertCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--status-error)' }} />;
  if (severity === 'warning') return <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--status-warning)' }} />;
  return <Info className="w-5 h-5 shrink-0" style={{ color: 'var(--status-info)' }} />;
}

function alertBorderStyle(severity: PortfolioAlert['severity']): React.CSSProperties {
  if (severity === 'critical') return { borderLeftColor: 'var(--status-error)' };
  if (severity === 'warning') return { borderLeftColor: 'var(--status-warning)' };
  return { borderLeftColor: 'var(--status-info)' };
}

function AlertsSection({ alerts }: { alerts: PortfolioAlert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [lastDismissed, setLastDismissed] = useState<{ id: string; alert: PortfolioAlert } | null>(null);

  const visible = alerts.filter((a) => !dismissed.has(a.id));

  function dismissAlert(alert: PortfolioAlert) {
    setDismissed((prev) => new Set(prev).add(alert.id));
    setLastDismissed({ id: alert.id, alert });
    setTimeout(() => setLastDismissed((cur) => (cur?.id === alert.id ? null : cur)), 5000);
  }

  function undoDismiss(item: { id: string; alert: PortfolioAlert }) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    setLastDismissed(null);
  }

  if (visible.length === 0 && !lastDismissed) return null;

  return (
    <section>
      {visible.length > 0 && (
        <>
          <h2 className="text-lg font-display mb-3" style={{ color: 'var(--text-primary)' }}>Alerts ({visible.length})</h2>
          <div className="space-y-2">
            {visible.map((alert) => (
              <div
                key={alert.id}
                className="rounded-lg p-4 border-l-4 flex items-start gap-3"
                style={{
                  background: 'var(--bg-surface)',
                  borderColor: 'var(--border-default)',
                  borderStyle: 'solid',
                  borderWidth: '1px',
                  borderLeftWidth: '4px',
                  ...alertBorderStyle(alert.severity),
                }}
              >
                {alertIcon(alert.severity)}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{alert.entityName}</span>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{alert.message}</p>
                </div>
                {/* FIX 4B: View link */}
                {alert.entityId && (
                  <Link
                    href={`/portfolio/${alert.entityId}`}
                    className="text-sm font-medium ml-auto shrink-0"
                    style={{ color: 'var(--interactive-primary)' }}
                  >
                    View &rarr;
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => dismissAlert(alert)}
                  className="p-1 rounded-md shrink-0"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label="Dismiss alert"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {/* FIX 4B: Undo toast */}
      {lastDismissed && (
        <div
          className="fixed bottom-4 right-4 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg z-50"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Alert dismissed</span>
          <button
            type="button"
            onClick={() => undoDismiss(lastDismissed)}
            className="text-sm font-medium"
            style={{ color: 'var(--interactive-primary)' }}
          >
            Undo
          </button>
        </div>
      )}
    </section>
  );
}

export default function PortfolioPage() {
  const router = useRouter();
  const { data: companies = [], isLoading: entitiesLoading, error: entitiesError } = usePortfolioCompanies();
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: alerts = [] } = usePortfolioAlerts();
  const { data: metrics } = usePortfolioMetrics();
  const periods = buildPeriods(summary?.currentPeriod);
  const [periodIndex, setPeriodIndex] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllColumns, setShowAllColumns] = useState(false);

  const isLoading = entitiesLoading || summaryLoading;

  const openCompany = (c: PortfolioCompany) => {
    if (!c.currentSessionId) return;
    router.push(`/close/${c.currentSessionId}/dashboard`);
  };

  const filtered = useMemo(() => {
    let list = companies;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (statusFilter === 'attention') list = list.filter((c) => c.needsAttention);
    if (statusFilter === 'in_progress') list = list.filter((c) => c.currentState === 'IN_PROGRESS' || c.currentState === 'UNDER_REVIEW');
    if (statusFilter === 'closed') list = list.filter((c) => c.currentState === 'CERTIFIED' || c.currentState === 'LOCKED');
    if (statusFilter === 'not_started') list = list.filter((c) => c.currentState === 'OPEN');
    return [...list].sort((a, b) => {
      if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
      const da = a.daysInClose ?? 0;
      const db = b.daysInClose ?? 0;
      return db - da;
    });
  }, [companies, search, statusFilter]);

  const attentionCompanies = companies.filter((c) => c.needsAttention);
  const avgImproving = summary && summary.avgCloseDays < summary.priorAvgCloseDays;

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <div className="min-h-[200px] flex items-center justify-center">
          <p style={{ color: 'var(--text-secondary)' }}>Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (entitiesError) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <div className="rounded-lg p-6" style={{ background: 'var(--status-error-bg)', borderColor: 'var(--status-error-border)', borderWidth: '1px', borderStyle: 'solid', color: 'var(--status-error)' }}>
          <p className="font-medium">Could not load portfolio data</p>
          <p className="text-sm mt-1">{entitiesError instanceof Error ? entitiesError.message : 'An error occurred.'}</p>
        </div>
      </div>
    );
  }

  if (!companies?.length) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <h1 className="text-2xl font-display mb-6" style={{ color: 'var(--text-primary)' }}>Portfolio Dashboard</h1>
        <div className="rounded-lg p-12 text-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--status-info-bg)' }}>
            <TrendingUp className="w-8 h-8" style={{ color: 'var(--interactive-primary)' }} />
          </div>
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Welcome to Sovereign CPA Engine</p>
          <p className="text-sm max-w-md mx-auto mb-6" style={{ color: 'var(--text-secondary)' }}>
            Get started by creating your first monthly close session. Your portfolio companies will appear here automatically.
          </p>
          <button
            type="button"
            onClick={() => router.push('/close')}
            className="px-6 py-2.5 rounded-md text-sm font-medium"
            style={{ background: 'var(--interactive-primary)', color: 'var(--text-on-primary)' }}
          >
            Create First Close Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>Portfolio Dashboard</h1>
          <nav className="flex gap-6 mt-3" role="tablist">
            <button
              role="tab"
              aria-selected="true"
              className="pb-2 text-sm font-medium transition-colors"
              style={{
                color: 'var(--interactive-primary)',
                borderBottomWidth: '2px',
                borderBottomStyle: 'solid',
                borderBottomColor: 'var(--interactive-primary)',
                background: 'none',
                border: 'none',
                borderBottom: '2px solid var(--interactive-primary)',
                cursor: 'default',
                padding: '0 0 8px 0',
              }}
            >
              Entity View
            </button>
            <button
              role="tab"
              aria-selected="false"
              className="pb-2 text-sm font-medium transition-colors"
              style={{
                color: 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                borderBottom: '2px solid transparent',
                cursor: 'pointer',
                padding: '0 0 8px 0',
              }}
              onClick={() => router.push('/portfolio/consolidated')}
            >
              Consolidated View
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={() => setPeriodIndex(Math.max(0, periodIndex - 1))} className="p-1.5 rounded-md" style={{ background: 'transparent' }} aria-label="Prior period">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-medium min-w-[120px] text-center" style={{ color: 'var(--text-primary)' }}>{periods[periodIndex]}</span>
          <button type="button" onClick={() => setPeriodIndex(Math.min(periods.length - 1, periodIndex + 1))} className="p-1.5 rounded-md" style={{ background: 'transparent' }} aria-label="Next period">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Portfolio Alerts */}
      {alerts.length > 0 && <AlertsSection alerts={alerts} />}

      {/* KPI Metrics Cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
            <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Portfolio EBITDA</p>
            <div className="text-2xl font-display mt-1"><MoneyCell value={metrics.portfolioEbitda} showCurrency /></div>
          </div>
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
            <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Total Revenue</p>
            <div className="text-2xl font-display mt-1"><MoneyCell value={metrics.totalRevenue} showCurrency /></div>
          </div>
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
            <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Avg Close Days</p>
            <p className="text-2xl font-display mt-1" style={{ color: 'var(--text-primary)' }}>{metrics.avgCloseDays}</p>
          </div>
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
            <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Certified / Total</p>
            <p className="text-2xl font-display mt-1">
              <span style={{ color: 'var(--status-success)' }}>{metrics.entitiesCertified}</span>
              <span style={{ color: 'var(--text-tertiary)' }}> / {metrics.entitiesTotal}</span>
            </p>
          </div>
        </div>
      )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
          <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Companies</p>
          <p className="text-2xl font-display mt-1" style={{ color: 'var(--text-primary)' }}>{summary?.totalEntities ?? 0}</p>
        </div>
        <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
          <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Closed</p>
          <p className="text-2xl font-display mt-1" style={{ color: 'var(--status-success)' }}>{summary?.closedThisPeriod ?? 0}</p>
        </div>
        <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
          <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>In Progress</p>
          <p className="text-2xl font-display mt-1" style={{ color: 'var(--interactive-primary)' }}>{summary?.inProgress ?? 0}</p>
        </div>
        <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
          <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Not Started</p>
          <p className="text-2xl font-display mt-1" style={{ color: 'var(--text-tertiary)' }}>{summary?.notStarted ?? 0}</p>
        </div>
        <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
          <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Attention</p>
          <p className="text-2xl font-display mt-1" style={{ color: 'var(--status-error)' }}>{summary?.needsAttention ?? 0}</p>
        </div>
      </div>

      <div className="rounded-lg p-4 flex flex-wrap items-center justify-between gap-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Current Period:</span> {summary?.currentPeriod ?? '—'}
        </p>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Avg Close Duration:</span>{' '}
          <span className="font-mono font-medium">{summary?.avgCloseDays != null ? summary.avgCloseDays : '—'} days</span>
          {(summary?.priorAvgCloseDays ?? 0) > 0 && (
            <>
              <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>(vs {summary?.priorAvgCloseDays} prior)</span>
              {avgImproving ? <TrendingDown className="inline w-4 h-4 ml-1" style={{ color: 'var(--status-success)' }} /> : <TrendingUp className="inline w-4 h-4 ml-1" style={{ color: 'var(--status-warning)' }} />}
            </>
          )}
        </p>
      </div>

      {attentionCompanies.length > 0 ? (
        <section>
          <h2 className="text-lg font-display mb-4" style={{ color: 'var(--text-primary)' }}>Companies Needing Attention ({attentionCompanies.length})</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {attentionCompanies.map((c) => (
              <div
                key={c.id}
                onClick={() => openCompany(c)}
                className="rounded-lg p-5 cursor-pointer transition-colors"
                style={
                  c.daysInClose != null && c.daysInClose > c.targetCloseDays
                    ? { borderColor: 'var(--status-error-border)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--status-error-bg)' }
                    : { borderColor: 'var(--status-warning-border)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--status-warning-bg)' }
                }
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--status-warning)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {c.currentPeriod} — {c.currentState.replace('_', ' ')} — Day {c.daysInClose ?? '?'} of {c.targetCloseDays}
                      {c.daysInClose != null && c.daysInClose > c.targetCloseDays && ' (OVERDUE)'}
                    </p>
                    {c.blockingIssues > 0 && (
                      <p className="text-sm mt-2" style={{ color: 'var(--status-error)' }}>{c.blockingIssues} blocking issue{c.blockingIssues !== 1 ? 's' : ''}</p>
                    )}
                    {c.attentionReason === 'Stalled' && (
                      <p className="text-sm mt-2" style={{ color: 'var(--status-warning)' }}>No activity in 48 hours</p>
                    )}
                    <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                      Preparer: {c.preparer ?? '—'} | Last activity: {c.lastActivity ?? '—'}
                    </p>
                    <button type="button" className="mt-3 text-sm hover:underline" style={{ color: 'var(--interactive-primary)' }}>
                      View Details →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-lg p-5 text-sm flex items-center gap-2" style={{ background: 'var(--status-success-bg)', borderColor: 'var(--status-success-border)', borderWidth: '1px', borderStyle: 'solid', color: 'var(--status-success)' }}>
          <span>✓</span> All companies on track — no attention needed.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by company name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md px-3 py-2 text-sm w-64"
          style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md px-3 py-2 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }}>
          <option value="all">All</option>
          <option value="attention">Needs Attention</option>
          <option value="in_progress">In Progress</option>
          <option value="closed">Closed</option>
          <option value="not_started">Not Started</option>
        </select>
      </div>

      {/* FIX 4A: Column toggle button */}
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={() => setShowAllColumns(!showAllColumns)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md"
          style={{ color: 'var(--interactive-primary)', border: '1px solid var(--border-default)' }}
        >
          {showAllColumns ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showAllColumns ? 'Show key metrics' : 'Show all columns'}
        </button>
      </div>

      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr style={{ borderBottomColor: 'var(--border-default)', borderBottomWidth: '1px', borderBottomStyle: 'solid', background: 'var(--bg-surface-sunken)' }}>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Company</th>
                <th className="text-left py-3 px-4 font-medium w-[130px]" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="text-center py-3 px-4 font-medium w-[100px]" style={{ color: 'var(--text-secondary)' }}>Progress</th>
                <th className="text-right py-3 px-4 font-medium w-[120px]" style={{ color: 'var(--text-secondary)' }}>EBITDA</th>
                <th className="text-right py-3 px-4 font-medium w-[120px]" style={{ color: 'var(--text-secondary)' }}>Revenue</th>
                <th className="text-right py-3 px-4 font-medium w-[90px]" style={{ color: 'var(--text-secondary)' }}>Days</th>
                {showAllColumns && (
                  <>
                    <th className="text-left py-3 px-4 font-medium w-[120px]" style={{ color: 'var(--text-secondary)' }}>Period</th>
                    <th className="text-left py-3 px-4 font-medium w-[120px]" style={{ color: 'var(--text-secondary)' }}>Preparer</th>
                    <th className="text-left py-3 px-4 font-medium w-[120px]" style={{ color: 'var(--text-secondary)' }}>Reviewer</th>
                    <th className="text-right py-3 px-4 font-medium w-[80px]" style={{ color: 'var(--text-secondary)' }}>Target</th>
                    <th className="text-center py-3 px-4 font-medium w-[90px]" style={{ color: 'var(--text-secondary)' }}>Issues</th>
                    <th className="text-right py-3 px-4 font-medium w-[120px]" style={{ color: 'var(--text-secondary)' }}>Net Income</th>
                    <th className="text-right py-3 px-4 font-medium w-[80px]" style={{ color: 'var(--text-secondary)' }}>Margin</th>
                    <th className="text-center py-3 px-4 font-medium w-[80px]" style={{ color: 'var(--text-secondary)' }}>Trend</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isHistorical = c.currentState === 'CERTIFIED' || c.currentState === 'LOCKED';
                const marginPct = c.marginPercent ? parseFloat(c.marginPercent) : null;
                return (
                  <Fragment key={c.id}>
                    <tr
                      key={c.id}
                      onClick={() => {
                        router.push(`/portfolio/${c.id}`);
                      }}
                      className={cn(
                        'transition-colors cursor-pointer',
                        isHistorical && 'opacity-85'
                      )}
                      style={{
                        borderBottomColor: 'var(--border-subtle)',
                        borderBottomWidth: '1px',
                        borderBottomStyle: 'solid',
                        ...(c.needsAttention ? { borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: 'var(--status-error)' } : {}),
                        ...(c.currentSessionId ? {} : {}),
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-table-row-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                    >
                      <td className="py-2.5 px-4">
                        <span className={cn('font-medium', c.needsAttention && 'font-semibold')}>{c.name}</span>
                        {!c.currentSessionId && (
                          <span className="ml-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>(No active session)</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusBadge status={STATE_TO_STATUS[c.currentState]} size="sm" />
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-1.5 w-12 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-sunken)' }} role="progressbar" aria-valuenow={c.gatesPassing} aria-valuemin={0} aria-valuemax={c.gatesTotal} aria-label={`${c.gatesPassing} of ${c.gatesTotal} gates passing`}>
                            <div className="h-full rounded-full" style={{ width: `${c.gatesTotal > 0 ? (c.gatesPassing / c.gatesTotal) * 100 : 0}%`, background: 'var(--status-success)' }} />
                          </div>
                          {c.gatesPassing === c.gatesTotal && c.gatesTotal > 0
                            ? <Check className="w-3 h-3" style={{ color: 'var(--status-success)' }} />
                            : c.gatesPassing > 0
                              ? <Clock className="w-3 h-3" style={{ color: 'var(--status-warning)' }} />
                              : <X className="w-3 h-3" style={{ color: 'var(--status-error)' }} />}
                          <span className="font-mono text-xs">{c.gatesPassing}/{c.gatesTotal}</span>
                          <span className="sr-only">{c.gatesPassing === c.gatesTotal && c.gatesTotal > 0 ? 'All gates passing' : c.gatesPassing > 0 ? 'Some gates pending' : 'No gates passing'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right"><MoneyCell value={c.financials?.ebitda ?? null} showCurrency /></td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          {c.revenue != null && <DataSourceBadge source={c.dataSource} />}
                          <MoneyCell value={c.revenue} showCurrency />
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        <span style={c.daysInClose != null && c.daysInClose > c.targetCloseDays ? { color: 'var(--status-error)' } : undefined}>{c.daysInClose ?? '—'}</span>
                      </td>
                      {showAllColumns && (
                        <>
                          <td className="py-2.5 px-4">{c.currentPeriod}</td>
                          <td className="py-2.5 px-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{c.preparer ?? '—'}</td>
                          <td className="py-2.5 px-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{c.reviewer ?? '—'}</td>
                          <td className="py-2.5 px-4 text-right" style={{ color: 'var(--text-secondary)' }}>Day {c.targetCloseDays}</td>
                          <td className="py-2.5 px-4 text-center">
                            {c.blockingIssues > 0 ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: 'var(--status-error-bg)', color: 'var(--status-error)' }}>{c.blockingIssues}</span>
                            ) : (
                              <span className="font-mono" style={{ color: 'var(--status-success)' }}>0</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right"><MoneyCell value={c.netIncome} showCurrency /></td>
                          <td className="py-2.5 px-4 text-right font-mono" style={marginPct != null && marginPct < MARGIN_THRESHOLD ? { color: 'var(--status-error)' } : marginPct != null && marginPct >= MARGIN_THRESHOLD ? { color: 'var(--status-success)' } : undefined}>
                            {formatMargin(c.marginPercent)}
                          </td>
                          <td className="py-2.5 px-4">
                            <Sparkline history={c.closeDurationHistory} target={c.targetCloseDays} />
                          </td>
                        </>
                      )}
                    </tr>
                    {expandedId === c.id && (
                      <tr key={`${c.id}-exp`} style={{ borderBottomColor: 'var(--border-subtle)', borderBottomWidth: '1px', borderBottomStyle: 'solid', background: 'var(--bg-surface-sunken)' }}>
                        <td colSpan={showAllColumns ? 14 : 6} className="py-4 px-4">
                          <div className="max-w-2xl space-y-3">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.name} — {c.currentPeriod} — {c.currentState.replace('_', ' ')} (Day {c.daysInClose ?? '?'} of {c.targetCloseDays})</p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              Phase: ✓ Ingest ✓ Mapping ● Recon ({c.gatesPassing}/{c.gatesTotal}) ○ AJEs ○ Statements ○ Review
                            </p>
                            {c.blockingIssues > 0 && <p className="text-xs" style={{ color: 'var(--status-error)' }}>{c.blockingIssues} blocking issue{c.blockingIssues !== 1 ? 's' : ''}</p>}
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Preparer: {c.preparer ?? '—'} | Reviewer: {c.reviewer ?? '—'}</p>
                            <button type="button" onClick={(e) => { e.stopPropagation(); openCompany(c); }} className="text-sm hover:underline" style={{ color: 'var(--interactive-primary)' }}>
                              Open Close Dashboard →
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-display mb-4" style={{ color: 'var(--text-primary)' }}>Financial Overview — {summary?.currentPeriod ?? '—'}</h2>
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottomColor: 'var(--border-default)', borderBottomWidth: '1px', borderBottomStyle: 'solid', background: 'var(--bg-surface-sunken)' }}>
                <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Company</th>
                <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Revenue</th>
                <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Net Income</th>
                <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Margin</th>
                <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>vs Prior</th>
              </tr>
            </thead>
            <tbody>
              {companies.filter((c) => c.revenue != null).map((c) => {
                const marginPct = c.marginPercent ? parseFloat(c.marginPercent) : null;
                const vsPrior = c.marginVsPriorPp ? parseFloat(c.marginVsPriorPp) : null;
                return (
                  <tr
                    key={c.id}
                    onClick={() => openCompany(c)}
                    className="cursor-pointer"
                    style={{ borderBottomColor: 'var(--border-subtle)', borderBottomWidth: '1px', borderBottomStyle: 'solid' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-table-row-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                  >
                    <td className="py-2.5 px-4">
                      <span className="font-medium">{c.name}</span>
                      <DataSourceBadge source={c.dataSource} />
                    </td>
                    <td className="py-2.5 px-4 text-right"><MoneyCell value={c.revenue} showCurrency /></td>
                    <td className="py-2.5 px-4 text-right"><MoneyCell value={c.netIncome} showCurrency /></td>
                    <td className="py-2.5 px-4 text-right font-mono" style={marginPct != null && marginPct < MARGIN_THRESHOLD ? { color: 'var(--status-error)' } : marginPct != null && marginPct >= MARGIN_THRESHOLD ? { color: 'var(--status-success)' } : undefined}>
                      {formatMargin(c.marginPercent)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono" style={vsPrior != null && vsPrior >= 0 ? { color: 'var(--status-success)' } : vsPrior != null && vsPrior < 0 ? { color: 'var(--status-error)' } : undefined}>
                      {c.marginVsPriorPp != null ? `${vsPrior! >= 0 ? '+' : ''}${c.marginVsPriorPp}pp` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-medium" style={{ borderTopWidth: '2px', borderTopStyle: 'solid', borderTopColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)' }}>
                <td className="py-3 px-4">
                  Portfolio Total
                  {summary && <PortfolioTotalsBadge certifiedCount={summary.certifiedCount} totalWithData={summary.totalWithData} />}
                </td>
                <td className="py-3 px-4 text-right"><MoneyCell value={summary?.portfolioRevenue ?? null} showCurrency /></td>
                <td className="py-3 px-4 text-right"><MoneyCell value={summary?.portfolioNetIncome ?? null} showCurrency /></td>
                <td className="py-3 px-4 text-right font-mono">{summary?.portfolioMargin ?? '—'}%</td>
                <td className="py-3 px-4 text-right">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-display mb-4" style={{ color: 'var(--text-primary)' }}>Close Duration Trend (days)</h2>
        <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
          {companies.slice(0, 6).map((c) => {
            const vals = (c.closeDurationHistory ?? []).filter((h): h is number => h != null);
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
            const last = vals[vals.length - 1];
            const improving = vals.length >= 2 && last != null && vals[vals.length - 2] != null && last < vals[vals.length - 2];
            const worsening = vals.length >= 2 && last != null && vals[vals.length - 2] != null && last > vals[vals.length - 2];
            return (
              <div key={c.id} className="flex items-center gap-4">
                <span className="w-48 text-sm truncate">{c.name}</span>
                <Sparkline history={c.closeDurationHistory} target={c.targetCloseDays} />
                <span className="text-xs font-mono w-32" style={{ color: 'var(--text-secondary)' }}>
                  {last ?? '—'} days (avg: {avg.toFixed(1)}{improving ? ', improving ↓' : worsening ? ', worsening ↑' : ', stable →'})
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
