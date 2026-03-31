'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
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
} from 'lucide-react';
import { useState, useMemo } from 'react';

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
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function CloseSessionsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  const sessionsQuery = useQuery({
    queryKey: ['close-sessions'],
    queryFn: () => apiFetch<SessionsResponse>('/api/close/sessions'),
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
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Top bar */}
      <div className="h-14 bg-[#2C2416] flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-[#B8860B] text-xl font-medium tracking-wide">SABIT</span>
          <span className="text-[#8B7A5E] text-xs">Financial Close Engine</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#3B1F0A] flex items-center justify-center text-[#B8860B] text-xs font-medium">
            YA
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
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
            onClick={() => {
              /* TODO: open new session modal */
            }}
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
                      {session.entityName || '-'}
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
  );
}
