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

function ScoreGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? { r: 44, w: 104, stroke: 6, text: 'text-3xl' } : size === 'md' ? { r: 28, w: 68, stroke: 4, text: 'text-xl' } : { r: 18, w: 44, stroke: 3, text: 'text-sm' };
  const circumference = 2 * Math.PI * dims.r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 90 ? '#34D399' : score >= 70 ? '#FBBF24' : '#F87171';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: dims.w, height: dims.w }}>
      <svg className="transform -rotate-90" width={dims.w} height={dims.w}>
        <circle cx={dims.w / 2} cy={dims.w / 2} r={dims.r} strokeWidth={dims.stroke} stroke="#1e2235" fill="none" />
        <circle cx={dims.w / 2} cy={dims.w / 2} r={dims.r} strokeWidth={dims.stroke} stroke={color} fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-1000" />
      </svg>
      <span className={cn('absolute font-semibold tabular-nums', dims.text, score >= 90 ? 'text-emerald-400' : score >= 70 ? 'text-amber-400' : 'text-red-400')}>{score}</span>
    </div>
  );
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <span className="text-[10px] text-gray-600">—</span>;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const w = nums.length * 12;
  const h = 20;
  const points = nums.map((v, i) => `${(i / (nums.length - 1)) * (w - 4) + 2},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  const last = nums[nums.length - 1];
  const color = last > nums[0] ? '#34D399' : last < nums[0] ? '#F87171' : '#9CA3AF';

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
        <div className="h-8 w-64 bg-[#1e2235] rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[#141829] rounded-xl" />)}
        </div>
        <div className="h-80 bg-[#141829] rounded-xl" />
      </div>
    );
  }

  const overallScore = integrityReport?.overallScore ?? 0;

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Portfolio Command Center</h1>
        <p className="text-sm text-gray-500 mt-1">{summary?.currentPeriod ?? ''} — {summary?.totalEntities ?? 0} entities</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Integrity Score */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5 flex items-center gap-5">
          <ScoreGauge score={overallScore} size="md" />
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Integrity Score</p>
            <p className={cn('text-lg font-semibold', overallScore >= 90 ? 'text-emerald-400' : overallScore >= 70 ? 'text-amber-400' : 'text-red-400')}>
              {overallScore >= 90 ? 'Excellent' : overallScore >= 70 ? 'Good' : 'Needs Attention'}
            </p>
          </div>
        </div>

        {/* Entities Status */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Close Status</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-semibold text-emerald-400 tabular-nums">{summary?.closedThisPeriod ?? 0}</span>
            <span className="text-sm text-gray-500 mb-0.5">/ {summary?.totalEntities ?? 0} closed</span>
          </div>
          <div className="flex gap-2 mt-3">
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">{summary?.inProgress ?? 0} in progress</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-gray-500/10 text-gray-400">{summary?.notStarted ?? 0} not started</span>
          </div>
        </div>

        {/* Revenue */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Portfolio Revenue</p>
          <p className="text-2xl font-semibold text-white tabular-nums">{formatMoney(summary?.portfolioRevenue)}</p>
          <p className="text-xs text-gray-600 mt-2">Margin: {summary?.portfolioMargin ?? '0'}%</p>
        </div>

        {/* Avg Close Days */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Avg Close Duration</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-semibold text-white tabular-nums">{summary?.avgCloseDays ?? 0}</span>
            <span className="text-sm text-gray-500 mb-0.5">days</span>
          </div>
          {summary?.priorAvgCloseDays != null && summary.priorAvgCloseDays > 0 && (
            <p className={cn('text-xs mt-2', (summary?.avgCloseDays ?? 0) < summary.priorAvgCloseDays ? 'text-emerald-400' : 'text-amber-400')}>
              {(summary?.avgCloseDays ?? 0) < summary.priorAvgCloseDays ? 'Improved' : 'Slower'} vs prior ({summary.priorAvgCloseDays}d)
            </p>
          )}
        </div>
      </div>

      {/* Pick up the phone alert */}
      {alertEntities.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-400">
                {alertEntities.length} entit{alertEntities.length === 1 ? 'y' : 'ies'} below integrity threshold
              </p>
              <p className="text-xs text-gray-400 mt-1">These require immediate attention from the operating team.</p>
              <div className="mt-3 space-y-2">
                {alertEntities.map(e => (
                  <div key={e.entityId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-500/5">
                    <ScoreGauge score={e.overallScore} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-medium">{e.entityName}</p>
                      {e.issues && e.issues.length > 0 && (
                        <p className="text-[10px] text-gray-500 truncate">{e.issues.join(' · ')}</p>
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
      <div className="bg-[#141829] border border-[#262C48] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1e2235]">
          <h2 className="text-sm font-semibold text-white">Entity Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
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
            <tbody className="divide-y divide-[#1e2235]">
              {sortedCompanies.map(company => {
                const margin = company.marginPercent ? parseFloat(company.marginPercent) : null;
                const stateColors: Record<string, string> = {
                  OPEN: 'bg-gray-500/10 text-gray-400',
                  IN_PROGRESS: 'bg-amber-500/10 text-amber-400',
                  UNDER_REVIEW: 'bg-[#7C5CFC]/10 text-[#7C5CFC]',
                  CERTIFIED: 'bg-emerald-500/10 text-emerald-400',
                  LOCKED: 'bg-gray-500/10 text-gray-400',
                };
                return (
                  <tr
                    key={company.id}
                    className="hover:bg-[#1a1d2e] transition-colors cursor-pointer"
                    onClick={() => {
                      if (company.currentSessionId) {
                        router.push(`/close/${company.currentSessionId}/dashboard`);
                      }
                    }}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {company.needsAttention && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        <span className="text-sm text-white font-medium">{company.name}</span>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5">{company.sector}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium uppercase', stateColors[company.currentState] ?? 'bg-gray-500/10 text-gray-400')}>
                        {company.currentState?.replace('_', ' ') ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-300 tabular-nums">{formatMoney(company.revenue)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-300 tabular-nums">{formatMoney(company.netIncome)}</td>
                    <td className="px-4 py-3 text-right">
                      {margin != null ? (
                        <span className={cn('text-sm tabular-nums', margin >= 10 ? 'text-emerald-400' : margin >= 0 ? 'text-amber-400' : 'text-red-400')}>
                          {margin.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-sm text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-400 tabular-nums">{company.gatesPassing}/{company.gatesTotal}</span>
                    </td>
                    <td className="px-4 py-3 flex justify-center">
                      <Sparkline values={company.closeDurationHistory} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {company.blockingIssues > 0 ? (
                        <span className="text-xs text-red-400 font-semibold tabular-nums">{company.blockingIssues}</span>
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500/50 mx-auto" />
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
