'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePortfolioCompanies, usePortfolioSummary, usePortfolioIntegrityReport } from '@/lib/queries/portfolio';
import { cn } from '@/lib/utils';
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
  const color = pct >= 1 ? '#34D399' : pct >= 0.5 ? '#FBBF24' : '#F87171';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={3} stroke="#1e2235" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={3} stroke={color} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <span className="absolute text-[9px] font-semibold text-gray-300 tabular-nums">{value}/{max}</span>
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
        <div className="h-8 w-72 bg-[#1e2235] rounded" />
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-[#141829] rounded-xl" />)}
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
          <h1 className="text-2xl font-semibold text-white tracking-tight">Fund Controller Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {summary?.currentPeriod ?? ''} — {summary?.totalEntities ?? 0} entities across fund
          </p>
        </div>
        <Link href="/portfolio" className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#262C48] text-xs text-gray-400 hover:text-white hover:border-[#7C5CFC]/30 transition-colors">
          <BarChart3 className="w-3.5 h-3.5" /> Portfolio View
        </Link>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Total Entities</p>
          <p className="text-2xl font-semibold text-white tabular-nums">{summary?.totalEntities ?? 0}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Closed</p>
          <p className="text-2xl font-semibold text-emerald-400 tabular-nums">{summary?.closedThisPeriod ?? 0}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">In Progress</p>
          <p className="text-2xl font-semibold text-amber-400 tabular-nums">{summary?.inProgress ?? 0}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Needs Attention</p>
          <p className="text-2xl font-semibold text-red-400 tabular-nums">{summary?.needsAttention ?? 0}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Cross-Entity Issues</p>
          <p className="text-2xl font-semibold text-white tabular-nums">{totalVariances}</p>
        </div>
      </div>

      {/* Consolidation Readiness */}
      <div className={cn(
        'border rounded-xl p-5',
        consolidationReady
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : 'bg-[#141829] border-[#262C48]'
      )}>
        <div className="flex items-center gap-4">
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            consolidationReady ? 'bg-emerald-500/10' : 'bg-amber-500/10'
          )}>
            <Layers className={cn('w-6 h-6', consolidationReady ? 'text-emerald-400' : 'text-amber-400')} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Consolidation Readiness</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {consolidationReady
                ? 'All entities closed — ready to consolidate.'
                : `${summary?.closedThisPeriod ?? 0} of ${summary?.totalEntities ?? 0} entities closed. ${(summary?.totalEntities ?? 0) - (summary?.closedThisPeriod ?? 0)} remaining.`
              }
            </p>
          </div>
          <div className="h-2 w-32 bg-[#1e2235] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${((summary?.closedThisPeriod ?? 0) / Math.max(summary?.totalEntities ?? 1, 1)) * 100}%`,
                background: consolidationReady ? '#34D399' : '#FBBF24',
              }}
            />
          </div>
        </div>
      </div>

      {/* Intercompany Matching Status */}
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <GitMerge className="w-4 h-4 text-[#7C5CFC]" />
          <h2 className="text-sm font-semibold text-white">Intercompany Matching</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center py-3 rounded-lg bg-[#0d1017]">
            <p className="text-lg font-semibold text-emerald-400">0</p>
            <p className="text-[10px] text-gray-500 mt-1">Matched</p>
          </div>
          <div className="text-center py-3 rounded-lg bg-[#0d1017]">
            <p className="text-lg font-semibold text-amber-400">0</p>
            <p className="text-[10px] text-gray-500 mt-1">Pending</p>
          </div>
          <div className="text-center py-3 rounded-lg bg-[#0d1017]">
            <p className="text-lg font-semibold text-red-400">0</p>
            <p className="text-[10px] text-gray-500 mt-1">Mismatched</p>
          </div>
        </div>
        <p className="text-[10px] text-gray-600 mt-3 text-center">Intercompany elimination entries will be generated when all entities are closed.</p>
      </div>

      {/* Entity Status Cards */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-500" />
          Entity Close Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {companies.map(company => {
            const stateColors: Record<string, string> = {
              OPEN: 'border-gray-500/30',
              IN_PROGRESS: 'border-amber-500/30',
              UNDER_REVIEW: 'border-[#7C5CFC]/30',
              CERTIFIED: 'border-emerald-500/30',
              LOCKED: 'border-emerald-500/30',
            };
            return (
              <div
                key={company.id}
                className={cn(
                  'bg-[#141829] border rounded-xl p-4 cursor-pointer hover:bg-[#1a1d2e] transition-colors',
                  stateColors[company.currentState] ?? 'border-[#262C48]'
                )}
                onClick={() => company.currentSessionId && router.push(`/close/${company.currentSessionId}/dashboard`)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{company.name}</p>
                    <p className="text-[10px] text-gray-500">{company.sector} · {company.currentPeriod}</p>
                  </div>
                  <ProgressRing value={company.gatesPassing} max={company.gatesTotal} />
                </div>
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-medium uppercase',
                    company.currentState === 'CERTIFIED' || company.currentState === 'LOCKED'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : company.currentState === 'IN_PROGRESS' || company.currentState === 'UNDER_REVIEW'
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-gray-500/10 text-gray-400'
                  )}>
                    {company.currentState?.replace('_', ' ') ?? 'NOT STARTED'}
                  </span>
                  <span className="text-[10px] text-gray-500 tabular-nums">{formatMoney(company.revenue)}</span>
                </div>
                {company.blockingIssues > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 text-red-400">
                    <AlertTriangle className="w-3 h-3" />
                    <span className="text-[10px]">{company.blockingIssues} blocking issue{company.blockingIssues !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cross-Entity Variance Summary */}
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-500" />
          Cross-Entity Variance Summary
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2">Entity</th>
                <th className="text-right px-4 py-2">Revenue</th>
                <th className="text-right px-4 py-2">Net Income</th>
                <th className="text-right px-4 py-2">Margin</th>
                <th className="text-right px-4 py-2">vs Prior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2235]">
              {companies.map(c => {
                const margin = c.marginPercent ? parseFloat(c.marginPercent) : null;
                const change = c.marginVsPriorPp ? parseFloat(c.marginVsPriorPp) : null;
                return (
                  <tr key={c.id} className="text-sm">
                    <td className="px-4 py-2.5 text-gray-300">{c.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300 tabular-nums">{formatMoney(c.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300 tabular-nums">{formatMoney(c.netIncome)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className={cn(margin != null && margin >= 10 ? 'text-emerald-400' : margin != null && margin >= 0 ? 'text-amber-400' : 'text-red-400')}>
                        {margin != null ? `${margin.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {change != null ? (
                        <span className={cn('flex items-center justify-end gap-1', change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {change >= 0 ? '+' : ''}{change.toFixed(1)}pp
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
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
