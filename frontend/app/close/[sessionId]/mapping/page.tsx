'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrialBalanceContext } from '../context/trial-balance-context';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { FilterBar } from '@/components/shared/FilterBar';
import { AISuggestionCard } from '@/components/shared/AISuggestionCard';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCloseSession } from '@/lib/queries/close-session';
import { useCOASuggestions, useGenerateSuggestions, useAcceptSuggestion, useRejectSuggestion } from '@/lib/queries/suggestions';
import type { TrialBalanceRow, AccountType } from '@/lib/types/trial-balance';
import type { COASuggestion } from '@/lib/types/suggestion';
import { Pencil, Check, X, Sparkles, Loader2 } from 'lucide-react';

/** API taxonomy line (flat). */
interface TaxonomyLine {
  id: string;
  code: string;
  name: string;
  statement: string;
  parentId?: string;
  normalBalance?: string;
}

/** Tree node for taxonomy UI. */
interface TaxonomyNode {
  id: string;
  label: string;
  children?: TaxonomyNode[];
}

const STATEMENT_LABELS: Record<string, string> = {
  PL: 'Income Statement',
  BS: 'Balance Sheet',
  CF: 'Cash Flow Statement',
};

function buildTaxonomyTree(lines: TaxonomyLine[]): TaxonomyNode[] {
  if (!lines.length) return [];
  const map = new Map<string, TaxonomyNode>();
  for (const l of lines) {
    map.set(l.id, { id: l.id, label: l.name, children: [] });
  }
  const roots: TaxonomyNode[] = [];
  for (const l of lines) {
    const node = map.get(l.id)!;
    if (!l.parentId || !map.has(l.parentId)) {
      roots.push(node);
    } else {
      const parent = map.get(l.parentId)!;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    }
  }
  return roots;
}

function flattenForSelect(lines: TaxonomyLine[]): { id: string; label: string; statementLabel: string }[] {
  return lines.map((l) => ({
    id: l.id,
    label: l.name,
    statementLabel: STATEMENT_LABELS[l.statement] ?? l.statement,
  }));
}

const ACCOUNT_TYPE_STYLE: Record<AccountType, string> = {
  ASSET: 'bg-status-blue-dim text-status-blue',
  LIABILITY: 'bg-status-amber-dim text-status-amber',
  EQUITY: 'bg-equity-dim text-equity',
  REVENUE: 'bg-status-green-dim text-status-green',
  EXPENSE: 'bg-status-red-dim text-status-red',
};

const CONFIDENCE_BADGE: Record<string, string> = {
  high: 'bg-status-green-dim text-status-green border-status-green/30',
  medium: 'bg-status-amber-dim text-status-amber border-status-amber/30',
  low: 'bg-status-red-dim text-status-red border-status-red/30',
};

