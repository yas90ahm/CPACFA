'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSessions } from '@/lib/queries/sessions';
import { useEntities } from '@/lib/queries/entities';
import { useCreateSession } from '@/lib/queries/close-session';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Skeleton } from '@/components/shared/Skeleton';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { TopBar } from '@/components/shell/TopBar';
import { useAuth } from '@/lib/auth';
import { cn, getUserDisplay } from '@/lib/utils';
import type { SessionListItem } from '@/lib/types/session-list';
import type { CloseState } from '@/lib/types/close-session';
import { Lock, Plus, Search, ChevronUp, ChevronDown, Briefcase } from 'lucide-react';

/* ── Constants & helpers ──────────────────────────────────────────────────── */

const BADGE: Record<CloseState, { variant: 'success' | 'warning' | 'error' | 'info' | 'neutral'; label: string }> = {
  OPEN: { variant: 'neutral', label: 'OPEN' }, IN_PROGRESS: { variant: 'info', label: 'IN PROGRESS' },
  UNDER_REVIEW: { variant: 'warning', label: 'UNDER REVIEW' }, CERTIFIED: { variant: 'success', label: 'CERTIFIED' },
  LOCKED: { variant: 'neutral', label: 'LOCKED' },
};
const STATUS_ORDER: Record<CloseState, number> = { IN_PROGRESS: 0, UNDER_REVIEW: 1, OPEN: 2, CERTIFIED: 3, LOCKED: 4 };

type SortKey = 'period' | 'status' | 'started' | 'duration' | 'preparer' | 'reviewer' | 'gates' | 'issues';
const COLS: { key: SortKey; label: string; center?: boolean }[] = [
  { key: 'period', label: 'Period' }, { key: 'status', label: 'Status' }, { key: 'started', label: 'Started' },
  { key: 'duration', label: 'Duration' }, { key: 'preparer', label: 'Preparer' }, { key: 'reviewer', label: 'Reviewer' },
  { key: 'gates', label: 'Gates' }, { key: 'issues', label: 'Issues', center: true },
];
const STATUSES = ['', 'OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'CERTIFIED', 'LOCKED'];
const STATUS_LABELS: Record<string, string> = { '': 'All Statuses', OPEN: 'Open', IN_PROGRESS: 'In Progress', UNDER_REVIEW: 'Under Review', CERTIFIED: 'Certified', LOCKED: 'Locked' };

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';
}

