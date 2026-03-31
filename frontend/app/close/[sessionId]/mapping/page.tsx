'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  Sparkles,
  PenLine,
  ArrowUpDown,
  Zap,
  X,
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

interface TBRow {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  reportingCategory?: string;
}

interface TBResponse {
  rows: TBRow[];
}

interface MappingRule {
  id: string;
  accountCode: string;
  accountName?: string;
  fsLineItem?: string;
  reportingLineItem?: string;
  lineItemLabel?: string;
  source?: string;
  confidence?: number;
  status?: string;
  confirmed?: boolean;
  overridden?: boolean;
  reviewedBy?: string;
  autoAccepted?: boolean;
}

interface MappingSuggestion {
  accountCode: string;
  suggestedLineItem?: string;
  fsLineItem?: string;
  source?: string;
  confidence?: number;
}

/* ------------------------------------------------------------------ */
/*  Nav items config                                                   */
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
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href(sessionId)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50"
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
/*  Progress Rail                                                      */
/* ------------------------------------------------------------------ */

function ProgressRail({
  gates,
  gatesPassing,
  gatesTotal,
  totalAccounts,
  allMapped,
}: {
  gates: Gate[];
  gatesPassing: number;
  gatesTotal: number;
  totalAccounts: number;
  allMapped: boolean;
}) {
  const activeGateIndex = gates.findIndex((g) => !g.passing);

  return (
    <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#B8860B] font-medium">
          Gate 2–3 of {gatesTotal}
        </span>
        <span className="text-[#8B7A5E]">
          Account Mapping
        </span>
        <span className="text-[#8B7A5E]">
          {totalAccounts} accounts
        </span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            allMapped
              ? 'bg-[#1B3D2F] text-[#2D6A4F]'
              : 'bg-[#3B1F0A] text-[#B8860B]'
          }`}
        >
          {allMapped ? 'ALL MAPPED' : 'IN PROGRESS'}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {gates.map((gate, i) => {
          let bg = '#5C4F3A';
          if (gate.passing) bg = '#2D6A4F';
          else if (i === activeGateIndex) bg = '#B8860B';
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
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
      <div className="text-xs text-[#8B7A5E] font-medium mb-1">{label}</div>
      <div
        className="text-2xl font-medium font-mono"
        style={{ color: accent ?? '#2C2416' }}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-[#8B7A5E] mt-1">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Confidence Bar                                                     */
/* ------------------------------------------------------------------ */

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.max(0, Math.min(100, confidence));
  let color = '#2D6A4F'; // forest green > 90
  if (pct < 70) color = '#C44B2B'; // rust < 70
  else if (pct < 90) color = '#8B6914'; // amber 70-90

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-[#DDD5C2] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Source Badge                                                        */
/* ------------------------------------------------------------------ */

function SourceBadge({ source }: { source?: string }) {
  const s = (source ?? '').toLowerCase();
  const isAI = s.includes('ai') || s.includes('pattern') || s.includes('xbrl') || s.includes('claude') || s.includes('rag');

  if (isAI) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#E0EAF5] text-[#3B6EA5]">
        <Sparkles size={12} />
        {source || 'AI'}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#F0E8D0] text-[#8B6914]">
      <PenLine size={12} />
      {source || 'Manual'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status, confidence }: { status: string; confidence?: number }) {
  const s = status.toLowerCase();
  if (s === 'confirmed' || s === 'mapped') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#E0EDE8] text-[#2D6A4F]">
        <CheckCircle2 size={12} />
        Confirmed
      </span>
    );
  }
  if (s === 'recommended' || s === 'auto_recommended' || s === 'auto-accepted') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#E0EAF5] text-[#3B6EA5] cursor-help"
        title={`Sabit AI recommends this mapping at ${confidence ?? 0}% confidence. Click to confirm.`}
      >
        <Zap size={12} />
        Recommended
      </span>
    );
  }
  if (s === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#F5E4DE] text-[#C44B2B]">
        <X size={12} />
        Rejected
      </span>
    );
  }
  if (s === 'override' || s === 'overridden') {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#F0E8D0] text-[#8B6914]">
        Override
      </span>
    );
  }
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#DDD5C2] text-[#8B7A5E]">
      {status}
    </span>
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
      <div>
        <Skeleton className="h-7 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg h-96" />
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
        <div className="text-sm font-medium text-[#C44B2B]">Failed to load mapping data</div>
        <div className="text-xs text-[#C44B2B]/80 mt-0.5">{message}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function AccountMappingPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  /* --- Data fetching --- */

  const readinessQuery = useQuery({
    queryKey: ['close-readiness', sessionId],
    queryFn: () =>
      apiFetch<ReadinessResponse>(`/api/close/sessions/${sessionId}/readiness`, {
        params: { format: 'gates' },
      }),
    enabled: !!sessionId,
  });

  const tbQuery = useQuery({
    queryKey: ['trial-balance', sessionId, 'adjusted'],
    queryFn: () =>
      apiFetch<TBResponse>(`/api/close/sessions/${sessionId}/trial-balance`, {
        params: { type: 'adjusted' },
      }),
    enabled: !!sessionId,
  });

  const rulesQuery = useQuery({
    queryKey: ['coa-mapping-rules', sessionId],
    queryFn: async () => {
      const data = await apiFetch<MappingRule[] | { rules?: MappingRule[] }>(
        `/api/coa-mapping/rules`,
        { params: { closeSessionId: sessionId } }
      );
      return Array.isArray(data) ? data : data.rules ?? [];
    },
    enabled: !!sessionId,
  });

  const suggestionsQuery = useQuery({
    queryKey: ['coa-mapping-suggestions', sessionId],
    queryFn: async () => {
      try {
        const data = await apiFetch<MappingSuggestion[] | { suggestions?: MappingSuggestion[] }>(
          `/api/coa-mapping/suggestions`,
          { params: { closeSessionId: sessionId } }
        );
        return Array.isArray(data) ? data : data.suggestions ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!sessionId,
  });

  /* --- Derived state --- */

  const gates = readinessQuery.data?.gates ?? [];
  const gatesPassing = readinessQuery.data?.gatesPassing ?? 0;
  const gatesTotal = readinessQuery.data?.gatesTotal ?? 0;
  const tbRows = tbQuery.data?.rows ?? [];
  const rules = rulesQuery.data ?? [];
  const suggestions = suggestionsQuery.data ?? [];

  // Build a lookup: accountCode -> rule
  const ruleMap = new Map<string, MappingRule>();
  for (const rule of rules) {
    ruleMap.set(rule.accountCode, rule);
  }

  // Build a lookup: accountCode -> suggestion
  const suggestionMap = new Map<string, MappingSuggestion>();
  for (const sug of suggestions) {
    suggestionMap.set(sug.accountCode, sug);
  }

  // Merge TB rows with mapping data
  const mergedAccounts = tbRows.map((row) => {
    const rule = ruleMap.get(row.accountCode);
    const sug = suggestionMap.get(row.accountCode);

    const fsLineItem =
      rule?.fsLineItem ??
      rule?.reportingLineItem ??
      rule?.lineItemLabel ??
      sug?.suggestedLineItem ??
      sug?.fsLineItem ??
      row.reportingCategory ??
      'Unmapped';

    const source = rule?.source ?? sug?.source ?? (rule ? 'Manual' : '');
    const confidence = rule?.confidence ?? sug?.confidence ?? 0;
    const isAISource = ((source ?? '').toLowerCase().match(/ai|pattern|xbrl|claude|rag/) !== null);
    const hasReviewer = !!(rule?.reviewedBy);
    const isExplicitAutoAccepted = rule?.autoAccepted === true;

    // Derive status:
    // 1. "Override" — human manually overrode AI suggestion (source is Manual, or overridden flag)
    // 2. "Confirmed" — human explicitly clicked confirm (AI source + reviewer, or confirmed flag)
    // 3. "Recommended" — AI recommends this mapping, awaiting human confirmation
    // 4. "Rejected" — human rejected the AI recommendation
    let status: string;
    if (rule?.status === 'rejected') {
      status = 'Rejected';
    } else if (rule?.overridden || (source ?? '').toLowerCase() === 'manual') {
      status = fsLineItem !== 'Unmapped' ? 'Override' : 'Pending';
    } else if (rule?.status === 'auto_recommended' || isExplicitAutoAccepted || (isAISource && !hasReviewer && !rule?.confirmed && rule?.status !== 'confirmed')) {
      status = fsLineItem !== 'Unmapped' ? 'Recommended' : 'Pending';
    } else if (rule?.confirmed || rule?.status === 'confirmed' || rule?.status === 'mapped' || (isAISource && hasReviewer)) {
      status = 'Confirmed';
    } else if (fsLineItem !== 'Unmapped') {
      status = 'Recommended';
    } else {
      status = 'Pending';
    }

    return {
      accountCode: row.accountCode,
      accountName: row.accountName,
      fsLineItem,
      source,
      confidence,
      status,
      ruleId: rule?.id,
    };
  });

  // Stats
  const totalAccounts = mergedAccounts.length;
  const aiMapped = mergedAccounts.filter((a) => {
    const s = (a.source ?? '').toLowerCase();
    return s.includes('ai') || s.includes('pattern') || s.includes('xbrl') || s.includes('claude') || s.includes('rag');
  }).length;
  const recommended = mergedAccounts.filter((a) => a.status === 'Recommended').length;
  const manualOverrides = mergedAccounts.filter((a) => a.status === 'Override').length;
  const avgConfidence =
    totalAccounts > 0
      ? Math.round(mergedAccounts.reduce((sum, a) => sum + (a.confidence || 0), 0) / totalAccounts)
      : 0;
  const unmapped = mergedAccounts.filter((a) => a.fsLineItem === 'Unmapped').length;
  const allMapped = unmapped === 0 && totalAccounts > 0;

  const isLoading = tbQuery.isLoading || rulesQuery.isLoading;
  const error = tbQuery.error || rulesQuery.error;

  /* --- Confirm / Reject handlers --- */
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const handleConfirmAll = useCallback(async () => {
    const recommendedItems = mergedAccounts.filter((a) => a.status === 'Recommended');
    if (recommendedItems.length === 0) return;
    setConfirming(true);
    try {
      await Promise.all(
        recommendedItems.map((item) =>
          apiFetch('/api/coa-mapping/rules', {
            method: 'POST',
            body: {
              closeSessionId: sessionId,
              accountCode: item.accountCode,
              fsLineItem: item.fsLineItem,
              status: 'confirmed',
              confirmed: true,
            },
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: ['coa-mapping-rules', sessionId] });
    } catch (err) {
      console.error('Failed to confirm recommended mappings:', err);
    } finally {
      setConfirming(false);
    }
  }, [mergedAccounts, sessionId, queryClient]);

  const handleReject = useCallback(
    async (accountCode: string) => {
      try {
        await apiFetch('/api/coa-mapping/rules', {
          method: 'POST',
          body: {
            closeSessionId: sessionId,
            accountCode,
            status: 'rejected',
          },
        });
        queryClient.invalidateQueries({ queryKey: ['coa-mapping-rules', sessionId] });
      } catch (err) {
        console.error('Failed to reject mapping:', err);
      }
    },
    [sessionId, queryClient]
  );

  /* --- Search / filter state --- */
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSource, setFilterSource] = useState<string>('all');

  const filteredAccounts = mergedAccounts.filter((a) => {
    const matchSearch =
      !searchTerm ||
      a.accountCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.fsLineItem.toLowerCase().includes(searchTerm.toLowerCase());

    const matchFilter =
      filterSource === 'all' ||
      (filterSource === 'recommended' && a.status === 'Recommended') ||
      (filterSource === 'confirmed' && a.status === 'Confirmed') ||
      (filterSource === 'override' && a.status === 'Override') ||
      (filterSource === 'unmapped' && a.fsLineItem === 'Unmapped');

    return matchSearch && matchFilter;
  });

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      <Sidebar sessionId={sessionId} />

      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="h-12 bg-[#EDE6D6] border-b border-[#DDD5C2] flex items-center px-6">
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/close/${sessionId}/dashboard`} className="text-[#8B7A5E] hover:text-[#5C4F3A] transition-colors">
              Dashboard
            </Link>
            <ChevronRight size={14} className="text-[#8B7A5E]" />
            <span className="text-[#2C2416] font-medium">Account Mapping</span>
          </div>
        </div>

        {/* Progress Rail */}
        {gates.length > 0 && (
          <ProgressRail
            gates={gates}
            gatesPassing={gatesPassing}
            gatesTotal={gatesTotal}
            totalAccounts={totalAccounts}
            allMapped={allMapped}
          />
        )}

        {/* Page body */}
        <main className="flex-1 px-6 py-6">
          {error && <ErrorBanner message={(error as Error).message} />}

          {isLoading ? (
            <PageSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Page Title */}
              <div>
                <h1 className="text-2xl font-medium text-[#2C2416]">Account Mapping</h1>
                <p className="text-sm text-[#8B7A5E] mt-1">
                  Map each GL account to its financial statement line item. AI recommendations require confirmation before they are applied.
                </p>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard
                  label="Total Accounts"
                  value={totalAccounts}
                  sub="from adjusted TB"
                />
                <StatCard
                  label="AI Mapped"
                  value={aiMapped}
                  sub={totalAccounts > 0 ? `${Math.round((aiMapped / totalAccounts) * 100)}% automated` : ''}
                  accent="#3B6EA5"
                />
                <StatCard
                  label="AI Recommended"
                  value={recommended}
                  sub="awaiting confirmation"
                  accent="#3B6EA5"
                />
                <StatCard
                  label="Manual Override"
                  value={manualOverrides}
                  sub="controller corrections"
                  accent="#8B6914"
                />
                <StatCard
                  label="Avg Confidence"
                  value={`${avgConfidence}%`}
                  sub="across all mappings"
                  accent={avgConfidence >= 90 ? '#2D6A4F' : avgConfidence >= 70 ? '#8B6914' : '#C44B2B'}
                />
                <StatCard
                  label="Unmapped"
                  value={unmapped}
                  sub={allMapped ? 'gate passing' : 'action required'}
                  accent={unmapped === 0 ? '#2D6A4F' : '#C44B2B'}
                />
              </div>

              {/* Search and Filter Bar */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B7A5E]" />
                  <input
                    type="text"
                    placeholder="Search accounts, codes, or line items..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg text-[#2C2416] placeholder-[#8B7A5E] focus:outline-none focus:border-[#B8860B] transition-colors"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Filter size={14} className="text-[#8B7A5E]" />
                  {['all', 'recommended', 'confirmed', 'override', 'unmapped'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilterSource(f)}
                      className={`text-xs font-medium px-2.5 py-1.5 rounded transition-colors ${
                        filterSource === f
                          ? 'bg-[#2C2416] text-[#B8860B]'
                          : 'bg-[#EDE6D6] text-[#8B7A5E] hover:text-[#2C2416] border border-[#DDD5C2]'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'recommended' ? 'AI Recommended' : f === 'confirmed' ? 'Confirmed' : f === 'override' ? 'Override' : 'Unmapped'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Confirm All Recommended */}
              {recommended > 0 && (
                <div className="flex items-center justify-end">
                  <button
                    onClick={handleConfirmAll}
                    disabled={confirming}
                    className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-[#3B6EA5] text-[#F5F0E8] hover:bg-[#3B6EA5]/90 transition-colors disabled:opacity-50"
                  >
                    {confirming ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Confirm All Recommended ({recommended})
                  </button>
                </div>
              )}

              {/* Mapping Table */}
              <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
                {/* Table Header */}
                <div className="bg-[#2C2416] px-4 py-3 grid grid-cols-12 gap-4 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                  <div className="col-span-1 flex items-center gap-1">
                    GL Account
                    <ArrowUpDown size={12} className="opacity-50" />
                  </div>
                  <div className="col-span-3">Account Name</div>
                  <div className="col-span-2">FS Line Item</div>
                  <div className="col-span-1">Source</div>
                  <div className="col-span-2">Confidence</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-1 text-right">Actions</div>
                </div>

                {/* Table Rows */}
                <div className="divide-y divide-[#DDD5C2]">
                  {filteredAccounts.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-[#8B7A5E]">
                      {searchTerm || filterSource !== 'all'
                        ? 'No accounts match the current filter.'
                        : 'No accounts found. Upload a general ledger to begin.'}
                    </div>
                  ) : (
                    filteredAccounts.map((account) => (
                      <div
                        key={account.accountCode}
                        className="px-4 py-3 grid grid-cols-12 gap-4 items-center hover:bg-[#E8E0D0] transition-colors"
                      >
                        <div className="col-span-1">
                          <span className="text-sm font-mono text-[#2C2416]">{account.accountCode}</span>
                        </div>
                        <div className="col-span-3">
                          <span className="text-sm text-[#2C2416]">{account.accountName}</span>
                        </div>
                        <div className="col-span-2">
                          {account.fsLineItem === 'Unmapped' ? (
                            <span className="text-sm text-[#C44B2B] italic">Unmapped</span>
                          ) : (
                            <span className="text-sm font-medium text-[#B8860B] hover:underline cursor-pointer">
                              {account.fsLineItem}
                            </span>
                          )}
                        </div>
                        <div className="col-span-1">
                          <SourceBadge source={account.source} />
                        </div>
                        <div className="col-span-2">
                          <ConfidenceBar confidence={account.confidence} />
                        </div>
                        <div className="col-span-2">
                          <StatusBadge status={account.status} confidence={account.confidence} />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          {account.status === 'Recommended' && (
                            <button
                              onClick={() => handleReject(account.accountCode)}
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded text-[#C44B2B] hover:bg-[#F5E4DE] transition-colors"
                              title="Reject this recommendation"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Table Footer */}
                {filteredAccounts.length > 0 && (
                  <div className="bg-[#E8E0D0] px-4 py-2.5 flex items-center justify-between text-xs text-[#8B7A5E]">
                    <span>
                      Showing {filteredAccounts.length} of {totalAccounts} accounts
                    </span>
                    <span>
                      {allMapped ? (
                        <span className="flex items-center gap-1 text-[#2D6A4F] font-medium">
                          <CheckCircle2 size={12} />
                          All accounts mapped — gate passing
                        </span>
                      ) : (
                        <span className="text-[#C44B2B]">
                          {unmapped} account{unmapped !== 1 ? 's' : ''} still require mapping
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
