'use client';

import { useParams } from 'next/navigation';
import React, { useMemo, useState, useCallback } from 'react';
import { useCloseSession } from '@/lib/queries/close-session';
import { useVariances } from '@/lib/queries/variance';
import { AISuggestionCard } from '@/components/shared/AISuggestionCard';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { parseMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { VarianceRecord } from '@/lib/types/variance';
import { Check, X, ChevronDown, ChevronRight } from 'lucide-react';

const STATEMENT_LABELS: Record<string, string> = {
  income_statement: 'IS',
  balance_sheet: 'BS',
  cash_flow: 'CF',
  equity: 'EQ',
};

function changeColor(
  statementType: string,
  lineItemName: string,
  changeAmount: string,
  changePercent: string
): 'favorable' | 'unfavorable' | 'neutral' {
  const num = parseFloat(changeAmount);
  const pct = parseFloat(changePercent);
  if (num === 0 && pct === 0) return 'neutral';
  const isRevenue = /revenue|income|sales/i.test(lineItemName) && statementType === 'income_statement';
  const isExpense = /cogs|expense|cost/i.test(lineItemName) && statementType === 'income_statement';
  if (isRevenue) return num > 0 ? 'favorable' : 'unfavorable';
  if (isExpense) return num > 0 ? 'unfavorable' : 'favorable';
  return 'neutral';
}

export default function VariancePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { data: session } = useCloseSession(sessionId);
  const { data: variances = [] } = useVariances(sessionId);

  const [materialOnly, setMaterialOnly] = useState(true);
  const [unexplainedOnly, setUnexplainedOnly] = useState(false);
  const [statementFilter, setStatementFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'changeAbs' | 'lineItem' | 'statement'>('changeAbs');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [localExplanations, setLocalExplanations] = useState<Record<string, string>>({});
  const [localDismissedAi, setLocalDismissedAi] = useState<Record<string, boolean>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = [...variances];
    if (materialOnly) list = list.filter((v) => v.isMaterial);
    if (unexplainedOnly) list = list.filter((v) => v.isMaterial && v.explanationStatus === 'pending');
    if (statementFilter) list = list.filter((v) => v.statementType === statementFilter);
    const mult = sortBy === 'changeAbs' ? -1 : 1;
    list.sort((a, b) => {
      if (sortBy === 'changeAbs') {
        return mult * (Math.abs(parseFloat(a.changeAmount)) - Math.abs(parseFloat(b.changeAmount)));
      }
      if (sortBy === 'lineItem') return mult * (a.lineItemName.localeCompare(b.lineItemName));
      return mult * (a.statementType.localeCompare(b.statementType));
    });
    return list;
  }, [variances, materialOnly, unexplainedOnly, statementFilter, sortBy]);

  const stats = useMemo(() => {
    const total = variances.length;
    const material = variances.filter((v) => v.isMaterial).length;
    const explained = variances.filter((v) => v.isMaterial && (v.explanationStatus === 'explained' || v.explanationStatus === 'approved')).length;
    const unexplained = variances.filter((v) => v.isMaterial && v.explanationStatus === 'pending').length;
    const approved = variances.filter((v) => v.isMaterial && v.explanationStatus === 'approved').length;
    return { total, material, explained, unexplained, approved };
  }, [variances]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleUseDraft = useCallback((id: string, draft: string) => {
    setLocalExplanations((prev) => ({ ...prev, [id]: draft }));
  }, []);

  const handleDismissDraft = useCallback((id: string) => {
    setLocalDismissedAi((prev) => ({ ...prev, [id]: true }));
  }, []);

  const handleSaveExplanation = useCallback((id: string, text: string) => {
    if (text.trim().length < 20) return;
    setSavedIds((prev) => new Set(prev).add(id));
    setLocalExplanations((prev) => ({ ...prev, [id]: text }));
  }, []);

  const handleApprove = useCallback((id: string) => {
    setApprovedIds((prev) => new Set(prev).add(id));
  }, []);

  const entityName = session?.entityName ?? 'Entity';
  const periodLabel = session?.periodLabel ?? 'Period';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display text-primary">Variance Analysis</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Period-over-period comparison — {periodLabel} vs Prior Period
        </p>
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-6 py-3 px-4 rounded-card border border-border bg-surface">
        <span className="text-sm text-text-secondary">Total Line Items Analyzed: <strong className="text-primary">{stats.total}</strong></span>
        <span className="text-sm text-text-secondary">Material Variances: <strong className="text-primary">{stats.material}</strong></span>
        <span className="text-sm text-status-green">Explained: <strong>{stats.explained}</strong></span>
        <span className={cn('text-sm', stats.unexplained > 0 ? 'text-status-red font-medium' : 'text-text-secondary')}>
          Unexplained: <strong>{stats.unexplained}</strong>
        </span>
        <span className="text-sm text-status-green">Approved: <strong>{stats.approved}</strong></span>
        <span className="text-xs text-text-muted">Material threshold: $50,000 or 10%</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={materialOnly} onChange={(e) => setMaterialOnly(e.target.checked)} />
          Material only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unexplainedOnly} onChange={(e) => setUnexplainedOnly(e.target.checked)} />
          Unexplained only
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Statement:</span>
          {['income_statement', 'balance_sheet', 'cash_flow', 'equity'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatementFilter((prev) => (prev === st ? null : st))}
              className={cn(
                'px-2.5 py-1 rounded-input text-xs font-medium border',
                statementFilter === st ? 'border-accent bg-accent-dim text-accent' : 'border-border text-text-secondary hover:bg-hover'
              )}
            >
              {STATEMENT_LABELS[st] ?? st}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'changeAbs' | 'lineItem' | 'statement')}
            className="rounded-input border border-border bg-input text-sm px-2 py-1"
          >
            <option value="changeAbs">Largest variance first</option>
            <option value="lineItem">Line item</option>
            <option value="statement">Statement</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt">
                <th className="w-10 py-2" />
                <th className="text-left py-2 px-3 font-medium text-text-secondary w-12">Statement</th>
                <th className="text-left py-2 px-3 font-medium text-text-secondary">Line Item</th>
                <th className="text-right py-2 px-3 font-medium text-text-secondary w-[140px]">Prior Period</th>
                <th className="text-right py-2 px-3 font-medium text-text-secondary w-[140px]">Current Period</th>
                <th className="text-right py-2 px-3 font-medium text-text-secondary w-[130px]">Change ($)</th>
                <th className="text-right py-2 px-3 font-medium text-text-secondary w-20">Change (%)</th>
                <th className="text-center py-2 px-2 font-medium text-text-secondary w-14">Material</th>
                <th className="text-center py-2 px-2 font-medium text-text-secondary w-20">Explanation</th>
                <th className="text-left py-2 px-3 font-medium text-text-secondary w-24">Approval</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const isExpanded = expandedId === v.id;
                const color = changeColor(v.statementType, v.lineItemName, v.changeAmount, v.changePercent);
                const displayExplanation = savedIds.has(v.id) ? (localExplanations[v.id] ?? v.explanation) : v.explanation;
                const displayStatus = approvedIds.has(v.id) ? 'approved' : savedIds.has(v.id) ? 'explained' : v.explanationStatus;
                const showAiDraft = v.isMaterial && v.explanationStatus === 'pending' && v.aiDraftExplanation && !localDismissedAi[v.id];

                return (
                  <React.Fragment key={v.id}>
                    <tr
                      className={cn(
                        'border-b border-border-light',
                        !v.isMaterial && 'opacity-70',
                        v.isMaterial && v.explanationStatus === 'pending' && 'bg-status-red/5'
                      )}
                    >
                      <td className="py-1.5 pl-2">
                        {v.isMaterial ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(v.id)}
                            className="p-0.5 rounded hover:bg-hover"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        ) : null}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-text-secondary">{STATEMENT_LABELS[v.statementType] ?? v.statementType}</td>
                      <td className="py-2 px-3 font-medium">{v.lineItemName}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        <MoneyCell value={parseMoney(v.priorAmount)} showDollar />
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        <MoneyCell value={parseMoney(v.currentAmount)} showDollar />
                      </td>
                      <td className={cn('py-2 px-3 text-right font-mono tabular-nums', color === 'favorable' && 'text-status-green', color === 'unfavorable' && 'text-status-red')}>
                        <MoneyCell value={parseMoney(v.changeAmount)} showDollar />
                      </td>
                      <td className={cn('py-2 px-3 text-right font-mono tabular-nums', color === 'favorable' && 'text-status-green', color === 'unfavorable' && 'text-status-red')}>
                        {v.changePercent}%
                      </td>
                      <td className="py-2 px-2 text-center">{v.isMaterial ? '●' : '—'}</td>
                      <td className="py-2 px-2 text-center">
                        {!v.isMaterial && '—'}
                        {v.isMaterial && displayStatus === 'approved' && <span className="text-status-green">✓</span>}
                        {v.isMaterial && (displayStatus === 'explained' || displayStatus === 'pending') && !savedIds.has(v.id) && v.explanationStatus === 'pending' && <span className="text-status-red">✗</span>}
                        {v.isMaterial && (displayStatus === 'explained' || savedIds.has(v.id)) && displayStatus !== 'approved' && <span className="text-status-green">✓</span>}
                      </td>
                      <td className="py-2 px-3">
                        {!v.isMaterial && <span className="text-text-muted">N/A</span>}
                        {v.isMaterial && displayStatus === 'pending' && !savedIds.has(v.id) && <span className="text-status-amber">Pending</span>}
                        {v.isMaterial && (displayStatus === 'explained' || savedIds.has(v.id)) && !approvedIds.has(v.id) && <span className="text-status-amber">Pending</span>}
                        {v.isMaterial && (displayStatus === 'approved' || approvedIds.has(v.id)) && <span className="text-status-green">Approved</span>}
                      </td>
                    </tr>
                    {isExpanded && v.isMaterial && (
                      <tr key={`${v.id}-detail`} className="border-b border-border-light bg-surface-alt/50">
                        <td colSpan={10} className="p-4">
                          <div className="space-y-4 max-w-3xl">
                            {!v.isMaterial ? (
                              <p className="text-sm text-text-tertiary">Below materiality threshold.</p>
                            ) : (
                              <>
                                {showAiDraft && (
                                  <AISuggestionCard
                                    title="✦ AI Draft — Review and Edit"
                                    advisoryLabel="Advisory only — do not auto-apply"
                                    actions={
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          className="px-3 py-1.5 rounded-input border border-accent text-accent text-sm hover:bg-accent-dim"
                                          onClick={() => handleUseDraft(v.id, v.aiDraftExplanation!)}
                                        >
                                          Use as Starting Point
                                        </button>
                                        <button
                                          type="button"
                                          className="px-3 py-1.5 rounded-input border border-border text-text-secondary text-sm hover:bg-hover"
                                          onClick={() => handleDismissDraft(v.id)}
                                        >
                                          Dismiss Draft
                                        </button>
                                      </div>
                                    }
                                  >
                                    <p className="whitespace-pre-wrap">{v.aiDraftExplanation}</p>
                                  </AISuggestionCard>
                                )}
                                <div>
                                  <label className="block text-xs font-medium text-text-secondary mb-1">
                                    Explanation {displayStatus === 'approved' ? '' : '(review and edit before saving)'}
                                  </label>
                                  {displayStatus === 'approved' || approvedIds.has(v.id) ? (
                                    <p className="text-sm text-primary rounded-input border border-border p-3 bg-input">{displayExplanation || '—'}</p>
                                  ) : (
                                    <textarea
                                      value={localExplanations[v.id] ?? displayExplanation ?? ''}
                                      onChange={(e) => setLocalExplanations((prev) => ({ ...prev, [v.id]: e.target.value }))}
                                      placeholder="Enter explanation (min 20 characters)"
                                      className="w-full min-h-[100px] px-3 py-2 rounded-input border border-border bg-input text-sm"
                                      rows={4}
                                    />
                                  )}
                                </div>
                                {displayStatus !== 'approved' && !approvedIds.has(v.id) && (
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      className="px-4 py-2 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                                      onClick={() => handleSaveExplanation(v.id, localExplanations[v.id] ?? displayExplanation ?? '')}
                                      disabled={((localExplanations[v.id] ?? displayExplanation ?? '').trim().length ?? 0) < 20}
                                    >
                                      Save Explanation
                                    </button>
                                    {savedIds.has(v.id) && (
                                      <button
                                        type="button"
                                        className="px-4 py-2 rounded-input border border-status-green text-status-green text-sm font-medium hover:bg-status-green-dim"
                                        onClick={() => handleApprove(v.id)}
                                      >
                                        Approve Explanation
                                      </button>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
