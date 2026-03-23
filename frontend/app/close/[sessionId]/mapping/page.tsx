'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Search, Sparkles, Check, X, ChevronDown, GitBranch } from 'lucide-react';
import { useTrialBalance } from '@/lib/queries/trial-balance';
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
      (s) => s.status === 'pending' && s.confidence > 0.95
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
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="font-semibold"
            style={{
              fontSize: '24px',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Account Mapping
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginTop: '8px',
              margin: 0,
              paddingTop: '8px',
            }}
          >
            {mappedCount} of {totalCount} accounts mapped ({progressPct}%)
          </p>
        </div>

        {/* Auto-accept toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
            }}
          >
            Auto-accept High Confidence (&gt;95%)
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoAcceptEnabled}
            onClick={() => setAutoAcceptEnabled((v) => !v)}
            className="relative inline-flex shrink-0 rounded-full transition-colors duration-200"
            style={{
              width: '44px',
              height: '24px',
              backgroundColor: autoAcceptEnabled
                ? 'var(--status-success)'
                : 'var(--border-default)',
            }}
          >
            <span
              className="inline-block rounded-full shadow transition-transform duration-200"
              style={{
                width: '20px',
                height: '20px',
                marginTop: '2px',
                backgroundColor: 'white',
                transform: autoAcceptEnabled ? 'translateX(22px)' : 'translateX(2px)',
              }}
            />
          </button>
        </label>
      </div>

      {/* Progress bar */}
      <div
        className="w-full overflow-hidden"
        style={{
          height: '6px',
          borderRadius: '3px',
          backgroundColor: 'var(--bg-surface-sunken)',
          marginTop: '12px',
        }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${progressPct}%`,
            borderRadius: '3px',
            backgroundColor: 'var(--interactive-primary)',
          }}
        />
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

      {/* Auto-classifying banner */}
      {autoClassifyMutation.isPending && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-md"
          style={{
            marginTop: '16px',
            backgroundColor: 'var(--ai-bg)',
            border: '1px solid var(--ai-primary)',
          }}
        >
          <Sparkles className="w-4 h-4 animate-pulse" style={{ color: 'var(--ai-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Classifying {rows.filter((r) => !r.mappingReportingLineId).length} accounts against XBRL taxonomy...
          </span>
        </div>
      )}

      {/* Fallback: manual re-classify button if auto-classify failed */}
      {!isLoading && rows.length > 0 && !hasSuggestions && !autoClassifyMutation.isPending && autoClassifyMutation.isError && (
        <div className="flex justify-center" style={{ marginTop: '24px' }}>
          <div className="text-center">
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Auto-classification failed. Click to retry.
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
            backgroundColor: 'var(--bg-nav)',
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
}: MappingRowProps) {
  const { row, suggestion, displayStatus } = merged;

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
                    <optgroup key={category} label={category}>
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
        {displayStatus === 'unmapped' && (
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            —
          </span>
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
      </td>
    </tr>
  );
}
