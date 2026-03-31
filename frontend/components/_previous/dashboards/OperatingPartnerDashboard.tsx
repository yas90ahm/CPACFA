'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { usePortfolioCompanies, usePortfolioSummary, usePortfolioIntegrityReport } from '@/lib/queries/portfolio';
import type { PortfolioCompany } from '@/lib/types/portfolio';
import { cn } from '@/lib/utils';
import {
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Phone,
  Building2,
  CheckCircle2,
  Clock,
  BarChart3,
} from 'lucide-react';

function formatMoney(v: string | null | undefined): string {
  if (!v) return '$0';
  const n = parseFloat(v);
  if (isNaN(n)) return '$0';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

function scoreColor(score: number): string {
  return score >= 90 ? 'var(--status-success)' : score >= 70 ? 'var(--status-warning)' : 'var(--status-error)';
}

function ScoreGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? { r: 44, w: 104, stroke: 6, text: 'text-3xl' } : size === 'md' ? { r: 28, w: 68, stroke: 4, text: 'text-xl' } : { r: 18, w: 44, stroke: 3, text: 'text-sm' };
  const circumference = 2 * Math.PI * dims.r;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: dims.w, height: dims.w }}>
      <svg className="transform -rotate-90" width={dims.w} height={dims.w}>
        <circle cx={dims.w / 2} cy={dims.w / 2} r={dims.r} strokeWidth={dims.stroke} stroke="var(--bg-surface-sunken)" fill="none" />
        <circle cx={dims.w / 2} cy={dims.w / 2} r={dims.r} strokeWidth={dims.stroke} stroke={color} fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-1000" />
      </svg>
      <span className={cn('absolute font-semibold tabular-nums', dims.text)} style={{ color }}>{score}</span>
    </div>
  );
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const w = nums.length * 12;
  const h = 20;
  const points = nums.map((v, i) => `${(i / (nums.length - 1)) * (w - 4) + 2},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  const last = nums[nums.length - 1];
  const color = last > nums[0] ? 'var(--status-success)' : last < nums[0] ? 'var(--status-error)' : 'var(--text-tertiary)';

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function stateStyle(state: string): React.CSSProperties {
  switch (state) {
    case 'OPEN':
    case 'LOCKED':
      return { background: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)' };
    case 'IN_PROGRESS':
      return { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' };
    case 'UNDER_REVIEW':
      return { background: 'var(--ai-bg)', color: 'var(--ai-text)' };
    case 'CERTIFIED':
      return { background: 'var(--status-success-bg)', color: 'var(--status-success)' };
    default:
      return { background: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)' };
  }
}

export function OperatingPartnerDashboard() {
  const { data: companies = [], isLoading: companiesLoading } = usePortfolioCompanies();
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: integrityReport } = usePortfolioIntegrityReport();
  const router = useRouter();

  const isLoading = companiesLoading || summaryLoading;

  const alertEntities = useMemo(() => {
    if (!integrityReport) return [];
    return integrityReport.entities.filter(e => e.overallScore < 70);
  }, [integrityReport]);

  const sortedCompanies = useMemo(() => {
    return [...companies].sort((a, b) => {
      if (a.needsAttention && !b.needsAttention) return -1;
      if (!a.needsAttention && b.needsAttention) return 1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  }, [companies]);

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-6 animate-pulse">
        <div className="h-8 w-64 rounded" style={{ background: 'var(--bg-surface-sunken)' }} />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl" style={{ background: 'var(--bg-surface)' }} />)}
        </div>
        <div className="h-80 rounded-xl" style={{ background: 'var(--bg-surface)' }} />
      </div>
    );
  }

  const overallScore = integrityReport?.overallScore ?? 0;

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Portfolio Command Center</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>{summary?.currentPeriod ?? ''} — {summary?.totalEntities ?? 0} entities</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Integrity Score */}
        <div className="rounded-xl p-5 flex items-center gap-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <ScoreGauge score={overallScore} size="md" />
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Integrity Score</p>
            <p className="text-lg font-semibold" style={{ color: scoreColor(overallScore) }}>
              {overallScore >= 90 ? 'Excellent' : overallScore >= 70 ? 'Good' : 'Needs Attention'}
            </p>
          </div>
        </div>

        {/* Entities Status */}
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>Close Status</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--status-success)' }}>{summary?.closedThisPeriod ?? 0}</span>
            <span className="text-sm mb-0.5" style={{ color: 'var(--text-tertiary)' }}>/ {summary?.totalEntities ?? 0} closed</span>
          </div>
          <div className="flex gap-2 mt-3">
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>{summary?.inProgress ?? 0} in progress</span>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)' }}>{summary?.notStarted ?? 0} not started</span>
          </div>
        </div>

        {/* Revenue */}
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>Portfolio Revenue</p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatMoney(summary?.portfolioRevenue)}</p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>Margin: {summary?.portfolioMargin ?? '0'}%</p>
        </div>

        {/* Avg Close Days */}
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>Avg Close Duration</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{summary?.avgCloseDays ?? 0}</span>
            <span className="text-sm mb-0.5" style={{ color: 'var(--text-tertiary)' }}>days</span>
          </div>
          {summary?.priorAvgCloseDays != null && summary.priorAvgCloseDays > 0 && (
            <p
              className="text-xs mt-2"
              style={{ color: (summary?.avgCloseDays ?? 0) < summary.priorAvgCloseDays ? 'var(--status-success)' : 'var(--status-warning)' }}
            >
              {(summary?.avgCloseDays ?? 0) < summary.priorAvgCloseDays ? 'Improved' : 'Slower'} vs prior ({summary.priorAvgCloseDays}d)
            </p>
          )}
        </div>
      </div>

      {/* Pick up the phone alert */}
      {alertEntities.length > 0 && (
        <div className="rounded-xl p-5" style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error)' }}>
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--status-error)' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--status-error)' }}>
                {alertEntities.length} entit{alertEntities.length === 1 ? 'y' : 'ies'} below integrity threshold
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>These require immediate attention from the operating team.</p>
              <div className="mt-3 space-y-2">
                {alertEntities.map(e => (
                  <div key={e.entityId} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--status-error-bg)' }}>
                    <ScoreGauge score={e.overallScore} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{e.entityName}</p>
                      {e.issues && e.issues.length > 0 && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{e.issues.join(' · ')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Entity Comparison Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Entity Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                <th className="text-left px-6 py-3">Entity</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Revenue</th>
                <th className="text-right px-4 py-3">Net Income</th>
                <th className="text-right px-4 py-3">Margin</th>
                <th className="text-center px-4 py-3">Gates</th>
                <th className="text-center px-4 py-3">Trend</th>
                <th className="text-center px-4 py-3">Alerts</th>
              </tr>
            </thead>
            <tbody>
              {sortedCompanies.map(company => {
                const margin = company.marginPercent ? parseFloat(company.marginPercent) : null;
                return (
                  <tr
                    key={company.id}
                    className="transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid var(--border-default)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-sunken)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                    onClick={() => {
                      if (company.currentSessionId) {
                        router.push(`/close/${company.currentSessionId}/dashboard`);
                      }
                    }}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {company.needsAttention && <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--status-warning)' }} />}
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{company.name}</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{company.sector}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium uppercase"
                        style={stateStyle(company.currentState)}
                      >
                        {company.currentState?.replace('_', ' ') ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatMoney(company.revenue)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatMoney(company.netIncome)}</td>
                    <td className="px-4 py-3 text-right">
                      {margin != null ? (
                        <span
                          className="text-sm tabular-nums"
                          style={{ color: margin >= 10 ? 'var(--status-success)' : margin >= 0 ? 'var(--status-warning)' : 'var(--status-error)' }}
                        >
                          {margin.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{company.gatesPassing}/{company.gatesTotal}</span>
                    </td>
                    <td className="px-4 py-3 flex justify-center">
                      <Sparkline values={company.closeDurationHistory} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {company.blockingIssues > 0 ? (
                        <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--status-error)' }}>{company.blockingIssues}</span>
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mx-auto" style={{ color: 'var(--status-success)', opacity: 0.5 }} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