export default function MappingPage() {
  const p = useParams();
  const sessionId = p.sessionId as string;
  const searchParams = useSearchParams();
  const unmappedOnlyDefault = searchParams.get('unmapped') === '1';
  const queryClient = useQueryClient();

  const { data: session } = useCloseSession(sessionId);
  const entityId = session?.entityId ?? '';

  /* ── Taxonomy ── */
  const { data: taxonomyData } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => apiFetch<{ lines: TaxonomyLine[] }>('/api/coa-mapping/taxonomy'),
    staleTime: 60_000,
  });
  const taxonomyLines = taxonomyData?.lines ?? [];
  const taxonomy = useMemo(() => buildTaxonomyTree(taxonomyLines), [taxonomyLines]);
  const taxonomyFlat = useMemo(() => flattenForSelect(taxonomyLines), [taxonomyLines]);

  /* ── SLM Suggestions ── */
  const { data: coaSuggestions = [], isLoading: suggestionsLoading } = useCOASuggestions(sessionId);
  const pendingSuggestions = useMemo(
    () => coaSuggestions.filter((s) => s.status === 'pending'),
    [coaSuggestions]
  );
  const generateMutation = useGenerateSuggestions(sessionId);
  const acceptMutation = useAcceptSuggestion();
  const rejectMutation = useRejectSuggestion();

  /* ── Manual Mapping Mutation ── */
  const manualMapMutation = useMutation({
    mutationFn: async (params: { accountName: string; accountCode: string; lineId: string }) => {
      return apiFetch<{ version: number; ruleIds: string[] }>('/api/coa-mapping/rules', {
        method: 'POST',
        body: {
          entityId,
          rules: [{
            sourceAccountNamePattern: params.accountName,
            sourceAccountNumberPattern: params.accountCode,
            mappedFsLineId: params.lineId,
            confidenceDefault: 1,
            effectiveFrom: session?.periodStart ?? new Date().toISOString().slice(0, 10),
          }],
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
      queryClient.invalidateQueries({ queryKey: ['readiness'] });
      queryClient.invalidateQueries({ queryKey: ['coa-suggestions'] });
    },
  });

  /* ── Local UI State ── */
  const { rows, setOverrides } = useTrialBalanceContext();
  const [search, setSearch] = useState('');
  const [typeFilters, setTypeFilters] = useState<Set<AccountType>>(new Set());
  const [unmappedOnly, setUnmappedOnly] = useState(unmappedOnlyDefault || rows.some((r) => !r.mappingReportingLineId));
  const [rightTab, setRightTab] = useState<'ai' | 'taxonomy'>('ai');
  const [taxonomySelectedId, setTaxonomySelectedId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.accountCode.toLowerCase().includes(q) || r.accountName.toLowerCase().includes(q));
    }
    if (typeFilters.size > 0) list = list.filter((r) => typeFilters.has(r.accountType));
    if (unmappedOnly) list = list.filter((r) => !r.mappingReportingLineId);
    return list;
  }, [rows, search, typeFilters, unmappedOnly]);

  const mappedCount = rows.filter((r) => r.mappingReportingLineId).length;
  const unmappedCount = rows.filter((r) => !r.mappingReportingLineId).length;
  const totalAccounts = rows.length;
  const progressPct = totalAccounts ? Math.round((mappedCount / totalAccounts) * 1000) / 10 : 0;

  /* ── Suggestion ↔ Row matching ── */
  const suggestionByAccount = useMemo(() => {
    const map = new Map<string, COASuggestion>();
    for (const s of pendingSuggestions) {
      if (s.accountCode) map.set(s.accountCode, s);
    }
    return map;
  }, [pendingSuggestions]);

  const unmappedSuggestions = useMemo(
    () => pendingSuggestions.filter((s) => s.accountCode && rows.some((r) => r.accountCode === s.accountCode && !r.mappingReportingLineId)),
    [pendingSuggestions, rows]
  );
  const highConfidenceSuggestions = unmappedSuggestions.filter((s) => s.confidenceBand === 'high');

  /* ── Handlers ── */
  const handleAcceptSuggestion = (s: COASuggestion, overrideFsLineId?: string) => {
    setBusyIds((prev) => new Set(prev).add(s.id));
    acceptMutation.mutate(
      { suggestionId: s.id, type: 'coa', overrideFsLineId },
      { onSettled: () => setBusyIds((prev) => { const n = new Set(prev); n.delete(s.id); return n; }) }
    );
  };

  const handleRejectSuggestion = (s: COASuggestion) => {
    setBusyIds((prev) => new Set(prev).add(s.id));
    rejectMutation.mutate(
      { suggestionId: s.id, type: 'coa' },
      { onSettled: () => setBusyIds((prev) => { const n = new Set(prev); n.delete(s.id); return n; }) }
    );
  };

  const handleBulkAccept = () => {
    highConfidenceSuggestions.forEach((s) => handleAcceptSuggestion(s));
  };

  const handleManualMap = (row: TrialBalanceRow, lineId: string, lineName: string) => {
    // Optimistic UI update
    setOverrides((prev) => ({ ...prev, [row.accountCode]: { lineId, lineName } }));
    // Persist to backend
    manualMapMutation.mutate({ accountName: row.accountName, accountCode: row.accountCode, lineId });
  };

  const typePills = (['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const).map((t) => ({
    id: t,
    label: t,
    active: typeFilters.has(t),
    toggle: () => setTypeFilters((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; }),
  }));

  const lineItemsByStatement = useMemo(() => {
    const map: Record<string, { id: string; label: string }[]> = {};
    taxonomyFlat.forEach((item) => {
      if (!map[item.statementLabel]) map[item.statementLabel] = [];
      map[item.statementLabel].push({ id: item.id, label: item.label });
    });
    return map;
  }, [taxonomyFlat]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-primary">Account Mapping</h1>
        <p className="text-text-secondary text-sm mt-0.5">Map GL accounts to reporting line items</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 py-2 px-3 rounded-input bg-surface border border-border">
        <span className="text-text-secondary text-sm">Total Accounts: {totalAccounts}</span>
        <span className="text-status-green text-sm">Mapped: {mappedCount}</span>
        <span className={cn('text-sm', unmappedCount > 0 ? 'text-status-red font-medium' : 'text-status-green')}>
          Unmapped: {unmappedCount}
        </span>
        <div className="flex-1 min-w-[120px] max-w-[200px] h-2 bg-elevated rounded-full overflow-hidden">
          <div className="h-full bg-status-green rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="font-mono text-sm text-primary">{mappedCount}/{totalAccounts} ({progressPct}%)</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          <FilterBar
            searchPlaceholder="Search by code or name..."
            searchValue={search}
            onSearchChange={setSearch}
            pills={typePills}
          >
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={unmappedOnly}
                onChange={(e) => setUnmappedOnly(e.target.checked)}
                className="rounded border-border bg-input"
              />
              Show unmapped only
            </label>
          </FilterBar>

          <div className="rounded-card border border-border overflow-hidden">
            {rows.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-primary font-medium mb-1">No trial balance data</p>
                <p className="text-text-secondary text-sm">Upload a GL or trial balance from the dashboard to see accounts and map them to reporting lines.</p>
              </div>
            ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-surface border-b border-border">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary w-[100px]">Code</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary">Account Name</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary w-[90px]">Type</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-text-secondary w-[120px]">Balance</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary min-w-[180px]">Mapping</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary w-[200px]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const suggestion = !r.mappingReportingLineId ? suggestionByAccount.get(r.accountCode) : undefined;
                    const isBusy = suggestion ? busyIds.has(suggestion.id) : false;
                    return (
                    <tr
                      key={r.accountCode}
                      className={cn(
                        'border-b border-border-light hover:bg-hover',
                        !r.mappingReportingLineId && 'border-l-4 border-l-status-red'
                      )}
                    >
                      <td className="px-3 py-2 font-mono text-sm text-primary">{r.accountCode}</td>
                      <td className="px-3 py-2 text-sm text-primary">{r.accountName}</td>
                      <td className="px-3 py-2">
                        <span className={cn('px-2 py-0.5 rounded text-xs', ACCOUNT_TYPE_STYLE[r.accountType])}>{r.accountType}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm"><MoneyCell value={r.netBalance} /></td>
                      <td className="px-3 py-2 text-sm">
                        {r.mappingReportingLineName ? (
                          <span className="text-primary">{r.mappingReportingLineName}</span>
                        ) : suggestion ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-ai-purple text-xs">{suggestion.suggestedFsLineLabel ?? suggestion.suggestedFsLineId}</span>
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] border', CONFIDENCE_BADGE[suggestion.confidenceBand])}>
                              {suggestion.confidenceBand.toUpperCase()}
                            </span>
                          </div>
                        ) : (
                          <span className="text-status-red">Unmapped</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {/* Unmapped row WITH a suggestion: Accept / Edit / Reject */}
                        {!r.mappingReportingLineId && suggestion && editingSuggestionId !== suggestion.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAcceptSuggestion(suggestion)}
                              className="px-2 py-1 rounded text-xs bg-status-green-dim text-status-green border border-status-green/30 disabled:opacity-50"
                            >
                              {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 inline" />} Accept
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setEditingSuggestionId(suggestion.id)}
                              className="px-2 py-1 rounded text-xs bg-elevated text-text-secondary border border-border disabled:opacity-50"
                            >
                              <Pencil className="w-3 h-3 inline" /> Edit
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRejectSuggestion(suggestion)}
                              className="px-2 py-1 rounded text-xs bg-status-red-dim text-status-red border border-status-red/30 disabled:opacity-50"
                            >
                              <X className="w-3 h-3 inline" /> Reject
                            </button>
                          </div>
                        ) : !r.mappingReportingLineId && suggestion && editingSuggestionId === suggestion.id ? (
                          /* Edit mode: dropdown to override then accept */
                          <select
                            className="w-full max-w-[200px] px-2 py-1.5 rounded-input bg-input border border-border text-sm text-primary focus:outline-none focus:border-border-focus"
                            value={suggestion.suggestedFsLineId}
                            onChange={(e) => {
                              const lineId = e.target.value;
                              if (lineId) {
                                handleAcceptSuggestion(suggestion, lineId);
                                setEditingSuggestionId(null);
                              }
                            }}
                            onBlur={() => setEditingSuggestionId(null)}
                            autoFocus
                          >
                            {Object.entries(lineItemsByStatement).map(([stmt, items]) => (
                              <optgroup key={stmt} label={stmt}>
                                {items.map((item) => (
                                  <option key={item.id} value={item.id}>{item.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        ) : !r.mappingReportingLineId ? (
                          /* Unmapped row WITHOUT a suggestion: manual dropdown */
                          <select
                            className="w-full max-w-[200px] px-2 py-1.5 rounded-input bg-input border border-border text-sm text-primary focus:outline-none focus:border-border-focus"
                            value=""
                            onChange={(e) => {
                              const opt = e.target.selectedOptions?.[0];
                              const id = opt?.value;
                              const name = opt?.text;
                              if (id && name) handleManualMap(r, id, name);
                            }}
                          >
                            <option value="">Select...</option>
                            {Object.entries(lineItemsByStatement).map(([stmt, items]) => (
                              <optgroup key={stmt} label={stmt}>
                                {items.map((item) => (
                                  <option key={item.id} value={item.id}>{item.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        ) : editingCode === r.accountCode ? (
                          /* Mapped row in edit mode */
                          <select
                            className="w-full max-w-[200px] px-2 py-1.5 rounded-input bg-input border border-border text-sm text-primary focus:outline-none focus:border-border-focus"
                            value={r.mappingReportingLineId ?? ''}
                            onChange={(e) => {
                              const opt = e.target.selectedOptions?.[0];
                              const id = opt?.value;
                              const name = opt?.text;
                              if (id && name) handleManualMap(r, id, name);
                              setEditingCode(null);
                            }}
                            onBlur={() => setEditingCode(null)}
                            autoFocus
                          >
                            {Object.entries(lineItemsByStatement).map(([stmt, items]) => (
                              <optgroup key={stmt} label={stmt}>
                                {items.map((item) => (
                                  <option key={item.id} value={item.id}>{item.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        ) : (
                          /* Mapped row: edit pencil */
                          <button
                            type="button"
                            className="p-1.5 rounded-input text-text-tertiary hover:text-primary hover:bg-hover"
                            onClick={() => setEditingCode(r.accountCode)}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center text-text-secondary text-sm">No accounts match filters.</div>
            )}
            </>
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="space-y-4">
          <div className="flex border-b border-border">
            <button
              type="button"
              className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px', rightTab === 'ai' ? 'text-accent border-accent' : 'text-text-secondary border-transparent')}
              onClick={() => setRightTab('ai')}
            >
              AI Suggestions {pendingSuggestions.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-ai-purple text-white text-[10px]">{pendingSuggestions.length}</span>}
            </button>
            <button
              type="button"
              className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px', rightTab === 'taxonomy' ? 'text-accent border-accent' : 'text-text-secondary border-transparent')}
              onClick={() => setRightTab('taxonomy')}
            >
              Taxonomy
            </button>
          </div>

          {rightTab === 'ai' && (
            <div className="space-y-4 border-l-4 border-ai-purple pl-4 bg-ai-purple-dim rounded-r-card py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ai-purple">AI Suggestions</span>
                <span className="text-xs text-text-tertiary">Advisory only</span>
              </div>

              {/* Generate button — shown when no suggestions and accounts are unmapped */}
              {!suggestionsLoading && coaSuggestions.length === 0 && unmappedCount > 0 && (
                <button
                  type="button"
                  disabled={generateMutation.isPending}
                  onClick={() => generateMutation.mutate(undefined)}
                  className="w-full px-3 py-2.5 rounded-input border border-ai-purple-border text-ai-purple text-sm font-medium hover:bg-ai-purple-dim flex items-center justify-center gap-2"
                >
                  {generateMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Generate AI Suggestions</>
                  )}
                </button>
              )}
              {generateMutation.isError && (
                <p className="text-status-red text-xs">Failed to generate suggestions. Try again.</p>
              )}

              {mappedCount === totalAccounts && totalAccounts > 0 ? (
                <p className="text-status-green text-sm">All accounts mapped. No suggestions needed.</p>
              ) : unmappedSuggestions.length === 0 && coaSuggestions.length > 0 ? (
                <p className="text-text-secondary text-sm">No pending suggestions for unmapped accounts.</p>
              ) : unmappedSuggestions.length > 0 ? (
                <>
                  {/* Bulk accept high-confidence */}
                  {highConfidenceSuggestions.length > 1 && (
                    <button
                      type="button"
                      className="w-full px-3 py-2 rounded-input border border-ai-purple-border text-ai-purple text-sm hover:bg-ai-purple-dim"
                      onClick={handleBulkAccept}
                    >
                      Accept all high-confidence ({highConfidenceSuggestions.length})
                    </button>
                  )}
                  {unmappedSuggestions.map((s) => (
                    <AISuggestionCard
                      key={s.id}
                      title="AI Suggested"
                      advisoryLabel=""
                      actions={
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busyIds.has(s.id)}
                            className="px-2 py-1 rounded text-xs bg-status-green-dim text-status-green border border-status-green/30 disabled:opacity-50"
                            onClick={() => handleAcceptSuggestion(s)}
                          >
                            {busyIds.has(s.id) ? 'Accepting...' : 'Accept'}
                          </button>
                          <button
                            type="button"
                            disabled={busyIds.has(s.id)}
                            className="px-2 py-1 rounded text-xs bg-status-red-dim text-status-red border border-status-red/30 disabled:opacity-50"
                            onClick={() => handleRejectSuggestion(s)}
                          >
                            Reject
                          </button>
                        </div>
                      }
                    >
                      <div>
                        <div className="font-medium">{s.accountCode} — {s.accountName}</div>
                        <div className="mt-1 text-xs">
                          Suggested: <span className="font-medium">{s.suggestedFsLineLabel ?? s.suggestedFsLineId}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn('px-1.5 py-0.5 rounded text-[10px] border', CONFIDENCE_BADGE[s.confidenceBand])}>
                            {s.confidenceBand.toUpperCase()} ({Math.round(s.confidence * 100)}%)
                          </span>
                        </div>
                        {s.alternatives.length > 0 && (
                          <div className="mt-1 text-[10px] text-text-tertiary">
                            Alt: {s.alternatives.slice(0, 2).map((a) => a.label).join(', ')}
                          </div>
                        )}
                      </div>
                    </AISuggestionCard>
                  ))}
                </>
              ) : null}
            </div>
          )}

          {rightTab === 'taxonomy' && (
            <div className="rounded-card border border-border p-3 max-h-[500px] overflow-y-auto">
              <TaxonomyTree
                nodes={taxonomy}
                selectedId={taxonomySelectedId}
                onSelect={setTaxonomySelectedId}
                rows={rows}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaxonomyTree({
  nodes,
  selectedId,
  onSelect,
  rows,
}: {
  nodes: TaxonomyNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  rows: TrialBalanceRow[];
}) {
  const countByLine = useMemo(() => {
    const map: Record<string, { count: number; balance: number }> = {};
    rows.forEach((r) => {
      if (r.mappingReportingLineId) {
        if (!map[r.mappingReportingLineId]) map[r.mappingReportingLineId] = { count: 0, balance: 0 };
        map[r.mappingReportingLineId].count += 1;
        map[r.mappingReportingLineId].balance += r.netBalance;
      }
    });
    return map;
  }, [rows]);

  return (
    <ul className="space-y-0.5 text-sm">
      {nodes.map((n) => (
        <li key={n.id}>
          {n.children?.length ? (
            <>
              <div className="font-medium text-text-secondary py-1">{n.label}</div>
              <ul className="pl-4 border-l border-border-light ml-1">
                <TaxonomyTree nodes={n.children} selectedId={selectedId} onSelect={onSelect} rows={rows} />
              </ul>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onSelect(selectedId === n.id ? null : n.id)}
              className={cn(
                'w-full text-left px-2 py-1.5 rounded-input flex items-center justify-between',
                selectedId === n.id ? 'bg-accent-dim text-accent' : 'hover:bg-hover text-primary'
              )}
            >
              <span>{n.label}</span>
              {countByLine[n.id] && (
                <span className="font-mono text-xs text-text-secondary">
                  {countByLine[n.id].count} acct · <MoneyCell value={countByLine[n.id].balance} />
                </span>
              )}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
