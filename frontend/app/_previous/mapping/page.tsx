'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Sparkles, Check, X, ChevronDown, GitBranch, Loader2, Pencil } from 'lucide-react';
import { useTrialBalance } from '@/lib/queries/trial-balance';
import { useCloseSession } from '@/lib/queries/close-session';
import {
  useCOASuggestions,
  useAcceptSuggestion,
  useRejectSuggestion,
  useGenerateSuggestions,
  useAutoClassify,
} from '@/lib/queries/suggestions';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ContinueToNextStep } from '@/components/shared/ContinueToNextStep';
import type { TrialBalanceRow } from '@/lib/types/trial-balance';
import type { COASuggestion } from '@/lib/types/suggestion';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TabFilter = 'all' | 'needs-review' | 'accepted' | 'unmapped';

interface TaxonomyItem {
  id: string;
  label: string;
  category: string;
  xbrl_label?: string;
}

/** Merged row: trial balance row enriched with its matching COA suggestion */
interface MergedRow {
  row: TrialBalanceRow;
  suggestion: COASuggestion | null;
  /** Derived display status */
  displayStatus: 'pending' | 'accepted' | 'rejected' | 'manual' | 'unmapped';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return 'var(--status-success)';
  if (confidence >= 60) return 'var(--status-warning)';
  return 'var(--status-error)';
}

function groupByCategory(items: TaxonomyItem[]): Record<string, TaxonomyItem[]> {
  const groups: Record<string, TaxonomyItem[]> = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  return groups;
}

const STATEMENT_LABELS: Record<string, string> = {
  BS: 'Balance Sheet',
  IS: 'Income Statement',
  CF: 'Cash Flow',
  OCI: 'Other Comprehensive Income',
  EQ: "Stockholders' Equity",
};

function formatCategoryLabel(key: string): string {
  return STATEMENT_LABELS[key] ?? key;
}

/* ------------------------------------------------------------------ */
/*  Skeleton Row                                                       */
/* ------------------------------------------------------------------ */

