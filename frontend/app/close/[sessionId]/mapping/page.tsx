'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { CloseSidebar } from '@/components/close-sidebar';
import { WorkflowBreadcrumb } from '@/components/workflow-breadcrumb';
import {
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
  Pencil,
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
  // Backend fields (actual API response from GET /api/coa-mapping/rules)
  sourceAccountNamePattern?: string;
  sourceAccountNumberPattern?: string;
  mappedFsLineId?: string;
  confidenceDefault?: number;
  version?: number;
  // Derived/display fields (set during merge)
  accountCode?: string;
  accountName?: string;
  fsLineItem?: string;
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
  accountName?: string;
  suggestedLineItem?: string;
  suggestedLineItemId?: string;
  suggestedLineItemName?: string;
  fsLineItem?: string;
  source?: string;
  confidence?: number | string;
  reasoning?: string;
  status?: string;
}

/* ------------------------------------------------------------------ */
/*  Nav items config                                                   */
/* ------------------------------------------------------------------ */

/* Sidebar imported from @/components/close-sidebar */

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
          const isActive = i === activeGateIndex && !gate.passing;
          let bg = '#DDD5C2'; // pending (muted)
          if (gate.passing) bg = '#2D6A4F'; // forest green
          else if (isActive) bg = '#B8860B'; // gold active
          const sizeClass = isActive ? 'w-3 h-3' : 'w-2.5 h-2.5';
          return (
            <div
              key={gate.id}
              className={`${sizeClass} rounded-full transition-colors`}
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

  // Fetch session to get entityId for mapping API calls
  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => apiFetch<Record<string, unknown>>(`/api/close/sessions/${sessionId}`),
    enabled: !!sessionId,
  });
  const entityId = String(sessionQuery.data?.entityId ?? 'default');

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
    queryKey: ['coa-mapping-rules', sessionId, entityId],
    queryFn: async () => {
      const data = await apiFetch<MappingRule[] | { rules?: MappingRule[] }>(
        `/api/coa-mapping/rules`,
        { params: { entityId } }
      );
      return Array.isArray(data) ? data : data.rules ?? [];
    },
    enabled: !!sessionId && !!entityId,
  });

  // Fetch taxonomy to resolve rule mappedFsLineId -> display name
  const taxonomyQuery = useQuery({
    queryKey: ['coa-taxonomy'],
    queryFn: async () => {
      const data = await apiFetch<{ lines?: Array<{ id: string; name: string; statement: string }> }>(
        `/api/coa-mapping/taxonomy`
      );
      return data.lines ?? [];
    },
    staleTime: 300_000,
  });

  const suggestionsQuery = useQuery({
    queryKey: ['coa-mapping-suggestions', sessionId, entityId],
    queryFn: async () => {
      const data = await apiFetch<MappingSuggestion[] | { suggestions?: MappingSuggestion[] }>(
        `/api/coa-mapping/suggestions`,
        { params: { sessionId, entityId } }
      );
      return Array.isArray(data) ? data : data.suggestions ?? [];
    },
    enabled: !!sessionId,
    staleTime: 60_000,
    retry: 2,
  });

  /* --- Derived state --- */

  const gates = readinessQuery.data?.gates ?? [];
  const gatesPassing = readinessQuery.data?.gatesPassing ?? 0;
  const gatesTotal = readinessQuery.data?.gatesTotal ?? 0;
  const tbRows = tbQuery.data?.rows ?? [];
  const rules = rulesQuery.data ?? [];
  const suggestions = suggestionsQuery.data ?? [];
  const taxonomyLines = taxonomyQuery.data ?? [];

  // Taxonomy lookup: fs_line_id -> display name
  const taxonomyNameMap = new Map<string, string>();
  for (const line of taxonomyLines) {
    taxonomyNameMap.set(line.id, line.name);
  }

  // Build a lookup: accountCode -> rule (rules use sourceAccountNumberPattern as key)
  const ruleMap = new Map<string, MappingRule>();
  for (const rule of rules) {
    const key = rule.sourceAccountNumberPattern ?? rule.accountCode ?? '';
    if (key && key !== '%') ruleMap.set(key, rule);
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

    // fsLineId = taxonomy ID (e.g. "fs_asset_cash") — used for API calls
    const fsLineId =
      rule?.mappedFsLineId ??
      sug?.suggestedLineItemId ??
      sug?.fsLineItem ??
      null;

    // fsLineItem = display name — resolve from taxonomy, then suggestion, then ID as fallback
    const fsLineItem =
      (fsLineId ? taxonomyNameMap.get(fsLineId) : null) ??
      sug?.suggestedLineItemName ??
      sug?.suggestedLineItem ??
      fsLineId ??
      'Unmapped';

    const source = rule?.source ?? sug?.source ?? sug?.reasoning ?? (rule ? 'AI Confirmed' : '');
    const rawConf = rule?.confidenceDefault ?? rule?.confidence ?? sug?.confidence ?? 0;
    const confidence = typeof rawConf === 'string'
      ? (rawConf === 'high' ? 95 : rawConf === 'medium' ? 70 : rawConf === 'low' ? 40 : Number(rawConf) || 0)
      : (typeof rawConf === 'number' && rawConf > 0 && rawConf <= 1 ? Math.round(rawConf * 100) : rawConf);
    const isAISource = ((source ?? '').toLowerCase().match(/ai|pattern|xbrl|claude|rag|rule/) !== null);
    const hasReviewer = !!(rule?.reviewedBy);
    const isExplicitAutoAccepted = rule?.autoAccepted === true;

    // Derive status:
    // - Rule exists → account is "Confirmed" (mapped via rule)
    // - No rule but suggestion exists → "Recommended" (AI suggestion awaiting confirmation)
    // - Neither → "Unmapped"
    let status: string;
    if (rule && fsLineId) {
      status = 'Confirmed';
    } else if (sug && fsLineId) {
      status = 'Recommended';
    } else {
      status = 'Unmapped';
    }

    return {
      accountCode: row.accountCode,
      accountName: row.accountName,
      fsLineId,
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
  const mappedAccounts = mergedAccounts.filter((a) => a.confidence > 0);
  const avgConfidence =
    mappedAccounts.length > 0
      ? Math.round(mappedAccounts.reduce((sum, a) => sum + (a.confidence || 0), 0) / mappedAccounts.length)
      : 0;
  const unmapped = mergedAccounts.filter((a) => a.fsLineItem === 'Unmapped').length;
  const allMapped = unmapped === 0 && totalAccounts > 0;

  const isLoading = tbQuery.isLoading || rulesQuery.isLoading;
  const suggestionsLoading = suggestionsQuery.isLoading || suggestionsQuery.isFetching;
  const error = tbQuery.error || rulesQuery.error;

  /* --- Confirm / Reject handlers --- */
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const handleConfirmAll = useCallback(async () => {
    const recommendedItems = mergedAccounts.filter((a) => a.status === 'Recommended' && a.fsLineId);
    if (recommendedItems.length === 0) return;
    setConfirming(true);
    try {
      await apiFetch('/api/coa-mapping/map', {
        method: 'POST',
        body: {
          entityId,
          mappings: recommendedItems.map((item) => ({
            accountCode: item.accountCode,
            fsLineId: item.fsLineId,
          })),
          suggestionSource: 'ai_accepted',
        },
      });
      queryClient.invalidateQueries({ queryKey: ['coa-mapping-rules', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['coa-mapping-suggestions', sessionId] });
    } catch (err) {
      console.error('Failed to confirm recommended mappings:', err);
    } finally {
      setConfirming(false);
    }
  }, [mergedAccounts, sessionId, entityId, queryClient]);

  const handleConfirm = useCallback(
    async (accountCode: string, fsLineId: string) => {
      try {
        await apiFetch('/api/coa-mapping/map', {
          method: 'POST',
          body: {
            entityId,
            accountCode,
            fsLineId,
            suggestionSource: 'ai_accepted',
          },
        });
        queryClient.invalidateQueries({ queryKey: ['coa-mapping-rules', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['coa-mapping-suggestions', sessionId] });
      } catch (err) {
        console.error('Failed to confirm mapping:', err);
      }
    },
    [sessionId, entityId, queryClient]
  );

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

  /* --- Override state --- */
  const [overrideAccount, setOverrideAccount] = useState<string | null>(null);
  const [overrideSearch, setOverrideSearch] = useState('');
  const overrideRef = useRef<HTMLDivElement>(null);

  // Close override dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (overrideRef.current && !overrideRef.current.contains(e.target as Node)) {
        setOverrideAccount(null);
        setOverrideSearch('');
      }
    }
    if (overrideAccount) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [overrideAccount]);

  const handleOverride = useCallback(
    async (accountCode: string, newFsLineId: string) => {
      try {
        await apiFetch('/api/coa-mapping/map', {
          method: 'POST',
          body: {
            entityId,
            accountCode,
            fsLineId: newFsLineId,
            suggestionSource: 'ai_edited',
          },
        });
        queryClient.invalidateQueries({ queryKey: ['coa-mapping-rules', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['coa-mapping-suggestions', sessionId] });
        setOverrideAccount(null);
        setOverrideSearch('');
      } catch (err) {
        console.error('Failed to override mapping:', err);
      }
    },
    [sessionId, entityId, queryClient]
  );

  // Mappable taxonomy lines for override dropdown
  const mappableLines = taxonomyLines.filter((l) => !(l as Record<string, unknown>).isSubtotal);

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
      {/* Sidebar rendered by layout.tsx */}

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

        {/* Workflow Breadcrumb */}
        <WorkflowBreadcrumb sessionId={sessionId} gates={gates} />

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

              {/* AI loading indicator */}
              {suggestionsLoading && (
                <div className="bg-[#E0EAF5] border border-[#3B6EA5]/20 rounded-lg px-4 py-3 flex items-center gap-3">
                  <Loader2 size={16} className="animate-spin text-[#3B6EA5]" />
                  <span className="text-sm text-[#3B6EA5]">
                    AI is analyzing {totalAccounts} accounts — mapping suggestions will appear shortly...
                  </span>
                </div>
              )}

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
                        <div className="col-span-1 flex justify-end gap-1 relative">
                          {account.status === 'Recommended' && (
                            <>
                              <button
                                onClick={() => handleConfirm(account.accountCode, account.fsLineId ?? '')}
                                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded text-[#2D6A4F] hover:bg-[#E0EDE8] transition-colors"
                                title="Confirm this recommendation"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                              <button
                                onClick={() => handleReject(account.accountCode)}
                                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded text-[#C44B2B] hover:bg-[#F5E4DE] transition-colors"
                                title="Reject this recommendation"
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}
                          {account.status === 'Confirmed' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setOverrideAccount(overrideAccount === account.accountCode ? null : account.accountCode); setOverrideSearch(''); }}
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded text-[#8B6914] hover:bg-[#F0E8D0] transition-colors"
                              title="Change mapping"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {/* Override dropdown */}
                          {overrideAccount === account.accountCode && (
                            <div ref={overrideRef} className="absolute right-0 top-8 z-50 w-72 bg-white border border-[#DDD5C2] rounded-lg shadow-xl p-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                placeholder="Search FS lines..."
                                value={overrideSearch}
                                onChange={(e) => setOverrideSearch(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs bg-[#F5F0E8] border border-[#DDD5C2] rounded mb-1 focus:outline-none focus:border-[#B8860B]"
                                autoFocus
                              />
                              <div className="max-h-48 overflow-y-auto">
                                {mappableLines
                                  .filter((l) => !overrideSearch || l.name.toLowerCase().includes(overrideSearch.toLowerCase()) || l.id.toLowerCase().includes(overrideSearch.toLowerCase()))
                                  .slice(0, 20)
                                  .map((line) => (
                                    <button
                                      key={line.id}
                                      onClick={() => handleOverride(account.accountCode, line.id)}
                                      className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-[#E0EAF5] transition-colors ${
                                        account.fsLineId === line.id ? 'bg-[#E0EDE8] font-medium' : ''
                                      }`}
                                    >
                                      <span className="text-[#2C2416]">{line.name}</span>
                                      <span className="text-[#8B7A5E] ml-1">({line.statement})</span>
                                    </button>
                                  ))}
                              </div>
                            </div>
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
