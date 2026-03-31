'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  LayoutDashboard,
  FolderClosed,
  Briefcase,
  ScrollText,
  BarChart3,
  Activity,
  Settings,
  ChevronRight,
  ShieldCheck,
  Link2,
  AlertTriangle,
  User,
  Bot,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Gate {
  id: string;
  label: string;
  passing: boolean;
  detail?: string;
}

interface ReadinessResponse {
  gates: Gate[];
  gatesPassing: number;
  gatesTotal: number;
  canAdvance: boolean;
}

interface SessionResponse {
  id: string;
  state: string;
  periodLabel: string;
  entityName: string;
  startedAt: string;
  createdAt: string;
}

interface AuditEvent {
  id: string;
  sequenceNumber?: number;
  eventType: string;
  description?: string;
  actorName?: string;
  actorRole?: string;
  actorId?: string;
  timestamp: string;
  createdAt?: string;
  hash?: string;
  prevHash?: string;
  metadata?: Record<string, unknown>;
}

interface ChainVerification {
  verified: boolean;
  totalEvents: number;
  brokenLinks: number;
  lastVerifiedAt?: string;
}

/* ------------------------------------------------------------------ */
/*  Nav                                                                */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: (sid: string) => `/close/${sid}/dashboard` },
  { label: 'Close Sessions', icon: FolderClosed, href: () => '/close' },
  { label: 'Portfolio', icon: Briefcase, href: () => '/portfolio' },
  { label: 'Audit Trail', icon: ScrollText, href: (sid: string) => `/close/${sid}/audit-trail` },
  { label: 'GL Quality', icon: BarChart3, href: (sid: string) => `/close/${sid}/gl-quality` },
  { label: 'Modules', icon: Activity, href: (sid: string) => `/close/${sid}/modules` },
  { label: 'Settings', icon: Settings, href: () => '/settings/general' },
];

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