function SkeletonRow() {
  return (
    <tr>
      {[40, 80, 200, 80, 200, 120, 70, 120].map((w, i) => (
        <td key={i} className="px-3 py-3">
          <div
            className="h-4 rounded animate-pulse"
            style={{
              width: w === 200 ? '80%' : `${w}px`,
              maxWidth: '100%',
              backgroundColor: 'var(--bg-surface-sunken)',
            }}
          />
        </td>
      ))}
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function AccountMappingPage() {
  const params = useParams();
  const sessionId = (params.sessionId as string) ?? null;

  /* ── Data fetching ── */
  const { data: session } = useCloseSession(sessionId);
  const entityId = session?.entityId ?? null;
  const {
    data: tbData,
    isLoading: tbLoading,
    isError: tbError,
  } = useTrialBalance(sessionId, false);
  const rows = tbData?.rows ?? [];

  const {
    data: coaSuggestions = [],
    isLoading: suggestionsLoading,
  } = useCOASuggestions(sessionId);

  const acceptMutation = useAcceptSuggestion();
  const rejectMutation = useRejectSuggestion();
  const generateMutation = useGenerateSuggestions(sessionId);
  const autoClassifyMutation = useAutoClassify(sessionId);
  const queryClient = useQueryClient();

  /* ── Manual mapping mutation ── */
  const [mapError, setMapError] = useState<string | null>(null);
  const manualMapMutation = useMutation({
    mutationFn: async (params: { accountCode: string; fsLineId: string; fsLineName: string }) => {
      return apiFetch<{ saved: number; version: number }>('/api/coa-mapping/map', {
        method: 'POST',
        body: {
          accountCode: params.accountCode,
          fsLineId: params.fsLineId,
          entityId: entityId ?? undefined,
        },
      });
    },
    onError: (err) => {
      setMapError(err instanceof Error ? err.message : 'Failed to save mapping');
      setTimeout(() => setMapError(null), 6000);
    },
    onSuccess: (_data, variables) => {
      setMapError(null);
      // Optimistic update: patch the trial balance cache so the row updates immediately
      queryClient.setQueriesData<{ rows: TrialBalanceRow[]; [k: string]: unknown }>(
        { queryKey: ['trial-balance'] },
        (old) => {
          if (!old?.rows) return old;
          return {
            ...old,
            rows: old.rows.map((r) =>
              r.accountCode === variables.accountCode
                ? { ...r, mappingReportingLineId: variables.fsLineId, mappingReportingLineName: variables.fsLineName, mappingStatus: 'mapped' as const }
                : r
            ),
          };
        }
      );
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
        queryClient.invalidateQueries({ queryKey: ['coa-suggestions', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['readiness'] });
      }
    },
  });

  const handleManualMap = useCallback(
    (accountCode: string, fsLineId: string, fsLineName: string) => {
      manualMapMutation.mutate({ accountCode, fsLineId, fsLineName });
    },
    [manualMapMutation]
  );

  /* ── Auto-classify on page load when unmapped accounts exist ── */
  const [autoClassifyTriggered, setAutoClassifyTriggered] = useState(false);
  useEffect(() => {
    if (
      !tbLoading &&
      !suggestionsLoading &&
      rows.length > 0 &&
      coaSuggestions.length === 0 &&
      !autoClassifyTriggered &&
      !autoClassifyMutation.isPending
    ) {
      // Check if there are unmapped accounts
      const unmapped = rows.filter((r) => !r.mappingReportingLineId);
      if (unmapped.length > 0) {
        setAutoClassifyTriggered(true);
        autoClassifyMutation.mutate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tbLoading, suggestionsLoading, rows, coaSuggestions, autoClassifyTriggered]);

  /* ── Taxonomy ── */
  const [taxonomy, setTaxonomy] = useState<TaxonomyItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<TaxonomyItem[]>('/api/coa-mapping/taxonomy')
      .then((data) => {
        if (!cancelled) {
          // Handle both array and object responses
          if (Array.isArray(data)) {
            setTaxonomy(data);
          } else if (data && typeof data === 'object' && 'lines' in data) {
            const lines = (data as unknown as { lines: Array<{ id: string; name: string; statement: string; xbrl_label?: string }> }).lines;
            setTaxonomy(
              lines.map((l) => ({ id: l.id, label: l.name, category: l.statement, xbrl_label: l.xbrl_label }))
            );
          }
        }
      })
      .catch(() => {
        /* silently ignore taxonomy fetch errors */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const taxonomyGroups = useMemo(() => groupByCategory(taxonomy), [taxonomy]);

  /* ── Local UI state ── */
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(false);
  const [rejectedOverrides, setRejectedOverrides] = useState<Map<string, string>>(new Map());

  /* ── Merge rows with suggestions ── */
  const suggestionByCode = useMemo(() => {
    const map = new Map<string, COASuggestion>();
    for (const s of coaSuggestions) {
      if (s.accountCode) map.set(s.accountCode, s);
    }
    return map;
  }, [coaSuggestions]);

  const mergedRows: MergedRow[] = useMemo(() => {
    return rows.map((row) => {
      const suggestion = suggestionByCode.get(row.accountCode) ?? null;
      let displayStatus: MergedRow['displayStatus'] = 'unmapped';

      if (suggestion) {
        if (suggestion.status === 'pending') {
          displayStatus = 'pending';
        } else if (suggestion.status === 'accepted') {
          displayStatus = 'accepted';
        } else if (suggestion.status === 'rejected') {
          displayStatus = 'rejected';
        }
      }

      // If already mapped in TB and no pending suggestion, treat as accepted/manual
      if (row.mappingReportingLineId && !suggestion) {
        displayStatus = 'accepted';
      }
      if (
        row.mappingReportingLineId &&
        suggestion &&
        suggestion.status === 'accepted' &&
        row.mappingReportingLineId !== suggestion.suggestedFsLineId
      ) {
        displayStatus = 'manual';
      }

      return { row, suggestion, displayStatus };
    });
  }, [rows, suggestionByCode]);

  /* ── Counts ── */
  const mappedCount = useMemo(
    () => mergedRows.filter((m) => m.displayStatus === 'accepted' || m.displayStatus === 'manual').length,
    [mergedRows]
  );
  const needsReviewCount = useMemo(
    () => mergedRows.filter((m) => m.displayStatus === 'pending' || m.displayStatus === 'rejected').length,
    [mergedRows]
  );
  const acceptedCount = useMemo(
    () => mergedRows.filter((m) => m.displayStatus === 'accepted' || m.displayStatus === 'manual').length,
    [mergedRows]
  );
  const unmappedCount = useMemo(
    () => mergedRows.filter((m) => m.displayStatus === 'unmapped').length,
    [mergedRows]
  );
  const totalCount = mergedRows.length;
  const progressPct = totalCount > 0 ? Math.round((mappedCount / totalCount) * 100) : 0;

  // Stats for the sticky progress header
  const autoAcceptedCount = useMemo(
    () => coaSuggestions.filter((s) => s.status === 'accepted' && (s as any).auto_accepted).length,
    [coaSuggestions]
  );
  const highConfPending = useMemo(
    () => coaSuggestions.filter((s) => s.status === 'pending' && s.confidence >= 0.80),
    [coaSuggestions]
  );
  const [bulkAccepting, setBulkAccepting] = useState(false);
  const handleAcceptAllHighConf = useCallback(async () => {
    setBulkAccepting(true);
    for (const s of highConfPending) {
      acceptMutation.mutate({ suggestionId: s.id, type: 'coa' });
    }
    setBulkAccepting(false);
  }, [highConfPending, acceptMutation]);

  /* ── Filtering ── */
  const filteredRows = useMemo(() => {
    let list = mergedRows;

    // Tab filter
    switch (activeTab) {
      case 'needs-review':
        list = list.filter((m) => m.displayStatus === 'pending' || m.displayStatus === 'rejected');
        break;
      case 'accepted':
        list = list.filter((m) => m.displayStatus === 'accepted' || m.displayStatus === 'manual');
        break;
      case 'unmapped':
        list = list.filter((m) => m.displayStatus === 'unmapped');
        break;
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.row.accountCode.toLowerCase().includes(q) ||
          m.row.accountName.toLowerCase().includes(q)
      );
    }

    return list;
  }, [mergedRows, activeTab, searchQuery]);

  /* ── Checkbox helpers ── */
  const toggleRow = useCallback((code: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedRows.size === filteredRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredRows.map((m) => m.row.accountCode)));
    }
  }, [filteredRows, selectedRows.size]);

  /* ── Actions ── */
  const handleAccept = useCallback(
    (suggestion: COASuggestion) => {
      acceptMutation.mutate({ suggestionId: suggestion.id, type: 'coa' });
    },
    [acceptMutation]
  );

  const handleReject = useCallback(
    (suggestion: COASuggestion) => {
      rejectMutation.mutate({ suggestionId: suggestion.id, type: 'coa' });
    },
    [rejectMutation]
  );

  const handleSaveOverride = useCallback(
    (accountCode: string, suggestion: COASuggestion) => {
      const overrideId = rejectedOverrides.get(accountCode);
      if (!overrideId) return;
      acceptMutation.mutate({
        suggestionId: suggestion.id,
        type: 'coa',
        overrideFsLineId: overrideId,
      });
      setRejectedOverrides((prev) => {
        const next = new Map(prev);
        next.delete(accountCode);
        return next;
      });
    },
    [acceptMutation, rejectedOverrides]
  );

  const handleBatchAccept = useCallback(() => {
    for (const code of selectedRows) {
      const merged = mergedRows.find((m) => m.row.accountCode === code);
      if (merged?.suggestion && merged.suggestion.status === 'pending') {
        acceptMutation.mutate({ suggestionId: merged.suggestion.id, type: 'coa' });
      }
    }
    setSelectedRows(new Set());
  }, [selectedRows, mergedRows, acceptMutation]);

  const handleBatchReject = useCallback(() => {
    for (const code of selectedRows) {
      const merged = mergedRows.find((m) => m.row.accountCode === code);
      if (merged?.suggestion && merged.suggestion.status === 'pending') {
        rejectMutation.mutate({ suggestionId: merged.suggestion.id, type: 'coa' });
      }
    }
    setSelectedRows(new Set());
  }, [selectedRows, mergedRows, rejectMutation]);

  /* ── Auto-accept logic ── */
  useEffect(() => {
    if (!autoAcceptEnabled) return;
    const highConfPending = coaSuggestions.filter(
      (s) => s.status === 'pending' && s.confidence >= 0.80
    );
    for (const s of highConfPending) {
      acceptMutation.mutate({ suggestionId: s.id, type: 'coa' });
    }
    // Only run when toggle is turned on or suggestions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAcceptEnabled, coaSuggestions]);

  /* ── Tab definitions ── */
  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'needs-review', label: 'Needs Review', count: needsReviewCount },
    { key: 'accepted', label: 'Accepted', count: acceptedCount },
    { key: 'unmapped', label: 'Unmapped', count: unmappedCount },
  ];

  const isLoading = tbLoading || suggestionsLoading;
  const hasSuggestions = coaSuggestions.length > 0;

  /* ── Render ── */
  return (
    <div style={{ padding: '24px' }}>
      {/* Mapping error toast */}
      {mapError && (
        <div
          className="flex items-center justify-between px-4 py-3 mb-4 text-sm rounded-[var(--radius-lg)]"
          style={{ border: '1px solid var(--status-error)', backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error)' }}
        >
          <span>{mapError}</span>
          <button type="button" onClick={() => setMapError(null)} className="hover:opacity-80 ml-4 font-medium" aria-label="Dismiss">x</button>
        </div>
      )}
      {/* ================================================================ */}
      {/* STICKY PROGRESS HEADER                                           */}
      {/* ================================================================ */}
      <div
        className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
        style={{ position: 'sticky', top: 0, zIndex: 10 }}
      >
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-semibold text-lg" style={{ color: 'var(--text-primary)', margin: 0 }}>
            Account Mapping
          </h1>
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {mappedCount} of {totalCount} mapped
          </span>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--bg-surface-sunken)]">
            <div
              className="h-full rounded-full transition-all duration-300 bg-[var(--interactive-primary)]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)', minWidth: '36px' }}>
            {progressPct}%
          </span>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--status-success)]" />
              {autoAcceptedCount > 0 ? autoAcceptedCount : mappedCount} accepted
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--status-warning)]" />
              {needsReviewCount} need review
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--text-tertiary)' }} />
              {unmappedCount} not started
            </span>
          </div>

          <button
            type="button"
            disabled={highConfPending.length === 0 || bulkAccepting}
            onClick={handleAcceptAllHighConf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--interactive-primary)' }}
          >
            {bulkAccepting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Accepting {highConfPending.length} suggestions...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Accept All High Confidence (&ge;80%) &middot; {highConfPending.length}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* FILTER TABS                                                      */}
      {/* ================================================================ */}
      <div
        className="flex items-center justify-between"
        style={{
          marginTop: '16px',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className="relative px-4 pb-3 pt-2 text-sm font-medium transition-colors"
              style={{
                color:
                  activeTab === tab.key
                    ? 'var(--interactive-primary)'
                    : 'var(--text-secondary)',
                borderBottom:
                  activeTab === tab.key
                    ? '2px solid var(--interactive-primary)'
                    : '2px solid transparent',
                marginBottom: '-1px',
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.key) {
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.key) {
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                }
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative" style={{ width: '240px' }}>
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              width: '16px',
              height: '16px',
              color: 'var(--text-secondary)',
            }}
          />
          <input
            type="text"
            placeholder="Search accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md outline-none transition-colors"
            style={{
              border: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* EXPLANATION BANNER FOR FIRST-TIME USERS                          */}
      {/* ================================================================ */}
      {!isLoading && rows.length > 0 && unmappedCount > 0 && !hasSuggestions && !autoClassifyMutation.isPending && (
        <div
          className="rounded-[var(--radius-lg)] border p-4 mt-4 text-sm"
          style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
        >
          Account mapping connects your GL accounts to standardized financial statement line items.
          Sabit uses XBRL taxonomy matching to suggest mappings automatically — review and confirm each one,
          or map manually using the dropdown.
        </div>
      )}

      {/* ================================================================ */}
      {/* EMPTY / GENERATE STATE                                           */}
      {/* ================================================================ */}
      {!isLoading && rows.length === 0 && (
        <div style={{ marginTop: '24px' }}>
          <EmptyState
            icon={GitBranch}
            title="No accounts to map"
            description="Upload a trial balance first, then return here to map accounts."
          />
        </div>
      )}

      {/* Auto-classifying loading state */}
      {autoClassifyMutation.isPending && (
        <div
          className="rounded-[var(--radius-lg)] border p-6 mt-4 text-center"
          style={{ borderColor: 'var(--interactive-primary)', backgroundColor: 'var(--status-info-bg)' }}
        >
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--interactive-primary)' }}>
            Sabit is classifying your {rows.filter((r) => !r.mappingReportingLineId).length} accounts using the XBRL taxonomy...
          </p>
          <div className="w-48 h-1.5 mx-auto rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-default)' }}>
            <div className="h-full rounded-full animate-pulse" style={{ width: '60%', backgroundColor: 'var(--interactive-primary)' }} />
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            Matching account names against XBRL elements
          </p>
        </div>
      )}

      {/* Classification complete banner */}
      {!isLoading && rows.length > 0 && hasSuggestions && !autoClassifyMutation.isPending && (
        <div
          className="rounded-[var(--radius-lg)] border p-3 mt-4 text-sm flex items-center gap-2"
          style={{ borderColor: 'var(--status-success-border)', backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}
        >
          <Check className="w-4 h-4 flex-shrink-0" />
          AI classified {coaSuggestions.filter(s => s.status === 'pending').length} accounts automatically.
          {needsReviewCount > 0 && <span>{needsReviewCount} need your review.</span>}
        </div>
      )}

      {/* Fallback: manual classification required */}
      {!isLoading && rows.length > 0 && !hasSuggestions && !autoClassifyMutation.isPending && autoClassifyMutation.isError && (
        <div className="flex justify-center" style={{ marginTop: '24px' }}>
          <div className="text-center">
            <p className="text-sm mb-1 font-medium" style={{ color: 'var(--status-warning)' }}>
              Automatic classification unavailable
            </p>
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Manual mapping required — use the Map button on each row to assign a taxonomy line item.
            </p>
            <button
              type="button"
              disabled={autoClassifyMutation.isPending}
              onClick={() => {
                setAutoClassifyTriggered(false);
                autoClassifyMutation.mutate();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-md transition-colors"
              style={{
                backgroundColor: 'var(--interactive-primary)',
              }}
            >
              <Sparkles className="w-4 h-4" />
              Retry Classification
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MAPPING TABLE                                                    */}
      {/* ================================================================ */}
      {(isLoading || rows.length > 0) && (
        <div
          className="overflow-x-auto"
          style={{
            marginTop: '16px',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
          }}
        >
          <table className="w-full border-collapse" style={{ minWidth: '900px' }}>
            <thead>
              <tr
                style={{
                  height: '44px',
                  backgroundColor: 'var(--bg-surface-sunken)',
                }}
              >
                <th style={{ width: '40px', padding: '0 12px' }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredRows.length > 0 &&
                      selectedRows.size === filteredRows.length
                    }
                    onChange={toggleAll}
                    className="cursor-pointer"
                    aria-label="Select all rows"
                  />
                </th>
                {[
                  { label: 'Account Code', width: '80px' },
                  { label: 'Account Name', width: undefined },
                  { label: 'GL Type', width: '80px' },
                  { label: 'Suggested Mapping', width: '200px' },
                  { label: 'Confidence', width: '120px' },
                  { label: 'Source', width: '70px' },
                  { label: 'Actions', width: '120px' },
                ].map((col) => (
                  <th
                    key={col.label}
                    className="text-left font-semibold uppercase"
                    style={{
                      width: col.width,
                      minWidth: col.label === 'Account Name' ? '200px' : undefined,
                      padding: '0 12px',
                      fontSize: '11px',
                      letterSpacing: '0.06em',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : filteredRows.map((merged) => (
                    <MappingRow
                      key={merged.row.accountCode}
                      merged={merged}
                      isSelected={selectedRows.has(merged.row.accountCode)}
                      onToggleSelect={toggleRow}
                      onAccept={handleAccept}
                      onReject={handleReject}
                      rejectedOverride={rejectedOverrides.get(merged.row.accountCode)}
                      onOverrideChange={(code, lineId) =>
                        setRejectedOverrides((prev) => {
                          const next = new Map(prev);
                          next.set(code, lineId);
                          return next;
                        })
                      }
                      onSaveOverride={handleSaveOverride}
                      taxonomyGroups={taxonomyGroups}
                      taxonomy={taxonomy}
                      onManualMap={handleManualMap}
                    />
                  ))}
            </tbody>
          </table>

          {!isLoading && filteredRows.length === 0 && rows.length > 0 && (
            <div
              className="text-center py-8 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              No accounts match the current filter.
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* CONTINUE TO NEXT STEP                                            */}
      {/* ================================================================ */}
      <ContinueToNextStep
        currentStep="Mapping"
        nextStep={{ label: 'Reconciliation', href: `/close/${sessionId}/reconciliation` }}
        gatesPassed={!isLoading && totalCount > 0 && unmappedCount === 0 && needsReviewCount === 0}
        gateSummary={`All ${totalCount} accounts mapped`}
      />

      {/* ================================================================ */}
      {/* BATCH ACTIONS BAR                                                */}
      {/* ================================================================ */}
      {selectedRows.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 flex items-center justify-between px-6"
          style={{
            height: '52px',
            backgroundColor: 'var(--interactive-primary)',
            color: 'white',
            zIndex: 50,
          }}
        >
          <span className="text-sm font-medium">
            {selectedRows.size} accounts selected
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBatchAccept}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white rounded-md transition-colors"
              style={{ backgroundColor: 'var(--status-success)' }}
            >
              <Check className="w-4 h-4" />
              Accept All
            </button>
            <button
              type="button"
              onClick={handleBatchReject}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors"
              style={{
                color: 'white',
                border: '1px solid white',
                backgroundColor: 'transparent',
              }}
            >
              <X className="w-4 h-4" />
              Reject All
            </button>
            <button
              type="button"
              onClick={() => setSelectedRows(new Set())}
              className="text-sm underline transition-opacity hover:opacity-80"
              style={{ color: 'white' }}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mapping Table Row                                                  */
/* ------------------------------------------------------------------ */

interface MappingRowProps {
  merged: MergedRow;
  isSelected: boolean;
  onToggleSelect: (code: string) => void;
  onAccept: (suggestion: COASuggestion) => void;
  onReject: (suggestion: COASuggestion) => void;
  rejectedOverride: string | undefined;
  onOverrideChange: (code: string, lineId: string) => void;
  onSaveOverride: (code: string, suggestion: COASuggestion) => void;
  taxonomyGroups: Record<string, TaxonomyItem[]>;
  taxonomy: TaxonomyItem[];
  onManualMap: (accountCode: string, fsLineId: string, fsLineName: string) => void;
}

function MappingRow({
  merged,
  isSelected,
  onToggleSelect,
  onAccept,
  onReject,
  rejectedOverride,
  onOverrideChange,
  onSaveOverride,
  taxonomyGroups,
  taxonomy,
  onManualMap,
}: MappingRowProps) {
  const { row, suggestion, displayStatus } = merged;
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSearch, setMapSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!mapOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMapOpen(false);
        setMapSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [mapOpen]);

  // Focus search input when dropdown opens (defer to next frame so DOM is rendered)
  useEffect(() => {
    if (!mapOpen) return;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [mapOpen]);

  const filteredTaxonomy = useMemo(() => {
    if (!mapSearch.trim()) return taxonomy;
    const q = mapSearch.trim().toLowerCase();
    return taxonomy.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.xbrl_label?.toLowerCase().includes(q) ?? false)
    );
  }, [taxonomy, mapSearch]);

  const filteredTaxonomyGroups = useMemo(() => groupByCategory(filteredTaxonomy), [filteredTaxonomy]);

  // Row background and left border by status
  const rowStyle: React.CSSProperties = {};
  switch (displayStatus) {
    case 'pending':
      rowStyle.backgroundColor = 'var(--ai-bg)';
      rowStyle.borderLeft = '3px solid var(--ai-primary)';
      break;
    case 'accepted':
      rowStyle.backgroundColor = 'var(--bg-surface)';
      rowStyle.borderLeft = '3px solid var(--status-success)';
      break;
    case 'rejected':
      rowStyle.backgroundColor = 'var(--status-error-bg)';
      rowStyle.borderLeft = '3px solid var(--status-error)';
      break;
    case 'manual':
      rowStyle.backgroundColor = 'var(--bg-surface)';
      rowStyle.borderLeft = '3px solid var(--interactive-primary)';
      break;
    case 'unmapped':
      rowStyle.backgroundColor = 'var(--bg-surface)';
      break;
  }

  const confidenceValue = suggestion
    ? Math.round(suggestion.confidence * 100)
    : null;
  const confidenceBarWidth = 60;
  const confidenceBarHeight = 4;

  return (
    <tr
      style={{
        ...rowStyle,
        borderBottom: '1px solid var(--border-default)',
      }}
    >
      {/* Checkbox */}
      <td style={{ width: '40px', padding: '0 12px' }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(row.accountCode)}
          className="cursor-pointer"
          aria-label={`Select ${row.accountCode}`}
        />
      </td>

      {/* Account Code */}
      <td
        className="font-mono text-sm"
        style={{
          padding: '10px 12px',
          color: 'var(--text-primary)',
        }}
      >
        {row.accountCode}
      </td>

      {/* Account Name */}
      <td
        className="text-sm"
        style={{
          padding: '10px 12px',
          color: 'var(--text-primary)',
          minWidth: '200px',
        }}
      >
        {row.accountName}
      </td>

      {/* GL Type chip */}
      <td style={{ padding: '10px 12px' }}>
        <span
          className="inline-block px-2 py-0.5 rounded text-xs font-medium"
          style={{
            backgroundColor: 'var(--bg-surface-sunken)',
            color: 'var(--text-secondary)',
          }}
        >
          {row.accountType}
        </span>
      </td>

      {/* Suggested Mapping */}
      <td style={{ padding: '10px 12px', width: '200px' }}>
        {displayStatus === 'pending' && suggestion && (
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {suggestion.suggestedFsLineLabel ?? suggestion.suggestedFsLineId}
          </span>
        )}
        {displayStatus === 'accepted' && (
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {row.mappingReportingLineName ??
              suggestion?.suggestedFsLineLabel ??
              suggestion?.suggestedFsLineId ??
              '—'}
          </span>
        )}
        {displayStatus === 'rejected' && suggestion && (
          <div>
            <span
              className="text-sm line-through"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {suggestion.suggestedFsLineLabel ?? suggestion.suggestedFsLineId}
            </span>
            <div style={{ marginTop: '4px' }}>
              <div className="relative">
                <select
                  className="w-full appearance-none pr-7 pl-2 py-1 text-xs rounded-md outline-none"
                  style={{
                    border: '1px solid var(--border-default)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                  value={rejectedOverride ?? ''}
                  onChange={(e) => onOverrideChange(row.accountCode, e.target.value)}
                >
                  <option value="">Select mapping...</option>
                  {Object.entries(taxonomyGroups).map(([category, items]) => (
                    <optgroup key={category} label={formatCategoryLabel(category)}>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}{item.xbrl_label ? ` (XBRL: ${item.xbrl_label})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    width: '12px',
                    height: '12px',
                    color: 'var(--text-secondary)',
                  }}
                />
              </div>
            </div>
          </div>
        )}
        {displayStatus === 'manual' && suggestion && (
          <div>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {row.mappingReportingLineName ?? '—'}
            </span>
            <p
              style={{
                fontSize: '11px',
                color: 'var(--text-tertiary)',
                marginTop: '2px',
              }}
            >
              Overridden from AI suggestion:{' '}
              {suggestion.suggestedFsLineLabel ?? suggestion.suggestedFsLineId}
            </p>
          </div>
        )}
        {displayStatus === 'unmapped' && !mapOpen && (
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            —
          </span>
        )}
        {displayStatus === 'unmapped' && mapOpen && (
          <div ref={dropdownRef} className="relative" style={{ minWidth: '200px' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search taxonomy..."
              value={mapSearch}
              onChange={(e) => setMapSearch(e.target.value)}
              className="w-full pl-2 pr-7 py-1.5 text-xs rounded-md outline-none"
              style={{
                border: '1px solid var(--interactive-primary)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
            <div
              className="absolute left-0 right-0 mt-1 rounded-md shadow-lg overflow-auto"
              style={{
                maxHeight: '240px',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                zIndex: 30,
              }}
            >
              {Object.entries(filteredTaxonomyGroups).map(([category, items]) => (
                <div key={category}>
                  <div
                    className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider sticky top-0"
                    style={{
                      backgroundColor: 'var(--bg-surface-sunken)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {formatCategoryLabel(category)}
                  </div>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-surface-sunken)] transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={() => {
                        onManualMap(row.accountCode, item.id, item.label);
                        setMapOpen(false);
                        setMapSearch('');
                      }}
                    >
                      {item.label}
                      {item.xbrl_label && (
                        <span className="ml-1" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                          {item.xbrl_label}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
              {filteredTaxonomy.length === 0 && (
                <div className="px-3 py-3 text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                  No matching line items
                </div>
              )}
            </div>
          </div>
        )}
      </td>

      {/* Confidence */}
      <td style={{ padding: '10px 12px', width: '120px' }}>
        {confidenceValue !== null && suggestion && (
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ color: getConfidenceColor(confidenceValue), minWidth: '32px' }}
            >
              {confidenceValue}%
            </span>
            <div
              className="overflow-hidden rounded-full"
              style={{
                width: `${confidenceBarWidth}px`,
                height: `${confidenceBarHeight}px`,
                backgroundColor: 'var(--bg-surface-sunken)',
              }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, confidenceValue))}%`,
                  backgroundColor: getConfidenceColor(confidenceValue),
                }}
              />
            </div>
          </div>
        )}
      </td>

      {/* Source */}
      <td style={{ padding: '10px 12px', width: '70px' }}>
        {suggestion && (
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase"
            style={{
              backgroundColor: suggestion.modelVersion?.startsWith('xbrl')
                ? 'var(--bg-surface-sunken)'
                : 'var(--ai-bg)',
              color: suggestion.modelVersion?.startsWith('xbrl')
                ? 'var(--text-secondary)'
                : 'var(--ai-primary)',
            }}
          >
            {suggestion.modelVersion?.startsWith('xbrl') ? 'XBRL' : 'AI'}
          </span>
        )}
        {!suggestion && row.mappingReportingLineId && (
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase"
            style={{
              backgroundColor: 'var(--bg-surface-sunken)',
              color: 'var(--interactive-primary)',
            }}
          >
            MANUAL
          </span>
        )}
      </td>

      {/* Actions */}
      <td style={{ padding: '10px 12px', width: '120px' }}>
        {displayStatus === 'pending' && suggestion && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onAccept(suggestion)}
              className="inline-flex items-center gap-1 text-xs font-medium rounded-md transition-colors"
              style={{
                height: '26px',
                padding: '0 8px',
                backgroundColor: 'var(--status-success)',
                color: 'white',
              }}
            >
              <Check className="w-3 h-3" />
              Accept
            </button>
            <button
              type="button"
              onClick={() => onReject(suggestion)}
              className="inline-flex items-center gap-1 text-xs font-medium rounded-md transition-colors"
              style={{
                height: '26px',
                padding: '0 8px',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
              }}
            >
              Change
            </button>
          </div>
        )}
        {displayStatus === 'accepted' && (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: 'var(--status-success)' }}
          >
            <Check className="w-3.5 h-3.5" />
            Mapped
          </span>
        )}
        {displayStatus === 'rejected' && suggestion && rejectedOverride && (
          <button
            type="button"
            onClick={() => onSaveOverride(row.accountCode, suggestion)}
            className="inline-flex items-center gap-1 text-xs font-medium text-white rounded-md transition-colors"
            style={{
              height: '28px',
              padding: '0 10px',
              backgroundColor: 'var(--interactive-primary)',
            }}
          >
            Save
          </button>
        )}
        {displayStatus === 'manual' && (
          <StatusBadge
            variant="info"
            label="MANUAL"
            size="sm"
            showIcon={false}
          />
        )}
        {displayStatus === 'unmapped' && !mapOpen && (
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-medium rounded-md transition-colors"
            style={{
              height: '26px',
              padding: '0 8px',
              backgroundColor: 'var(--interactive-primary)',
              color: 'white',
            }}
          >
            <Pencil className="w-3 h-3" />
            Map
          </button>
        )}
        {displayStatus === 'unmapped' && mapOpen && (
          <button
            type="button"
            onClick={() => { setMapOpen(false); setMapSearch(''); }}
            className="inline-flex items-center gap-1 text-xs font-medium rounded-md transition-colors"
            style={{
              height: '26px',
              padding: '0 8px',
              border: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
            }}
          >
            Cancel
          </button>
        )}
      </td>
    </tr>
  );
}
