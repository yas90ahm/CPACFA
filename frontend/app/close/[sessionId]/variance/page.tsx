'use client';

import { useParams } from 'next/navigation';
import React, { useMemo, useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCloseSession } from '@/lib/queries/close-session';
import { useVariances } from '@/lib/queries/variance';
import { useCumulativeVariances } from '@/lib/queries/cumulative';
import { useAuth } from '@/lib/auth';
import { AISuggestionCard } from '@/components/shared/AISuggestionCard';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { VarianceRecord } from '@/lib/types/variance';
import { InvestigationPanel } from '@/components/investigation/InvestigationPanel';
import { Check, X, ChevronDown, ChevronRight, Search, Loader2, Zap, Calendar } from 'lucide-react';

type VariancePeriodView = 'current' | 'QTD' | 'YTD';
type VarianceComparisonType = 'prior_year_same_period' | 'sequential' | 'budget';

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
  const num = parseFloat(changeAmount || '0');
  const pct = parseFloat(changePercent || '0');
  if (isNaN(num) || isNaN(pct) || (num === 0 && pct === 0)) return 'neutral';
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [localExplanations, setLocalExplanations] = useState<Record<string, string>>({});
  const [localDismissedAi, setLocalDismissedAi] = useState<Record<string, boolean>>({});
  const [explanationSources, setExplanationSources] = useState<Record<string, 'manual' | 'ai_draft' | 'ai_edited'>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [investigatingVariance, setInvestigatingVariance] = useState<VarianceRecord | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [draftingAll, setDraftingAll] = useState(false);
  const [variancePeriodView, setVariancePeriodView] = useState<VariancePeriodView>('current');
  const [comparisonType, setComparisonType] = useState<VarianceComparisonType>('prior_year_same_period');
  const { data: cumulativeVarData } = useCumulativeVariances(
    variancePeriodView !== 'current' ? sessionId : null,
    variancePeriodView !== 'current' ? variancePeriodView : null,
    comparisonType
  );

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
    setExplanationSources((prev) => ({ ...prev, [id]: 'ai_draft' }));
  }, []);

  const handleDismissDraft = useCallback((id: string) => {
    setLocalDismissedAi((prev) => ({ ...prev, [id]: true }));
  }, []);

  const handleSaveExplanation = useCallback(async (id: string, text: string) => {
    if (text.trim().length < 20) return;
    setSavingIds((prev) => new Set(prev).add(id));
    // Determine source: if user started from AI draft and edited, it's ai_edited
    const baseSource = explanationSources[id] ?? 'manual';
    const source = baseSource === 'ai_draft' ? 'ai_draft' : baseSource === 'ai_edited' ? 'ai_edited' : 'manual';
    try {
      await apiFetch(`/api/close/variances/${id}/explain`, {
        method: 'POST',
        body: { explanation: text.trim(), explanation_source: source },
      });
      queryClient.invalidateQueries({ queryKey: ['variances', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['readiness', sessionId] });
      setToast({ type: 'success', message: 'Explanation saved.' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save explanation';
      setToast({ type: 'error', message: msg });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSavingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }, [sessionId, queryClient, explanationSources]);

  const handleApprove = useCallback(async (id: string) => {
    setApprovingIds((prev) => new Set(prev).add(id));
    try {
      await apiFetch(`/api/close/variances/${id}/approve`, {
        method: 'POST',
        body: {},
      });
      queryClient.invalidateQueries({ queryKey: ['variances', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['readiness', sessionId] });
      setToast({ type: 'success', message: 'Explanation approved.' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to approve explanation';
      setToast({ type: 'error', message: msg });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setApprovingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }, [sessionId, queryClient]);

  const materialUnexplained = useMemo(
    () => variances.filter((v) => v.isMaterial && v.explanationStatus === 'pending'),
    [variances]
  );

  const handleDraftAll = useCallback(async () => {
    setDraftingAll(true);
    let drafted = 0;
    try {
      for (const v of materialUnexplained) {
        // Use cached AI draft if available, otherwise fetch from API
        let draft = v.aiDraftExplanation;
        if (!draft) {
          try {
            const result = await apiFetch<{ draftExplanation: string | null }>(`/api/close/variances/${v.id}/ai-draft`);
            draft = result.draftExplanation;
          } catch {
            // Skip on error
          }
        }
        if (draft) {
          setLocalExplanations((prev) => ({ ...prev, [v.id]: draft! }));
          setExplanationSources((prev) => ({ ...prev, [v.id]: 'ai_draft' }));
          drafted++;
        }
      }
      setToast({ type: 'success', message: `Drafted ${drafted} explanation${drafted !== 1 ? 's' : ''}. Review and save each one.` });
      setTimeout(() => setToast(null), 5000);
      // Expand the first unexplained variance for review
      if (materialUnexplained.length > 0) setExpandedId(materialUnexplained[0].id);
    } catch {
      setToast({ type: 'error', message: 'Failed to draft explanations.' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setDraftingAll(false);
    }
  }, [materialUnexplained, apiFetch]);

  const entityName = session?.entityName ?? 'Entity';
  const periodLabel = session?.periodLabel ?? 'Period';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-primary">Variance Analysis</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {periodLabel} vs Prior Period
          </p>
        </div>
        {materialUnexplained.length > 0 && (
          <button
            type="button"
            onClick={handleDraftAll}
            disabled={draftingAll}
            className="px-4 py-2 rounded-input bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
          >
            {draftingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {draftingAll ? 'Drafting...' : `Draft All Explanations (${materialUnexplained.length})`}
          </button>
        )}
      </div>

      {/* Period View Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-text-secondary" />
          <span className="text-sm text-text-secondary">Period:</span>
          {(['current', 'QTD', 'YTD'] as const).map((pv) => (
            <button
              key={pv}
              type="button"
              onClick={() => setVariancePeriodView(pv)}
              className={cn(
                'px-3 py-1 text-sm rounded-md',
                variancePeriodView === pv ? 'bg-accent text-white' : 'border border-border text-text-secondary hover:bg-hover'
              )}
            >
              {pv === 'current' ? 'Current Period' : pv === 'QTD' ? 'Quarter-to-Date' : 'Year-to-Date'}
            </button>
          ))}
        </div>
        {variancePeriodView !== 'current' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">Compare:</span>
            <select
              value={comparisonType}
              onChange={(e) => setComparisonType(e.target.value as VarianceComparisonType)}
              className="text-sm border border-border rounded-input px-2 py-1"
            >
              <option value="prior_year_same_period">vs Prior Year</option>
              <option value="sequential">vs Prior Quarter/Period</option>
              <option value="budget" disabled>vs Budget (coming soon)</option>
            </select>
          </div>
        )}
      </div>

      {/* Cumulative Variance Note */}
      {variancePeriodView !== 'current' && cumulativeVarData && (
        <div className="p-3 rounded-card border border-accent/30 bg-accent/5 text-sm text-text-secondary">
          <span className="font-medium text-accent">{cumulativeVarData.currentPeriodLabel}</span>{' '}
          vs <span className="font-medium">{cumulativeVarData.priorPeriodLabel || 'N/A'}</span>
          {' '}&mdash; {cumulativeVarData.note}
        </div>
      )}

      {/* Cumulative Variance Table */}
      {variancePeriodView !== 'current' && cumulativeVarData && cumulativeVarData.variances.length > 0 && (
        <div className="border border-border rounded-card bg-surface overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-elevated/50">
                <th className="text-left py-2.5 px-3 font-medium text-text-secondary">Statement</th>
                <th className="text-left py-2.5 px-3 font-medium text-text-secondary">Line Item</th>
                <th className="text-right py-2.5 px-3 font-medium text-text-secondary">{cumulativeVarData.currentPeriodLabel}</th>
                <th className="text-right py-2.5 px-3 font-medium text-text-secondary">{cumulativeVarData.priorPeriodLabel || 'Prior'}</th>
                <th className="text-right py-2.5 px-3 font-medium text-text-secondary">Change ($)</th>
                <th className="text-right py-2.5 px-3 font-medium text-text-secondary">Change (%)</th>
                <th className="text-center py-2.5 px-3 font-medium text-text-secondary">Material</th>
              </tr>
            </thead>
            <tbody>
              {cumulativeVarData.variances.map((v) => (
                <tr key={v.fsLineId} className={cn('border-b border-border-light', v.isMaterial ? 'bg-status-amber/5' : 'opacity-60')}>
                  <td className="py-2 px-3 text-xs uppercase text-text-muted">{v.statement.replace(/_/g, ' ')}</td>
                  <td className="py-2 px-3">{v.label}</td>
                  <td className="py-2 px-3 text-right font-mono">{Number(v.currentAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-right font-mono">{Number(v.priorAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-right font-mono">{Number(v.changeAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 px-3 text-right font-mono">{v.changePercent != null ? `${Number(v.changePercent).toFixed(1)}%` : '\u2014'}</td>
                  <td className="py-2 px-3 text-center">{v.isMaterial ? <span className="text-status-amber">&#x25CF;</span> : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-6 py-3 px-4 rounded-card border border-border bg-surface">
        <span className="text-sm text-text-secondary">
          {stats.explained} of {stats.material} explained ({stats.material ? Math.round((stats.explained / stats.material) * 100) : 0}%)
        </span>
        <div className="flex-1 min-w-[100px] max-w-[160px] h-2 bg-elevated rounded-full overflow-hidden">
          <div className="h-full bg-status-green rounded-full transition-all" style={{ width: `${stats.material ? Math.round((stats.explained / stats.material) * 100) : 0}%` }} />
        </div>
        <span className="text-sm text-status-green">Approved: <strong>{stats.approved}</strong></span>
        <span className={cn('text-sm', stats.unexplained > 0 ? 'text-status-red font-medium' : 'text-text-secondary')}>
          Need explanation: <strong>{stats.unexplained}</strong>
        </span>
        <span className="text-xs text-text-muted">
          Threshold: {variances[0]?.materialityThreshold ? `$${parseFloat(variances[0].materialityThreshold).toLocaleString()} or 10%` : 'From settings'}
        </span>
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
      {variances.length === 0 ? (
        <div className="bg-surface border border-border rounded-card p-12 text-center">
          <p className="text-lg font-medium text-primary mb-2">No variance data yet</p>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            Variances are generated when financial statements are produced. Generate statements first, then return here to review period-over-period changes.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-card p-12 text-center">
          <p className="text-primary font-medium mb-1">No variances match the current filters</p>
          <p className="text-text-secondary text-sm">Try adjusting the filters above to see more results.</p>
        </div>
      ) : (
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
                const displayExplanation = localExplanations[v.id] ?? v.explanation;
                const displayStatus = v.explanationStatus;
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
                        <MoneyCell value={v.priorAmount} showDollar />
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        <MoneyCell value={v.currentAmount} showDollar />
                      </td>
                      <td className={cn('py-2 px-3 text-right font-mono tabular-nums', color === 'favorable' && 'text-status-green', color === 'unfavorable' && 'text-status-red')}>
                        <MoneyCell value={v.changeAmount} showDollar />
                      </td>
                      <td className={cn('py-2 px-3 text-right font-mono tabular-nums', color === 'favorable' && 'text-status-green', color === 'unfavorable' && 'text-status-red')}>
                        {v.changePercent}%
                      </td>
                      <td className="py-2 px-2 text-center">{v.isMaterial ? '●' : '—'}</td>
                      <td className="py-2 px-2 text-center">
                        {!v.isMaterial && '—'}
                        {v.isMaterial && displayStatus === 'approved' && <span className="text-status-green">✓</span>}
                        {v.isMaterial && displayStatus === 'pending' && <span className="text-status-red">✗</span>}
                        {v.isMaterial && displayStatus === 'explained' && <span className="text-status-green">✓</span>}
                      </td>
                      <td className="py-2 px-3">
                        {!v.isMaterial && <span className="text-text-muted">N/A</span>}
                        {v.isMaterial && displayStatus === 'pending' && <span className="text-status-amber">Pending</span>}
                        {v.isMaterial && displayStatus === 'explained' && <span className="text-status-amber">Pending Approval</span>}
                        {v.isMaterial && displayStatus === 'approved' && <span className="text-status-green">Approved</span>}
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
                                  {displayStatus === 'approved' ? (
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
                                {displayStatus !== 'approved' && (
                                  <div className="flex gap-2">
                                    {displayStatus === 'pending' && (
                                      <button
                                        type="button"
                                        className="px-4 py-2 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                                        onClick={() => handleSaveExplanation(v.id, localExplanations[v.id] ?? displayExplanation ?? '')}
                                        disabled={((localExplanations[v.id] ?? displayExplanation ?? '').trim().length ?? 0) < 20 || savingIds.has(v.id)}
                                      >
                                        {savingIds.has(v.id) ? 'Saving...' : 'Save Explanation'}
                                      </button>
                                    )}
                                    {displayStatus === 'explained' && (
                                      <button
                                        type="button"
                                        className="px-4 py-2 rounded-input border border-status-green text-status-green text-sm font-medium hover:bg-status-green-dim disabled:opacity-50"
                                        onClick={() => handleApprove(v.id)}
                                        disabled={approvingIds.has(v.id)}
                                      >
                                        {approvingIds.has(v.id) ? 'Approving...' : 'Approve Explanation'}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="px-4 py-2 rounded-input border border-border text-text-secondary text-sm font-medium hover:bg-hover flex items-center gap-1.5"
                                      onClick={() => setInvestigatingVariance(v)}
                                    >
                                      <Search className="w-3.5 h-3.5" /> Investigate
                                    </button>
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
      )}

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-4 right-4 px-4 py-3 rounded-card border text-sm font-medium z-50',
            toast.type === 'success' ? 'border-status-green bg-status-green-dim text-status-green' : 'border-status-red bg-status-red-dim text-status-red'
          )}
        >
          {toast.message}
        </div>
      )}

      <InvestigationPanel
        open={!!investigatingVariance}
        onClose={() => setInvestigatingVariance(null)}
        sessionId={sessionId}
        varianceId={investigatingVariance?.id ?? ''}
        fsLineId={investigatingVariance?.fsLineId ?? ''}
        lineItemLabel={investigatingVariance?.lineItemName ?? ''}
        currentPeriodId={sessionId}
        priorPeriodId={investigatingVariance?.priorPeriodId ?? sessionId}
        onUseExplanation={(text) => {
          if (investigatingVariance) {
            setLocalExplanations((prev) => ({ ...prev, [investigatingVariance.id]: text }));
            setExplanationSources((prev) => ({ ...prev, [investigatingVariance.id]: 'ai_draft' }));
            setExpandedId(investigatingVariance.id);
          }
        }}
      />
    </div>
  );
}