function Sidebar({ sessionId }: { sessionId: string }) {
  return (
    <aside className="fixed top-0 left-0 h-screen w-[260px] bg-[#2C2416] flex flex-col z-50">
      <div className="px-6 pt-6 pb-4">
        <div className="text-[#B8860B] text-xl font-medium tracking-wide">SABIT</div>
        <div className="text-[#8B7A5E] text-xs mt-0.5">Financial Close Engine</div>
      </div>
      <nav className="flex-1 px-3 mt-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.label === 'Audit Trail';
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href(sessionId)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
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
/*  Event Type Config                                                  */
/* ------------------------------------------------------------------ */

const EVENT_TYPE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  certification_signed: { color: '#B8860B', bg: '#F5EDD0', label: 'Certification Signed' },
  certification_locked: { color: '#B8860B', bg: '#F5EDD0', label: 'Certification Locked' },
  readiness_check: { color: '#2D6A4F', bg: '#E0EDE8', label: 'Readiness Check' },
  gate_passed: { color: '#2D6A4F', bg: '#E0EDE8', label: 'Gate Passed' },
  gate_failed: { color: '#C44B2B', bg: '#F5E4DE', label: 'Gate Failed' },
  variance_explained: { color: '#2D6A4F', bg: '#E0EDE8', label: 'Variance Explained' },
  ai_justification: { color: '#3B6EA5', bg: '#E0EAF5', label: 'AI Justification' },
  ai_classification: { color: '#3B6EA5', bg: '#E0EAF5', label: 'AI Classification' },
  ai_draft: { color: '#3B6EA5', bg: '#E0EAF5', label: 'AI Draft' },
  journal_entry_posted: { color: '#2D6A4F', bg: '#E0EDE8', label: 'Journal Entry Posted' },
  journal_entry_proposed: { color: '#3B6EA5', bg: '#E0EAF5', label: 'JE Proposed' },
  journal_entry_approved: { color: '#2D6A4F', bg: '#E0EDE8', label: 'JE Approved' },
  journal_entry_rejected: { color: '#C44B2B', bg: '#F5E4DE', label: 'JE Rejected' },
  shadow_audit_check: { color: '#2D6A4F', bg: '#E0EDE8', label: 'Shadow Audit Check' },
  shadow_audit_warning: { color: '#8B6914', bg: '#F0E8D0', label: 'Shadow Audit Warning' },
  override_with_reason: { color: '#8B6914', bg: '#F0E8D0', label: 'Override' },
  session_created: { color: '#3B6EA5', bg: '#E0EAF5', label: 'Session Created' },
  session_advanced: { color: '#2D6A4F', bg: '#E0EDE8', label: 'Session Advanced' },
  reconciliation_completed: { color: '#2D6A4F', bg: '#E0EDE8', label: 'Reconciliation Complete' },
  evidence_uploaded: { color: '#2D6A4F', bg: '#E0EDE8', label: 'Evidence Uploaded' },
  statement_generated: { color: '#2D6A4F', bg: '#E0EDE8', label: 'Statement Generated' },
  mapping_confirmed: { color: '#2D6A4F', bg: '#E0EDE8', label: 'Mapping Confirmed' },
};

function getEventConfig(eventType: string) {
  return (
    EVENT_TYPE_CONFIG[eventType] ?? {
      color: '#5C4F3A',
      bg: '#EDE6D6',
      label: eventType
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Humanize helpers                                                   */
/* ------------------------------------------------------------------ */

function humanizeActor(event: AuditEvent): string {
  if (event.actorName) {
    return event.actorRole
      ? `${event.actorName} (${event.actorRole})`
      : event.actorName;
  }
  if (event.actorId) {
    if (event.actorId === 'system' || event.actorId === 'sabit') return 'Sabit Engine';
    return event.actorId;
  }
  return 'System';
}

function isAIActor(event: AuditEvent): boolean {
  const type = event.eventType;
  const actor = (event.actorId || '').toLowerCase();
  return (
    type.startsWith('ai_') ||
    actor === 'system' ||
    actor === 'sabit' ||
    type.includes('shadow_audit')
  );
}

function truncateHash(hash?: string): string {
  if (!hash) return '';
  const clean = hash.replace(/^sha256:/, '');
  return clean.slice(0, 16) + '...';
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  );
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs !== 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  count,
  color,
  bgColor,
}: {
  label: string;
  count: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
      <div className="text-xs text-[#8B7A5E] font-medium uppercase tracking-wider mb-2">{label}</div>
      <div className="text-2xl font-medium font-mono" style={{ color }}>
        {count}
      </div>
      <div
        className="mt-2 h-1 rounded-full"
        style={{ backgroundColor: bgColor, opacity: count > 0 ? 1 : 0.3 }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Event Row                                                          */
/* ------------------------------------------------------------------ */

function EventRow({ event, isLast }: { event: AuditEvent; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = getEventConfig(event.eventType);
  const actor = humanizeActor(event);
  const isAI = isAIActor(event);
  const ts = event.timestamp || event.createdAt || '';

  return (
    <div>
      <div
        className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg px-5 py-4 cursor-pointer hover:border-[#C8BEA8] transition-colors"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            {/* Sequence number */}
            <span className="text-xs font-mono text-[#8B7A5E] pt-0.5 shrink-0">
              #{event.sequenceNumber ?? event.id}
            </span>

            {/* Event type badge */}
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded uppercase tracking-wider shrink-0"
              style={{ color: config.color, backgroundColor: config.bg }}
            >
              {config.label}
            </span>

            {/* Description */}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#2C2416] leading-relaxed">
                {event.description ||
                  config.label}
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs text-[#8B7A5E]">{ts ? formatTimestamp(ts) : ''}</span>
                <span className="inline-flex items-center gap-1 text-xs text-[#8B7A5E]">
                  {isAI ? <Bot size={11} /> : <User size={11} />}
                  {actor}
                </span>
              </div>
            </div>
          </div>

          {/* Expand toggle */}
          <div className="shrink-0 pt-1">
            {expanded ? (
              <ChevronUp size={14} className="text-[#8B7A5E]" />
            ) : (
              <ChevronDown size={14} className="text-[#8B7A5E]" />
            )}
          </div>
        </div>

        {/* Expanded hash chain */}
        {expanded && (event.hash || event.prevHash) && (
          <div className="mt-4 pt-3 border-t border-[#DDD5C2]">
            <div className="flex flex-col gap-1.5">
              {event.hash && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E] w-12">
                    Hash
                  </span>
                  <code className="text-[11px] font-mono text-[#B8860B]">
                    sha256:{truncateHash(event.hash)}
                  </code>
                </div>
              )}
              {event.prevHash && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[#8B7A5E] w-12">
                    Prev
                  </span>
                  <code className="text-[11px] font-mono text-[#B8860B]">
                    sha256:{truncateHash(event.prevHash)}
                  </code>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chain link between events */}
      {!isLast && (
        <div className="flex justify-center py-1">
          <Link2 size={12} className="text-[#DDD5C2]" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#DDD5C2] rounded ${className}`} />;
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-72 mb-2" />
      <Skeleton className="h-14 w-full" />
      <div className="grid grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4 h-24" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5 h-20" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AuditTrailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const PAGE_SIZE = 50;
  const [allEvents, setAllEvents] = useState<AuditEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  /* --- Data fetching --- */

  const sessionQuery = useQuery({
    queryKey: ['close-session', sessionId],
    queryFn: () => apiFetch<SessionResponse>(`/api/close/sessions/${sessionId}`),
    enabled: !!sessionId,
  });

  const readinessQuery = useQuery({
    queryKey: ['readiness', sessionId],
    queryFn: () => apiFetch<ReadinessResponse>(`/api/close/sessions/${sessionId}/readiness`, { params: { format: 'gates' } }),
    enabled: !!sessionId,
  });

  const fetchEvents = useCallback(async (currentOffset: number): Promise<AuditEvent[]> => {
    try {
      const data = await apiFetch<AuditEvent[] | { events?: AuditEvent[]; auditEvents?: AuditEvent[] }>(
        `/api/close/sessions/${sessionId}/audit-events`,
        { params: { limit: String(PAGE_SIZE), offset: String(currentOffset) } }
      );
      if (Array.isArray(data)) return data;
      return data.events ?? data.auditEvents ?? [];
    } catch {
      try {
        const data = await apiFetch<AuditEvent[] | { events?: AuditEvent[] }>(
          '/api/verification/audit-chain',
          { params: { sessionId } }
        );
        if (Array.isArray(data)) return data;
        return data.events ?? [];
      } catch {
        return [];
      }
    }
  }, [sessionId]);

  const eventsQuery = useQuery({
    queryKey: ['audit-events', sessionId],
    queryFn: async () => {
      const batch = await fetchEvents(0);
      setAllEvents(batch);
      setOffset(batch.length);
      setHasMore(batch.length >= PAGE_SIZE);
      return batch;
    },
    enabled: !!sessionId,
  });

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const batch = await fetchEvents(offset);
      setAllEvents((prev) => [...prev, ...batch]);
      setOffset((prev) => prev + batch.length);
      if (batch.length < PAGE_SIZE) setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [offset, fetchEvents]);

  const chainQuery = useQuery({
    queryKey: ['chain-verification', sessionId],
    queryFn: async () => {
      try {
        const data = await apiFetch<ChainVerification>(
          '/api/verification/audit-chain',
          { params: { sessionId, verify: 'true' } }
        );
        return data;
      } catch {
        return null;
      }
    },
    enabled: !!sessionId,
  });

  /* --- Derived state --- */

  const session = sessionQuery.data;
  const events = allEvents.length > 0 ? allEvents : (eventsQuery.data ?? []);
  const chain = chainQuery.data;

  const totalEvents = chain?.totalEvents ?? events.length;
  const brokenLinks = chain?.brokenLinks ?? 0;
  const isVerified = chain?.verified ?? (events.length > 0 && brokenLinks === 0);

  // Categorize events
  const materialEvents = events.filter((e) =>
    ['certification_signed', 'certification_locked', 'gate_passed', 'gate_failed', 'session_advanced', 'journal_entry_posted', 'override_with_reason'].includes(e.eventType)
  );
  const overrideEvents = events.filter((e) => e.eventType === 'override_with_reason');
  const aiEvents = events.filter((e) => isAIActor(e));
  const humanEvents = events.filter((e) => !isAIActor(e));

  const isLoading = sessionQuery.isLoading || eventsQuery.isLoading;
  const error = sessionQuery.error || eventsQuery.error;

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      <Sidebar sessionId={sessionId} />

      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/close" className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
              Dashboard
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <Link
              href={`/close/${sessionId}/dashboard`}
              className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors"
            >
              {session?.periodLabel || 'Close Session'}
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <span className="text-[#2C2416] font-medium">Audit Trail</span>
          </div>
        </div>

        {/* Progress Rail */}
        {(() => {
          const _gates = readinessQuery.data?.gates ?? [];
          const _gatesTotal = readinessQuery.data?.gatesTotal ?? _gates.length;
          const _activeGateIndex = _gates.findIndex((g) => !g.passing);
          const _activeGateNum = _activeGateIndex >= 0 ? _activeGateIndex + 1 : _gatesTotal;
          const _startedAt = session?.startedAt ?? session?.createdAt ?? new Date().toISOString();
          const _dayElapsed = Math.max(1, Math.ceil((Date.now() - new Date(_startedAt).getTime()) / (1000 * 60 * 60 * 24)));
          const _targetDays = 10;
          const _sessionState = (session?.state ?? 'IN_PROGRESS').replace(/_/g, ' ');
          return _gates.length > 0 ? (
            <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-[#B8860B] font-medium">
                  Gate {_activeGateNum} of {_gatesTotal}
                </span>
                <span className="text-[#8B7A5E]">
                  Close Day {_dayElapsed} of {_targetDays}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#3B1F0A] text-[#B8860B]">
                  {_sessionState}
                </span>
                {session?.periodLabel && <span className="text-[#8B7A5E]">{session.periodLabel}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                {_gates.map((gate, i) => {
                  let bg = '#5C4F3A';
                  if (gate.passing) bg = '#2D6A4F';
                  else if (i === _activeGateIndex) bg = '#B8860B';
                  return (
                    <div
                      key={gate.id}
                      className="w-2.5 h-2.5 rounded-full transition-colors"
                      style={{ backgroundColor: bg }}
                      title={`${gate.label}: ${gate.passing ? 'Passing' : 'Pending'}`}
                    />
                  );
                })}
              </div>
            </div>
          ) : null;
        })()}

        {/* Page body */}
        <main className="flex-1 px-6 py-6">
          {error && (
            <div className="bg-[#F5E4DE] border border-[#C44B2B]/20 rounded-lg p-4 flex items-center gap-3 mb-6">
              <AlertTriangle size={18} className="text-[#C44B2B] shrink-0" />
              <div className="text-sm text-[#C44B2B]">{(error as Error).message}</div>
            </div>
          )}

          {isLoading ? (
            <PageSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Title */}
              <div>
                <h1 className="text-lg font-medium text-[#2C2416]">
                  Tamper-Evident Audit Ledger
                </h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  Every action is cryptographically chained. Each record hashes the previous,
                  forming an immutable, verifiable sequence.
                </p>
              </div>

              {/* Verification Banner */}
              {isVerified ? (
                <div className="bg-[#E0EDE8] border border-[#2D6A4F]/15 rounded-lg px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={18} className="text-[#2D6A4F]" />
                    <span className="text-sm font-medium text-[#2D6A4F]">
                      CHAIN INTEGRITY VERIFIED
                    </span>
                    <span className="text-xs text-[#2D6A4F]/70">
                      {totalEvents} events · {brokenLinks} broken links
                    </span>
                  </div>
                  {chain?.lastVerifiedAt && (
                    <span className="text-xs text-[#2D6A4F]/70">
                      Last verified: {timeAgo(chain.lastVerifiedAt)}
                    </span>
                  )}
                </div>
              ) : events.length > 0 ? (
                <div className="bg-[#F0E8D0] border border-[#8B6914]/15 rounded-lg px-5 py-3 flex items-center gap-3">
                  <AlertTriangle size={18} className="text-[#8B6914]" />
                  <span className="text-sm font-medium text-[#8B6914]">
                    CHAIN VERIFICATION PENDING
                  </span>
                  <span className="text-xs text-[#8B6914]/70">
                    {totalEvents} events · {brokenLinks} broken link{brokenLinks !== 1 ? 's' : ''} detected
                  </span>
                </div>
              ) : null}

              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard
                  label="Total Events"
                  count={totalEvents}
                  color="#2C2416"
                  bgColor="#DDD5C2"
                />
                <StatCard
                  label="Material Events"
                  count={materialEvents.length}
                  color="#2C2416"
                  bgColor="#DDD5C2"
                />
                <StatCard
                  label="Overrides"
                  count={overrideEvents.length}
                  color="#8B6914"
                  bgColor="#F0E8D0"
                />
                <StatCard
                  label="AI Actions"
                  count={aiEvents.length}
                  color="#3B6EA5"
                  bgColor="#E0EAF5"
                />
                <StatCard
                  label="Human Actions"
                  count={humanEvents.length}
                  color="#2C2416"
                  bgColor="#DDD5C2"
                />
              </div>

              {/* Event list */}
              {events.length === 0 ? (
                <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-8 text-center">
                  <ScrollText size={24} className="text-[#8B7A5E] mx-auto mb-3" />
                  <p className="text-sm text-[#5C4F3A]">
                    No audit events recorded for this close session yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-0">
                  {events.map((event, i) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      isLast={i === events.length - 1}
                    />
                  ))}
                </div>
              )}

              {/* Load more */}
              {hasMore && events.length > 0 && (
                <div className="flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 text-xs font-medium rounded border border-[#DDD5C2] text-[#5C4F3A] hover:bg-[#EDE6D6] transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading...' : 'Load more events'}
                  </button>
                </div>
              )}

              {/* Tamper Detection Notice */}
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg px-5 py-4">
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-[#8B7A5E] mb-2">
                  Tamper Detection
                </h3>
                <p className="text-xs text-[#5C4F3A] leading-relaxed">
                  This audit ledger uses SHA-256 hash chaining. Each event record includes the hash
                  of the previous record, creating a tamper-evident chain. If any record is modified
                  or deleted, the chain breaks and the integrity check fails. This is the same
                  principle used in blockchain technology but applied to a traditional database for
                  auditability without the overhead of distributed consensus.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
