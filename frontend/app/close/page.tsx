'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import {
  Plus,
  ChevronRight,
  Loader2,
  AlertCircle,
  Lock,
  ShieldCheck,
  Clock,
  Eye,
  CircleDot,
  LayoutDashboard,
  FolderClosed,
  Briefcase,
  Settings,
} from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CloseSession {
  id: string;
  state: string;
  periodLabel: string;
  entityName: string;
  gatesPassing: number;
  gatesTotal: number;
  certifiedBy?: string;
  updatedAt: string;
  startedAt?: string;
  createdAt: string;
  closeDayTarget?: number;
}

interface SessionsResponse {
  sessions: CloseSession[];
}

/* ------------------------------------------------------------------ */
/*  Status config                                                      */
/* ------------------------------------------------------------------ */

type SessionState = 'OPEN' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'CERTIFIED' | 'LOCKED';

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  OPEN: { label: 'Open', bg: '#8B7A5E', text: '#FFFFFF', icon: CircleDot },
  IN_PROGRESS: { label: 'In Progress', bg: '#3B6EA5', text: '#FFFFFF', icon: Clock },
  UNDER_REVIEW: { label: 'Under Review', bg: '#8B6914', text: '#FFFFFF', icon: Eye },
  CERTIFIED: { label: 'Certified', bg: '#B8860B', text: '#FFFFFF', icon: ShieldCheck },
  LOCKED: { label: 'Locked', bg: '#5C4F3A', text: '#FFFFFF', icon: Lock },
};

function getStatusConfig(state: string) {
  return STATUS_CONFIG[state] ?? STATUS_CONFIG.OPEN;
}

/* ------------------------------------------------------------------ */
/*  Filter tabs                                                        */
/* ------------------------------------------------------------------ */

type FilterTab = 'ALL' | SessionState;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'UNDER_REVIEW', label: 'Under Review' },
  { key: 'CERTIFIED', label: 'Certified' },
  { key: 'LOCKED', label: 'Locked' },
];

/* ------------------------------------------------------------------ */
/*  Helper: close day elapsed                                          */
/* ------------------------------------------------------------------ */

function closeDayElapsed(session: CloseSession): string {
  const start = session.startedAt ?? session.createdAt;
  if (!start) return '-';
  const days = Math.max(
    1,
    Math.ceil((Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24))
  );
  const target = session.closeDayTarget ?? 10;
  return `${days} / ${target}`;
}

/* ------------------------------------------------------------------ */
/*  Helper: format date                                                */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '-';
  }
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ state }: { state: string }) {
  const cfg = getStatusConfig(state);
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#DDD5C2] rounded ${className}`} />;
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg px-6 py-4 flex items-center gap-6"
        >
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error Banner                                                       */
/* ------------------------------------------------------------------ */

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 flex items-center gap-3">
      <AlertCircle size={18} className="text-[#C44B2B] shrink-0" />
      <div>
        <div className="text-sm font-medium text-[#C44B2B]">Failed to load sessions</div>
        <div className="text-xs text-[#C44B2B]/80 mt-0.5">{message}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

const SIDEBAR_NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '#', disabled: true },
  { label: 'Close Sessions', icon: FolderClosed, href: '/close', active: true },
  { label: 'Portfolio', icon: Briefcase, href: '/portfolio' },
  { label: 'Settings', icon: Settings, href: '/settings/general' },
];

