'use client';

import { useState, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { usePortfolioCompanies, usePortfolioSummary } from '@/lib/queries/portfolio';
import type { PortfolioCompany } from '@/lib/types/portfolio';
import type { CloseState } from '@/lib/types/close-session';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Lock, AlertTriangle, TrendingDown, TrendingUp, Minus } from 'lucide-react';

const MARGIN_THRESHOLD = 10;
const PERIODS = ['December 2025', 'January 2026', 'February 2026'];

function stateBadge(state: CloseState) {
  const map: Record<CloseState, { cls: string; label: string }> = {
    OPEN: { cls: 'bg-text-muted/20 text-text-secondary', label: 'NOT STARTED' },
    IN_PROGRESS: { cls: 'bg-status-blue-dim text-status-blue', label: 'IN PROGRESS' },
    UNDER_REVIEW: { cls: 'bg-status-amber-dim text-status-amber', label: 'UNDER REVIEW' },
    CERTIFIED: { cls: 'bg-status-green-dim text-status-green', label: 'CERTIFIED' },
    LOCKED: { cls: 'bg-text-muted/20 text-text-secondary', label: 'LOCKED' },
  };
  return map[state];
}

function formatRev(n: string | null): string {
  if (!n) return '—';
  const num = parseFloat(n);
  return new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
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
        return (
          <div
            key={i}
            className={cn('w-1.5 rounded-sm shrink-0', v == null ? 'bg-text-muted/30' : over ? 'bg-status-amber' : atOrUnder ? 'bg-status-green' : 'bg-text-muted')}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

export default function PortfolioPage() {
  const router = useRouter();
  const { data: companies = [] } = usePortfolioCompanies();
  const { data: summary } = usePortfolioSummary();
  const [periodIndex, setPeriodIndex] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const openCompany = (c: PortfolioCompany) => {
    router.push(`/close/${c.currentSessionId}/dashboard`);
  };

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display text-primary">Portfolio Dashboard</h1>
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={() => setPeriodIndex(Math.max(0, periodIndex - 1))} className="p-1.5 rounded-input hover:bg-hover" aria-label="Prior period">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-medium text-primary min-w-[120px] text-center">{PERIODS[periodIndex]}</span>
          <button type="button" onClick={() => setPeriodIndex(Math.min(PERIODS.length - 1, periodIndex + 1))} className="p-1.5 rounded-input hover:bg-hover" aria-label="Next period">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-surface border border-border rounded-card p-4">
          <p className="text-xs font-medium text-text-secondary uppercase">Companies</p>
          <p className="text-2xl font-display text-primary mt-1">{summary?.totalEntities ?? 12}</p>
        </div>
        <div className="bg-surface border border-border rounded-card p-4">
          <p className="text-xs font-medium text-text-secondary uppercase">Closed</p>
          <p className="text-2xl font-display text-status-green mt-1">{summary?.closedThisPeriod ?? 8}</p>
        </div>
        <div className="bg-surface border border-border rounded-card p-4">
          <p className="text-xs font-medium text-text-secondary uppercase">In Progress</p>
          <p className="text-2xl font-display text-accent mt-1">{summary?.inProgress ?? 3}</p>
        </div>
        <div className="bg-surface border border-border rounded-card p-4">
          <p className="text-xs font-medium text-text-secondary uppercase">Not Started</p>
          <p className="text-2xl font-display text-text-muted mt-1">{summary?.notStarted ?? 1}</p>
        </div>
        <div className="bg-surface border border-border rounded-card p-4">
          <p className="text-xs font-medium text-text-secondary uppercase">Attention</p>
          <p className="text-2xl font-display text-status-red mt-1">{summary?.needsAttention ?? 2}</p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-card p-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-primary">
          <span className="text-text-secondary">Current Period:</span> {summary?.currentPeriod ?? 'January 2026'}
        </p>
        <p className="text-sm text-primary">
          <span className="text-text-secondary">Avg Close Duration:</span>{' '}
          <span className="font-mono font-medium">{summary?.avgCloseDays ?? 5.2} days</span>
          <span className="text-text-tertiary ml-1">(vs {(summary?.priorAvgCloseDays ?? 6.8)} prior)</span>
          {avgImproving ? <TrendingDown className="inline w-4 h-4 text-status-green ml-1" /> : <TrendingUp className="inline w-4 h-4 text-status-amber ml-1" />}
        </p>
      </div>

      {attentionCompanies.length > 0 ? (
        <section>
          <h2 className="text-lg font-display text-primary mb-4">Companies Needing Attention ({attentionCompanies.length})</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {attentionCompanies.map((c) => (
              <div
                key={c.id}
                onClick={() => openCompany(c)}
                className={cn(
                  'bg-surface border rounded-card p-5 cursor-pointer hover:border-accent transition-colors',
                  c.daysInClose != null && c.daysInClose > c.targetCloseDays ? 'border-status-red/50 bg-status-red-dim/30' : 'border-status-amber/50 bg-status-amber-dim/30'
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-status-amber shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-primary">{c.name}</p>
                    <p className="text-sm text-text-secondary mt-0.5">
                      {c.currentPeriod} — {c.currentState.replace('_', ' ')} — Day {c.daysInClose ?? '?'} of {c.targetCloseDays}
                      {c.daysInClose != null && c.daysInClose > c.targetCloseDays && ' (OVERDUE)'}
                    </p>
                    {c.blockingIssues > 0 && (
                      <p className="text-sm text-status-red mt-2">{c.blockingIssues} blocking issue{c.blockingIssues !== 1 ? 's' : ''}</p>
                    )}
                    {c.attentionReason === 'Stalled' && (
                      <p className="text-sm text-status-amber mt-2">No activity in 48 hours</p>
                    )}
                    <p className="text-xs text-text-tertiary mt-2">
                      Preparer: {c.preparer ?? '—'} | Last activity: {c.lastActivity ?? '—'}
                    </p>
                    <button type="button" className="mt-3 text-sm text-accent hover:underline">
                      View Details →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="bg-status-green-dim border border-status-green/50 rounded-card p-5 text-status-green text-sm flex items-center gap-2">
          <span>✓</span> All companies on track — no attention needed.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by company name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-input border border-border bg-input px-3 py-2 text-sm w-64"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-input border border-border bg-input px-3 py-2 text-sm">
          <option value="all">All</option>
          <option value="attention">Needs Attention</option>
          <option value="in_progress">In Progress</option>
          <option value="closed">Closed</option>
          <option value="not_started">Not Started</option>
        </select>
      </div>

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt">
                <th className="text-left py-3 px-4 font-medium text-text-secondary">Company</th>
                <th className="text-left py-3 px-4 font-medium text-text-secondary w-[120px]">Period</th>
                <th className="text-left py-3 px-4 font-medium text-text-secondary w-[130px]">Status</th>
                <th className="text-center py-3 px-4 font-medium text-text-secondary w-[100px]">Progress</th>
                <th className="text-right py-3 px-4 font-medium text-text-secondary w-[90px]">Days</th>
                <th className="text-right py-3 px-4 font-medium text-text-secondary w-[80px]">Target</th>
                <th className="text-center py-3 px-4 font-medium text-text-secondary w-[90px]">Issues</th>
                <th className="text-right py-3 px-4 font-medium text-text-secondary w-[120px]">Revenue</th>
                <th className="text-right py-3 px-4 font-medium text-text-secondary w-[120px]">Net Income</th>
                <th className="text-right py-3 px-4 font-medium text-text-secondary w-[80px]">Margin</th>
                <th className="text-center py-3 px-4 font-medium text-text-secondary w-[80px]">Trend</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const badge = stateBadge(c.currentState);
                const isHistorical = c.currentState === 'CERTIFIED' || c.currentState === 'LOCKED';
                const marginPct = c.marginPercent ? parseFloat(c.marginPercent) : null;
                return (
                  <Fragment key={c.id}>
                    <tr
                      key={c.id}
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                      className={cn(
                        'border-b border-border-light hover:bg-hover cursor-pointer',
                        c.needsAttention && 'border-l-4 border-l-status-red',
                        isHistorical && 'opacity-85'
                      )}
                      style={c.needsAttention ? { borderLeftWidth: '4px' } : undefined}
                    >
                      <td className="py-2.5 px-4">
                        <span className={cn('font-medium', c.needsAttention && 'font-semibold')}>{c.name}</span>
                      </td>
                      <td className="py-2.5 px-4">{c.currentPeriod}</td>
                      <td className="py-2.5 px-4">
                        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs', badge.cls)}>
                          {badge.label}
                          {c.currentState === 'LOCKED' && <Lock className="w-3 h-3" />}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-1.5 w-12 bg-elevated rounded-full overflow-hidden">
                            <div className="h-full bg-status-green rounded-full" style={{ width: `${(c.gatesPassing / c.gatesTotal) * 100}%` }} />
                          </div>
                          <span className="font-mono text-xs">{c.gatesPassing}/{c.gatesTotal}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        <span className={c.daysInClose != null && c.daysInClose > c.targetCloseDays ? 'text-status-red' : ''}>{c.daysInClose ?? '—'}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-text-secondary">Day {c.targetCloseDays}</td>
                      <td className="py-2.5 px-4 text-center">
                        {c.blockingIssues > 0 ? (
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-status-red-dim text-status-red text-xs font-mono">{c.blockingIssues}</span>
                        ) : (
                          <span className="text-status-green font-mono">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatRev(c.revenue)}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatRev(c.netIncome)}</td>
                      <td className={cn('py-2.5 px-4 text-right font-mono', marginPct != null && marginPct < MARGIN_THRESHOLD && 'text-status-red', marginPct != null && marginPct >= MARGIN_THRESHOLD && 'text-status-green')}>
                        {formatMargin(c.marginPercent)}
                      </td>
                      <td className="py-2.5 px-4">
                        <Sparkline history={c.closeDurationHistory} target={c.targetCloseDays} />
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr key={`${c.id}-exp`} className="border-b border-border-light bg-surface-alt/50">
                        <td colSpan={11} className="py-4 px-4">
                          <div className="max-w-2xl space-y-3">
                            <p className="text-sm text-primary font-medium">{c.name} — {c.currentPeriod} — {c.currentState.replace('_', ' ')} (Day {c.daysInClose ?? '?'} of {c.targetCloseDays})</p>
                            <p className="text-xs text-text-secondary">
                              Phase: ✓ Ingest ✓ Mapping ● Recon ({c.gatesPassing}/{c.gatesTotal}) ○ AJEs ○ Statements ○ Review
                            </p>
                            {c.blockingIssues > 0 && <p className="text-xs text-status-red">{c.blockingIssues} blocking issue{c.blockingIssues !== 1 ? 's' : ''}</p>}
                            <p className="text-xs text-text-secondary">Preparer: {c.preparer ?? '—'} | Reviewer: {c.reviewer ?? '—'}</p>
                            <button type="button" onClick={(e) => { e.stopPropagation(); openCompany(c); }} className="text-sm text-accent hover:underline">
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
        <h2 className="text-lg font-display text-primary mb-4">Financial Overview — {summary?.currentPeriod ?? 'January 2026'}</h2>
        <div className="bg-surface border border-border rounded-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt">
                <th className="text-left py-3 px-4 font-medium text-text-secondary">Company</th>
                <th className="text-right py-3 px-4 font-medium text-text-secondary">Revenue</th>
                <th className="text-right py-3 px-4 font-medium text-text-secondary">Net Income</th>
                <th className="text-right py-3 px-4 font-medium text-text-secondary">Margin</th>
                <th className="text-right py-3 px-4 font-medium text-text-secondary">vs Prior</th>
              </tr>
            </thead>
            <tbody>
              {companies.filter((c) => c.revenue != null).map((c) => {
                const marginPct = c.marginPercent ? parseFloat(c.marginPercent) : null;
                const vsPrior = c.marginVsPriorPp ? parseFloat(c.marginVsPriorPp) : null;
                return (
                  <tr key={c.id} onClick={() => openCompany(c)} className="border-b border-border-light hover:bg-hover cursor-pointer">
                    <td className="py-2.5 px-4 font-medium">{c.name}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatRev(c.revenue)}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatRev(c.netIncome)}</td>
                    <td className={cn('py-2.5 px-4 text-right font-mono', marginPct != null && marginPct < MARGIN_THRESHOLD && 'text-status-red', marginPct != null && marginPct >= MARGIN_THRESHOLD && 'text-status-green')}>
                      {formatMargin(c.marginPercent)}
                    </td>
                    <td className={cn('py-2.5 px-4 text-right font-mono', vsPrior != null && vsPrior >= 0 && 'text-status-green', vsPrior != null && vsPrior < 0 && 'text-status-red')}>
                      {c.marginVsPriorPp != null ? `${vsPrior! >= 0 ? '+' : ''}${c.marginVsPriorPp}pp` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-alt font-medium">
                <td className="py-3 px-4">Portfolio Total</td>
                <td className="py-3 px-4 text-right font-mono">{summary && formatRev(summary.portfolioRevenue)}</td>
                <td className="py-3 px-4 text-right font-mono">{summary && formatRev(summary.portfolioNetIncome)}</td>
                <td className="py-3 px-4 text-right font-mono">{summary?.portfolioMargin ?? '—'}%</td>
                <td className="py-3 px-4 text-right">+0.4pp</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-display text-primary mb-4">Close Duration Trend (days)</h2>
        <div className="bg-surface border border-border rounded-card p-4 space-y-3">
          {companies.slice(0, 6).map((c) => {
            const vals = c.closeDurationHistory.filter((h): h is number => h != null);
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
            const last = vals[vals.length - 1];
            const improving = vals.length >= 2 && last != null && vals[vals.length - 2] != null && last < vals[vals.length - 2];
            const worsening = vals.length >= 2 && last != null && vals[vals.length - 2] != null && last > vals[vals.length - 2];
            return (
              <div key={c.id} className="flex items-center gap-4">
                <span className="w-48 text-sm truncate">{c.name}</span>
                <Sparkline history={c.closeDurationHistory} target={c.targetCloseDays} />
                <span className="text-xs font-mono text-text-secondary w-32">
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
