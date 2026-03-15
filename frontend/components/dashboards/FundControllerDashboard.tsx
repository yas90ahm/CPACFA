'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePortfolioCompanies, usePortfolioSummary, usePortfolioIntegrityReport } from '@/lib/queries/portfolio';
import { cn } from '@/lib/utils';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  GitMerge,
  Layers,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Shield,
} from 'lucide-react';

function formatMoney(v: string | null | undefined): string {
  if (!v) return '$0';
  const n = parseFloat(v);
  if (isNaN(n)) return '$0';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

function ProgressRing({ value, max, size = 36 }: { value: number; max: number; size?: number }) {
  const pct = max > 0 ? value / max : 0;
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - pct * c;
  const color = pct >= 1 ? 'var(--status-success)' : pct >= 0.5 ? 'var(--status-warning)' : 'var(--status-error)';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={3} stroke="var(--bg-surface-sunken)" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={3} stroke={color} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>{value}/{max}</span>
    </div>
  );
}

export function FundControllerDashboard() {
  const { data: companies = [], isLoading: cLoading } = usePortfolioCompanies();
  const { data: summary, isLoading: sLoading } = usePortfolioSummary();
  const { data: integrityReport } = usePortfolioIntegrityReport();
  const router = useRouter();

  const isLoading = cLoading || sLoading;

  const entityGroups = useMemo(() => {
    const groups: Record<string, typeof companies> = {
      attention: [],
      in_progress: [],
      completed: [],
      not_started: [],
    };
    for (const c of companies) {
      if (c.needsAttention) groups.attention.push(c);
      else if (c.currentState === 'CERTIFIED' || c.currentState === 'LOCKED') groups.completed.push(c);
      else if (c.currentState === 'IN_PROGRESS' || c.currentState === 'UNDER_REVIEW') groups.in_progress.push(c);
      else groups.not_started.push(c);
    }
    return groups;
  }, [companies]);

  const totalVariances = useMemo(() => {
    return companies.reduce((sum, c) => sum + (c.blockingIssues ?? 0), 0);
  }, [companies]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-72 rounded" style={{ background: 'var(--bg-surface-sunken)' }} />
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--bg-surface)' }} />)}
        </div>
      </div>
    );
  }

  const consolidationReady = (summary?.closedThisPeriod ?? 0) === (summary?.totalEntities ?? 0) && (summary?.totalEntities ?? 0) > 0;

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Fund Controller Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {summary?.currentPeriod ?? ''} — {summary?.totalEntities ?? 0} entities across fund
          </p>
        </div>
        <Link
          href="/portfolio"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border text-xs transition-colors hover:opacity-90"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Portfolio View
        </Link>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="border rounded-xl p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Total Entities</p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{summary?.totalEntities ?? 0}</p>
        </div>
        <div className="border rounded-xl p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Closed</p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--status-success)' }}>{summary?.closedThisPeriod ?? 0}</p>
        </div>
        <div className="border rounded-xl p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>In Progress</p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--status-warning)' }}>{summary?.inProgress ?? 0}</p>
        </div>
        <div className="border rounded-xl p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Needs Attention</p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--status-error)' }}>{summary?.needsAttention ?? 0}</p>
        </div>
        <div className="border rounded-xl p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Cross-Entity Issues</p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{totalVariances}</p>
        </div>
      </div>

      {/* Consolidation Readiness */}
      <div
        className="border rounded-xl p-5"
        style={consolidationReady
          ? { background: 'var(--status-success-bg)', borderColor: 'var(--status-success-border)' }
          : { background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }
        }
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: consolidationReady ? 'var(--status-success-bg)' : 'var(--status-warning-bg)' }}
          >
            <Layers className="w-6 h-6" style={{ color: consolidationReady ? 'var(--status-success)' : 'var(--status-warning)' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Consolidation Readiness</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {consolidationReady
                ? 'All entities closed — ready to consolidate.'
                : `${summary?.closedThisPeriod ?? 0} of ${summary?.totalEntities ?? 0} entities closed. ${(summary?.totalEntities ?? 0) - (summary?.closedThisPeriod ?? 0)} remaining.`
              }
            </p>
          </div>
          <div className="h-2 w-32 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-sunken)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${((summary?.closedThisPeriod ?? 0) / Math.max(summary?.totalEntities ?? 1, 1)) * 100}%`,
                background: consolidationReady ? 'var(--status-success)' : 'var(--status-warning)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Intercompany Matching Status */}
      <div className="border rounded-xl p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
        <div className="flex items-center gap-3 mb-4">
          <GitMerge className="w-4 h-4" style={{ color: 'var(--interactive-primary)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Intercompany Matching</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center py-3 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
            <p className="text-lg font-semibold" style={{ color: 'var(--status-success)' }}>0</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Matched</p>
          </div>
          <div className="text-center py-3 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
            <p className="text-lg font-semibold" style={{ color: 'var(--status-warning)' }}>0</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Pending</p>
          </div>
          <div className="text-center py-3 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
            <p className="text-lg font-semibold" style={{ color: 'var(--status-error)' }}>0</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Mismatched</p>
          </div>
        </div>
        <p className="text-xs mt-3 text-center" style={{ color: 'var(--text-tertiary)' }}>Intercompany elimination entries will be generated when all entities are closed.</p>
      </div>

      {/* Entity Status Cards */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Building2 className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          Entity Close Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {companies.map(company => {
            const borderColor: Record<string, string> = {
              OPEN: 'var(--border-default)',
              IN_PROGRESS: 'var(--status-warning-border)',
              UNDER_REVIEW: 'var(--interactive-primary)',
              CERTIFIED: 'var(--status-success-border)',
              LOCKED: 'var(--status-success-border)',
            };
            return (
              <div
                key={company.id}
                className="border rounded-xl p-4 cursor-pointer hover:opacity-95 transition-colors"
                style={{
                  background: 'var(--bg-surface)',
                  borderColor: borderColor[company.currentState] ?? 'var(--border-default)',
                }}
                onClick={() => company.currentSessionId && router.push(`/close/${company.currentSessionId}/dashboard`)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{company.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{company.sector} · {company.currentPeriod}</p>
                  </div>
                  <ProgressRing value={company.gatesPassing} max={company.gatesTotal} />
                </div>
                <div className="flex items-center justify-between">
                  <StatusBadge
                    status={
                      company.currentState === 'CERTIFIED' || company.currentState === 'LOCKED'
                        ? 'certified'
                        : company.currentState === 'IN_PROGRESS' || company.currentState === 'UNDER_REVIEW'
                          ? 'in-progress'
                          : 'not-started'
                    }
                    size="sm"
                  />
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{formatMoney(company.revenue)}</span>
                </div>
                {company.blockingIssues > 0 && (
                  <div className="flex items-center gap-1.5 mt-2" style={{ color: 'var(--status-error)' }}>
                    <AlertTriangle className="w-3 h-3" />
                    <span className="text-xs">{company.blockingIssues} blocking issue{company.blockingIssues !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cross-Entity Variance Summary */}
      <div className="border rounded-xl p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <TrendingUp className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          Cross-Entity Variance Summary
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                <th className="text-left px-4 py-2">Entity</th>
                <th className="text-right px-4 py-2">Revenue</th>
                <th className="text-right px-4 py-2">Net Income</th>
                <th className="text-right px-4 py-2">Margin</th>
                <th className="text-right px-4 py-2">vs Prior</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const margin = c.marginPercent ? parseFloat(c.marginPercent) : null;
                const change = c.marginVsPriorPp ? parseFloat(c.marginVsPriorPp) : null;
                return (
                  <tr key={c.id} className="text-sm border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{c.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums"><MoneyCell value={c.revenue} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums"><MoneyCell value={c.netIncome} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span style={{ color: margin != null && margin >= 10 ? 'var(--status-success)' : margin != null && margin >= 0 ? 'var(--status-warning)' : 'var(--status-error)' }}>
                        {margin != null ? `${margin.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {change != null ? (
                        <span className="flex items-center justify-end gap-1" style={{ color: change >= 0 ? 'var(--status-success)' : 'var(--status-error)' }}>
                          {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {change >= 0 ? '+' : ''}{change.toFixed(1)}pp
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
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