function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 h-screen w-[260px] bg-[#2C2416] flex flex-col z-50">
      {/* Logo */}
      <div className="px-6 pt-6 pb-4">
        <div className="text-[#B8860B] text-xl font-medium tracking-wide">SABIT</div>
        <div className="text-[#8B7A5E] text-xs mt-0.5">Financial Close Engine</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-2 space-y-0.5 overflow-y-auto">
        {SIDEBAR_NAV.map((item) => {
          const Icon = item.icon;
          if (item.disabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-[#5C4F3A]/40 cursor-not-allowed"
              >
                <Icon size={18} />
                {item.label}
              </div>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                item.active
                  ? 'bg-[#3B1F0A] text-[#B8860B]'
                  : 'text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-[#3B1F0A]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#3B1F0A] flex items-center justify-center text-[#B8860B] text-xs font-medium">
            YA
          </div>
          <div>
            <div className="text-sm text-[#B8860B] font-medium">Yasir A.</div>
            <div className="text-xs text-[#8B7A5E]">Controller</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function CloseSessionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newMonth, setNewMonth] = useState('');
  const [newYear, setNewYear] = useState('');
  const [createError, setCreateError] = useState('');

  // Fetch tenant/entity name from settings (not localStorage user name)
  const entityQuery = useQuery({
    queryKey: ['entity-info'],
    queryFn: () => apiFetch<{ name?: string; id?: string; companyName?: string; entityName?: string }>('/api/settings/general'),
  });
  const tenantDisplayName = entityQuery.data?.companyName ?? entityQuery.data?.entityName ?? entityQuery.data?.name ?? 'Your Entity';

  const createMutation = useMutation({
    mutationFn: (body: { periodStart: string; periodEnd: string }) =>
      apiFetch<{ id: string }>('/api/close/sessions', {
        method: 'POST',
        body: { ...body, entityId: 'default' },
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['close-sessions'] });
      setShowNewModal(false);
      router.push(`/close/${data.id}/dashboard`);
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const sessionsQuery = useQuery({
    queryKey: ['close-sessions'],
    queryFn: async () => {
      const raw = await apiFetch<{ sessions: Record<string, unknown>[] }>('/api/close/sessions');
      return {
        sessions: (raw.sessions ?? []).map((s) => ({
          id: String(s.id ?? ''),
          state: String(s.status ?? s.state ?? 'OPEN').toUpperCase().replace(/-/g, '_'),
          periodLabel: String(s.periodLabel ?? `${s.periodStart ?? ''} to ${s.periodEnd ?? ''}`),
          entityName: String(s.entityName ?? s.entityId ?? ''),
          gatesPassing: Number(s.gatesPassing ?? 0),
          gatesTotal: Number(s.gatesTotal ?? 11),
          certifiedBy: s.certifiedBy ? String(s.certifiedBy) : undefined,
          updatedAt: String(s.updatedAt ?? s.createdAt ?? ''),
          startedAt: s.startedAt ? String(s.startedAt) : undefined,
          createdAt: String(s.createdAt ?? ''),
          closeDayTarget: s.closeDayTarget ? Number(s.closeDayTarget) : undefined,
        })) as CloseSession[],
      };
    },
  });

  const sessions = sessionsQuery.data?.sessions ?? [];

  // Counts per state
  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: sessions.length };
    for (const s of sessions) {
      map[s.state] = (map[s.state] ?? 0) + 1;
    }
    return map;
  }, [sessions]);

  // Filtered list
  const filtered = useMemo(() => {
    if (activeTab === 'ALL') return sessions;
    return sessions.filter((s) => s.state === activeTab);
  }, [sessions, activeTab]);

  const isLoading = sessionsQuery.isLoading;
  const error = sessionsQuery.error;

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
          <span className="text-sm text-[#2C2416] font-medium">Close Sessions</span>
        </div>

        {/* Page content */}
        <div className="max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-[#2C2416]">Close Sessions</h1>
            <p className="text-sm text-[#8B7A5E] mt-1">
              Manage your financial close periods across all entities
            </p>
          </div>
          <button
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#B8860B' }}
            onClick={() => setShowNewModal(true)}
          >
            <Plus size={16} />
            New Close
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-[#DDD5C2]">
          {FILTER_TABS.map((tab) => {
            const count = counts[tab.key] ?? 0;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  isActive
                    ? 'border-[#B8860B] text-[#2C2416]'
                    : 'border-transparent text-[#8B7A5E] hover:text-[#5C4F3A] hover:border-[#DDD5C2]'
                }`}
              >
                {tab.label}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-[#B8860B] text-white' : 'bg-[#DDD5C2] text-[#8B7A5E]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Error state */}
        {error && <ErrorBanner message={(error as Error).message} />}

        {/* Loading state */}
        {isLoading && <TableSkeleton />}

        {/* Sessions table */}
        {!isLoading && !error && (
          <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1.2fr_1.2fr_1fr_0.6fr_0.6fr_0.8fr_1fr] gap-4 px-6 py-3 bg-[#2C2416] text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
              <span>Period</span>
              <span>Entity</span>
              <span>Status</span>
              <span>Gates</span>
              <span>Close Day</span>
              <span>Certified By</span>
              <span>Last Activity</span>
            </div>

            {/* Table rows */}
            {filtered.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-[#8B7A5E]">
                No sessions found for this filter.
              </div>
            ) : (
              <div className="divide-y divide-[#DDD5C2]">
                {filtered.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => router.push(`/close/${session.id}/dashboard`)}
                    className="grid grid-cols-[1.2fr_1.2fr_1fr_0.6fr_0.6fr_0.8fr_1fr] gap-4 px-6 py-4 items-center cursor-pointer hover:bg-[#F5F0E8] transition-colors group"
                    role="row"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/close/${session.id}/dashboard`);
                      }
                    }}
                  >
                    {/* Period */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#2C2416]">
                        {session.periodLabel}
                      </span>
                      <ChevronRight
                        size={14}
                        className="text-[#DDD5C2] group-hover:text-[#B8860B] transition-colors"
                      />
                    </div>

                    {/* Entity */}
                    <span className="text-sm text-[#5C4F3A] truncate">
                      {(!session.entityName || session.entityName === 'default' || session.entityName === session.id || /^[0-9a-f-]{20,}$/i.test(session.entityName))
                        ? tenantDisplayName
                        : session.entityName}
                    </span>

                    {/* Status */}
                    <div>
                      <StatusBadge state={session.state} />
                    </div>

                    {/* Gates */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-mono text-[#2C2416]">
                        {session.gatesPassing ?? 0}/{session.gatesTotal ?? 11}
                      </span>
                    </div>

                    {/* Close Day */}
                    <span className="text-sm text-[#8B7A5E]">{closeDayElapsed(session)}</span>

                    {/* Certified By */}
                    <span className="text-sm text-[#8B7A5E] truncate">
                      {session.certifiedBy || '-'}
                    </span>

                    {/* Last Activity */}
                    <span className="text-sm text-[#8B7A5E]">
                      {formatDate(session.updatedAt ?? session.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* New Close Session Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-medium text-[#2C2416] mb-4">Create New Close Session</h3>
            {createError && (
              <div className="mb-4 px-3 py-2 rounded bg-[#F5E4DE] border border-[#C44B2B] text-[#C44B2B] text-sm">
                {createError}
              </div>
            )}
            {/* Entity display */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-[#5C4F3A] uppercase tracking-wider mb-1">Entity</label>
              <div className="px-3 py-2 rounded-md border border-[#DDD5C2] bg-[#DDD5C2]/30 text-[#2C2416] text-sm">
                {tenantDisplayName}
              </div>
              <p className="text-xs text-[#8B7A5E] mt-1">Entity is assigned from your workspace</p>
            </div>
            {/* Month / Year selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#5C4F3A] uppercase tracking-wider mb-1">Month</label>
                <select value={newMonth} onChange={e => setNewMonth(e.target.value)} className="w-full px-3 py-2 rounded-md border border-[#DDD5C2] bg-[#F5F0E8] text-[#2C2416] text-sm focus:outline-none focus:border-[#B8860B]">
                  <option value="">Select month</option>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m,i) => (
                    <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5C4F3A] uppercase tracking-wider mb-1">Year</label>
                <select value={newYear} onChange={e => setNewYear(e.target.value)} className="w-full px-3 py-2 rounded-md border border-[#DDD5C2] bg-[#F5F0E8] text-[#2C2416] text-sm focus:outline-none focus:border-[#B8860B]">
                  <option value="">Select year</option>
                  {[2024,2025,2026,2027].map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowNewModal(false); setCreateError(''); setNewMonth(''); setNewYear(''); }}
                className="px-4 py-2 text-sm font-medium text-[#5C4F3A] border border-[#DDD5C2] rounded-lg hover:bg-[#F5F0E8] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!newMonth || !newYear) {
                    setCreateError('Month and year are required');
                    return;
                  }
                  setCreateError('');
                  const periodStart = `${newYear}-${newMonth}-01`;
                  const lastDay = new Date(Number(newYear), Number(newMonth), 0).getDate();
                  const periodEnd = `${newYear}-${newMonth}-${String(lastDay).padStart(2, '0')}`;
                  createMutation.mutate({ periodStart, periodEnd });
                }}
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-[#F5F0E8] rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#B8860B' }}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Close Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
