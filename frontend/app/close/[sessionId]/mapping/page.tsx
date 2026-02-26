'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTrialBalanceContext } from '../context/trial-balance-context';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { FilterBar } from '@/components/shared/FilterBar';
import { AISuggestionCard } from '@/components/shared/AISuggestionCard';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { TrialBalanceRow, AccountType } from '@/lib/types/trial-balance';
import { ChevronDown, Pencil, Check, X } from 'lucide-react';

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

/** AI suggestion from API. */
interface AIMappingSuggestion {
  id: string;
  accountCode: string;
  accountName: string;
  suggestedReportingLineId: string;
  suggestedReportingLineName: string;
  confidence: 'High' | 'Medium' | 'Low';
  reasoning: string;
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

const CONFIDENCE_STYLE: Record<'High' | 'Medium' | 'Low', string> = {
  High: 'text-status-green',
  Medium: 'text-status-amber',
  Low: 'text-status-red',
};

export default function MappingPage() {
  const p = useParams();
  const sessionId = p.sessionId as string;
  const searchParams = useSearchParams();
  const unmappedOnlyDefault = searchParams.get('unmapped') === '1';

  const { data: taxonomyData } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => apiFetch<{ lines: TaxonomyLine[] }>('/api/coa-mapping/taxonomy'),
  });
  const taxonomyLines = taxonomyData?.lines ?? [];
  const taxonomy = useMemo(() => buildTaxonomyTree(taxonomyLines), [taxonomyLines]);
  const taxonomyFlat = useMemo(() => flattenForSelect(taxonomyLines), [taxonomyLines]);

  const { data: suggestionsData } = useQuery({
    queryKey: ['ai-suggestions', sessionId],
    queryFn: () => apiFetch<{ suggestions: Array<{
      accountCode: string;
      accountName: string;
      suggestedLineItemId: string | null;
      suggestedLineItemName: string | null;
      confidence: string;
      reasoning: string;
    }> }>(`/api/coa-mapping/suggestions?sessionId=${sessionId}`),
    enabled: !!sessionId,
  });
  const aiSuggestionsRaw = suggestionsData?.suggestions ?? [];
  const aiSuggestions: AIMappingSuggestion[] = useMemo(
    () =>
      aiSuggestionsRaw
        .filter((s) => s.suggestedLineItemId != null)
        .map((s, i) => ({
          id: `sug-${s.accountCode}-${i}`,
          accountCode: s.accountCode,
          accountName: s.accountName,
          suggestedReportingLineId: s.suggestedLineItemId!,
          suggestedReportingLineName: s.suggestedLineItemName ?? s.suggestedLineItemId!,
          confidence: (s.confidence === 'high' ? 'High' : s.confidence === 'low' ? 'Low' : 'Medium') as 'High' | 'Medium' | 'Low',
          reasoning: s.reasoning,
        })),
    [aiSuggestionsRaw]
  );

  const { rows, setOverrides } = useTrialBalanceContext();
  const [search, setSearch] = useState('');
  const [typeFilters, setTypeFilters] = useState<Set<AccountType>>(new Set());
  const [unmappedOnly, setUnmappedOnly] = useState(unmappedOnlyDefault || rows.some((r) => !r.mappingReportingLineId));
  const [rightTab, setRightTab] = useState<'ai' | 'taxonomy'>('ai');
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [taxonomySelectedId, setTaxonomySelectedId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);

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

  const suggestions = useMemo(
    () => aiSuggestions.filter((s) => !dismissedSuggestions.has(s.id) && rows.some((r) => r.accountCode === s.accountCode && !r.mappingReportingLineId)),
    [aiSuggestions, dismissedSuggestions, rows]
  );
  const highConfidenceSuggestions = suggestions.filter((s) => s.confidence === 'High');

  const applySuggestion = (s: AIMappingSuggestion) => {
    setOverrides((prev) => ({ ...prev, [s.accountCode]: { lineId: s.suggestedReportingLineId, lineName: s.suggestedReportingLineName } }));
  };

  const dismissSuggestion = (id: string) => setDismissedSuggestions((prev) => new Set(prev).add(id));

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
            searchPlaceholder="Search by code or name…"
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
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary min-w-[180px]">Current Mapping</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary w-[140px]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
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
                        ) : (
                          <span className="text-status-red">Unmapped</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {!r.mappingReportingLineId ? (
                          <select
                            className="w-full max-w-[200px] px-2 py-1.5 rounded-input bg-input border border-border text-sm text-primary focus:outline-none focus:border-border-focus"
                            value=""
                            onChange={(e) => {
                              const opt = e.target.selectedOptions?.[0];
                              const id = opt?.value;
                              const name = opt?.text;
                              if (id && name) setOverrides((prev) => ({ ...prev, [r.accountCode]: { lineId: id, lineName: name } }));
                            }}
                          >
                            <option value="">Select…</option>
                            {Object.entries(lineItemsByStatement).map(([stmt, items]) => (
                              <optgroup key={stmt} label={stmt}>
                                {items.map((item) => (
                                  <option key={item.id} value={item.id}>{item.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        ) : editingCode === r.accountCode ? (
                          <select
                            className="w-full max-w-[200px] px-2 py-1.5 rounded-input bg-input border border-border text-sm text-primary focus:outline-none focus:border-border-focus"
                            value={r.mappingReportingLineId ?? ''}
                            onChange={(e) => {
                              const opt = e.target.selectedOptions?.[0];
                              const id = opt?.value;
                              const name = opt?.text;
                              if (id && name) setOverrides((prev) => ({ ...prev, [r.accountCode]: { lineId: id, lineName: name } }));
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
                  ))}
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

        <div className="space-y-4">
          <div className="flex border-b border-border">
            <button
              type="button"
              className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px', rightTab === 'ai' ? 'text-accent border-accent' : 'text-text-secondary border-transparent')}
              onClick={() => setRightTab('ai')}
            >
              AI Suggestions
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
                <span className="text-sm font-medium text-ai-purple">✦ AI Suggestions</span>
                <span className="text-xs text-text-tertiary">Advisory only — review before applying</span>
              </div>
              {mappedCount === totalAccounts && totalAccounts > 0 ? (
                <p className="text-status-green text-sm">✓ All accounts mapped. No suggestions needed.</p>
              ) : suggestions.length === 0 ? (
                <p className="text-text-secondary text-sm">No pending suggestions.</p>
              ) : (
                <>
                  {highConfidenceSuggestions.length > 0 && (
                    <button
                      type="button"
                      className="w-full px-3 py-2 rounded-input border border-ai-purple-border text-ai-purple text-sm hover:bg-ai-purple-dim"
                      onClick={() => highConfidenceSuggestions.forEach((s) => applySuggestion(s))}
                    >
                      Apply all high-confidence suggestions ({highConfidenceSuggestions.length})
                    </button>
                  )}
                  {suggestions.map((s) => (
                    <AISuggestionCard
                      key={s.id}
                      title="✦ AI Suggested"
                      advisoryLabel=""
                      actions={
                        <>
                          <button type="button" className="px-2 py-1 rounded text-xs bg-status-green-dim text-status-green border border-status-green/30" onClick={() => applySuggestion(s)}>Apply</button>
                          <button type="button" className="px-2 py-1 rounded text-xs bg-elevated text-text-secondary border border-border" onClick={() => dismissSuggestion(s.id)}>Dismiss</button>
                        </>
                      }
                    >
                      <div>
                        <div className="font-medium">Account: {s.accountCode} — {s.accountName}</div>
                        <div className="mt-1">Suggested: {s.suggestedReportingLineName}</div>
                        <div className={cn('text-xs mt-1', CONFIDENCE_STYLE[s.confidence])}>Confidence: {s.confidence}</div>
                        <div className="text-xs text-text-secondary mt-1">"{s.reasoning}"</div>
                      </div>
                    </AISuggestionCard>
                  ))}
                </>
              )}
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