// Shared class fragments
const INPUT = 'w-full h-10 px-3 text-sm rounded-[var(--radius-md)] bg-[var(--bg-surface-sunken)] border border-[var(--border-default)] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--border-focus)]';
const BTN_PRIMARY = 'inline-flex items-center gap-2 h-10 px-5 text-sm font-semibold text-white rounded-[var(--radius-md)] bg-[var(--interactive-primary)] hover:bg-[var(--interactive-primary-hover)] active:bg-[var(--interactive-primary-pressed)] shadow-sm transition-all duration-150';

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function ClosePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: entities = [], isLoading: entLoad } = useEntities();
  const entityId = !entLoad && entities.length > 0 ? entities[0].id : null;
  const entityName = !entLoad && entities.length > 0 ? entities[0].name : 'My Company';
  const { data: sessions = [], isLoading: sessLoad } = useSessions(entityId);
  const createSession = useCreateSession();

  // Slide-over
  const [open, setOpen] = useState(false);
  const [entSel, setEntSel] = useState('');
  const [pStart, setPStart] = useState(() => { const n = new Date(), p = new Date(n.getFullYear(), n.getMonth() - 1, 1); return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`; });
  const [pEnd, setPEnd] = useState(() => { const n = new Date(), ld = new Date(n.getFullYear(), n.getMonth(), 0).getDate(), p = new Date(n.getFullYear(), n.getMonth() - 1, 1); return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(ld).padStart(2, '0')}`; });

  useEffect(() => { if (entities.length > 0 && !entSel) setEntSel(entities[0].id); }, [entities, entSel]);

  // Search, filter, sort
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('period');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir(k === 'period' || k === 'started' ? 'desc' : 'asc'); } };

  const rows = useMemo(() => {
    let r = [...sessions];
    if (q.trim()) { const lq = q.toLowerCase(); r = r.filter((s) => s.periodLabel.toLowerCase().includes(lq) || s.preparer?.toLowerCase().includes(lq) || s.reviewer?.toLowerCase().includes(lq)); }
    if (statusF) r = r.filter((s) => s.state === statusF);
    const m = sortDir === 'asc' ? 1 : -1;
    r.sort((a, b) => {
      switch (sortKey) {
        case 'period': return m * (new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime());
        case 'status': return m * ((STATUS_ORDER[a.state] ?? 99) - (STATUS_ORDER[b.state] ?? 99));
        case 'started': return m * ((a.startedAt ? new Date(a.startedAt).getTime() : 0) - (b.startedAt ? new Date(b.startedAt).getTime() : 0));
        case 'issues': return m * (a.blockingIssues - b.blockingIssues);
        default: return m * ((a as unknown as Record<string, unknown>)[sortKey] ?? '').toString().localeCompare(((b as unknown as Record<string, unknown>)[sortKey] ?? '').toString());
      }
    });
    return r;
  }, [sessions, q, statusF, sortKey, sortDir]);

  const handleCreate = async () => {
    if (!entSel || !pStart || !pEnd) return;
    setOpen(false);
    try {
      const res = await createSession.mutateAsync({ entityId: entSel, periodStart: pStart, periodEnd: pEnd });
      const id = (res as { id?: string }).id ?? (res as { closeSessionId?: string }).closeSessionId;
      if (id) router.push(`/close/${id}/dashboard?created=1`);
    } catch { /* shown via mutation state */ }
  };

  const inProgress = sessions.find((s) => s.state === 'IN_PROGRESS');
  const canCreate = !!entSel && !!pStart && !!pEnd && !createSession.isPending;
  const loading = entLoad || (entityId && sessLoad);

  return (
    <>
      <TopBar entityName={entityName} showPeriod={false} userName={getUserDisplay(user).displayName} userInitials={getUserDisplay(user).initials} />
      <div className="min-h-screen pt-14" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="max-w-[960px] mx-auto px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Close Periods</h1>
              <p className="text-sm mt-1 text-[var(--text-secondary)]">{entityName}</p>
            </div>
            <button type="button" onClick={() => setOpen(true)} className={BTN_PRIMARY}><Plus className="w-4 h-4" />New Close Period</button>
          </div>

          {/* Search bar */}
          {sessions.length > 0 && (
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[var(--text-tertiary)]" />
                <input type="text" placeholder="Search periods, preparers..." value={q} onChange={(e) => setQ(e.target.value)} className={cn(INPUT, 'pl-9 h-9')} />
              </div>
              <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={cn(INPUT, 'w-auto h-9 cursor-pointer')}>
                {STATUSES.map((v) => <option key={v} value={v}>{STATUS_LABELS[v]}</option>)}
              </select>
            </div>
          )}

          {/* Body */}
          {loading ? (
            <div className="rounded-[var(--radius-lg)] overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-default)]">
              <div className="flex items-center gap-4 h-11 px-4 bg-[var(--bg-surface-sunken)]" style={{ borderBottom: '2px solid var(--border-table-header)' }}>
                {[80, 100, 80, 60, 80, 80, 60, 40].map((w, i) => <Skeleton key={i} className="h-3" style={{ width: w }} />)}
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 h-10 px-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {[120, 90, 100, 50, 80, 80, 70, 30].map((w, j) => <Skeleton key={j} className="h-3" style={{ width: w }} />)}
                </div>
              ))}
            </div>
          ) : rows.length === 0 && sessions.length === 0 ? (
            <div className="rounded-[var(--radius-xl)] py-16 px-8 text-center bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-sm)]">
              <div className="mx-auto mb-6 w-16 h-16 rounded-full flex items-center justify-center bg-[var(--status-info-bg)]">
                <Briefcase className="w-8 h-8 text-[var(--interactive-primary)]" />
              </div>
              <h2 className="font-serif text-xl mb-2 text-[var(--text-primary)]">Start your first month-end close</h2>
              <p className="text-sm mb-6 max-w-lg mx-auto text-[var(--text-secondary)]">
                Upload your general ledger, let Sabit classify your accounts, reconcile balances, post adjustments,
                and generate certified financial statements. Your first close takes about 2 hours — subsequent closes take 20 minutes.
              </p>
              <button type="button" onClick={() => setOpen(true)} className={BTN_PRIMARY}><Plus className="w-4 h-4" />Create Your First Close Period</button>
              <div className="flex items-center justify-center gap-6 mt-8 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>✓ AI classifies 80%+ of accounts automatically</span>
                <span>✓ GL health analysis detects anomalies instantly</span>
                <span>✓ Cryptographic certification for every close</span>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] py-12 px-8 text-center bg-[var(--bg-surface)] border border-[var(--border-default)]">
              <Search className="w-8 h-8 mx-auto mb-3 text-[var(--text-tertiary)]" />
              <p className="text-sm font-medium text-[var(--text-primary)]">No matching periods found</p>
              <p className="text-xs mt-1 text-[var(--text-secondary)]">Try adjusting your search or filter criteria.</p>
            </div>
          ) : (
            <div className="rounded-[var(--radius-lg)] overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-default)]">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="h-11 bg-[var(--bg-surface-sunken)]" style={{ borderBottom: '2px solid var(--border-table-header)' }}>
                    {COLS.map((c) => (
                      <th key={c.key} onClick={() => toggleSort(c.key)} className={cn('px-4 text-[11px] font-semibold uppercase tracking-[0.06em] select-none cursor-pointer hover:text-[var(--text-primary)] transition-colors text-[var(--text-secondary)]', c.center && 'text-center', !c.center && 'text-left')}>
                        <span className="inline-flex items-center gap-1">{c.label}{sortKey === c.key && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => {
                    const hist = s.state === 'CERTIFIED' || s.state === 'LOCKED';
                    const active = inProgress?.id === s.id && s.state === 'IN_PROGRESS';
                    const bg = s.state === 'CERTIFIED' ? 'var(--bg-certified)' : i % 2 ? 'var(--bg-table-row-alt)' : 'var(--bg-surface)';
                    return (
                      <tr key={s.id} role="button" tabIndex={0} onClick={() => router.push(`/close/${s.id}/dashboard`)} onKeyDown={(e) => e.key === 'Enter' && router.push(`/close/${s.id}/dashboard`)}
                        className={cn('h-10 cursor-pointer transition-colors hover:bg-[var(--bg-table-row-hover)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]', hist && 'opacity-85')}
                        style={{ backgroundColor: bg, borderBottom: '1px solid var(--border-subtle)', borderLeft: active ? '4px solid var(--interactive-primary)' : '4px solid transparent' }}>
                        <td className="px-4 font-medium text-[var(--text-primary)]">{s.periodLabel}</td>
                        <td className="px-4"><span className="inline-flex items-center gap-1"><StatusBadge variant={BADGE[s.state].variant} label={BADGE[s.state].label} />{s.state === 'LOCKED' && <Lock className="w-3 h-3 text-[var(--text-tertiary)]" />}</span></td>
                        <td className="px-4 text-[var(--text-secondary)]">{fmtDate(s.startedAt)}</td>
                        <td className="px-4 text-[var(--text-secondary)]">{s.duration ?? '\u2014'}</td>
                        <td className="px-4 text-[var(--text-secondary)]">{s.preparer ?? '\u2014'}</td>
                        <td className="px-4 text-[var(--text-secondary)]">{s.reviewer ?? '\u2014'}</td>
                        <td className="px-4 text-[var(--text-secondary)]">{s.gatesSummary === '9/9' ? 'All met \u2713' : s.gatesSummary}</td>
                        <td className="px-4 text-center">{s.blockingIssues > 0 ? <span className="inline-flex px-1.5 py-0.5 text-xs rounded-[var(--radius-sm)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]">{s.blockingIssues}</span> : '\u2014'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* New Session SlideOver */}
        <SlideOverPanel open={open} onClose={() => setOpen(false)} title="New Close Session" footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className={cn('h-10 px-4 text-sm rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--interactive-ghost-hover)] cursor-pointer transition-colors')}>Cancel</button>
            <button type="button" onClick={handleCreate} disabled={!canCreate} className={cn('h-10 px-4 text-sm font-medium rounded-[var(--radius-md)] transition-colors', canCreate ? 'bg-[var(--interactive-primary)] text-white hover:bg-[var(--interactive-primary-hover)] cursor-pointer' : 'bg-[var(--bg-surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed')}>{createSession.isPending ? 'Creating...' : 'Create Session'}</button>
          </>
        }>
          <div className="flex flex-col gap-6">
            <div>
              <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Entity</label>
              {entLoad ? <div className={cn(INPUT, 'flex items-center text-[var(--text-tertiary)]')}>Loading entities...</div>
                : entities.length === 0 ? <div className={cn(INPUT, 'flex items-center text-[var(--text-tertiary)]')}>No entities found. Create one in Settings first.</div>
                : <select value={entSel} onChange={(e) => setEntSel(e.target.value)} className={INPUT}>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Period Start Date</label>
                <input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--text-secondary)]">Period End Date</label>
                <input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} className={INPUT} />
              </div>
            </div>
            {createSession.isError && <p className="text-sm text-[var(--status-error)]">Failed to create session. Try again.</p>}
          </div>
        </SlideOverPanel>
      </div>
    </>
  );
}
