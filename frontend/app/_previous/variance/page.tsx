'use client';

import { useParams } from 'next/navigation';
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCloseSession } from '@/lib/queries/close-session';
import { useVariances, useClassifyVariance } from '@/lib/queries/variance';
import type { VarianceClassification } from '@/lib/queries/variance';
import { useCumulativeVariances } from '@/lib/queries/cumulative';
import { useAuth } from '@/lib/auth';
import { AISuggestionCard } from '@/components/shared/AISuggestionCard';
import { AISuggestionBadge } from '@/components/shared/AISuggestionBadge';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { VarianceRecord } from '@/lib/types/variance';
import { InvestigationPanel } from '@/components/investigation/InvestigationPanel';
import { Check, X, ChevronDown, ChevronRight, Search, Loader2, Zap, Calendar, TrendingUp, FileDown } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ContinueToNextStep } from '@/components/shared/ContinueToNextStep';
import { canExplainVariance, canApproveVariance, isReadOnly as isRoleReadOnly } from '@/lib/permissions';

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

function colorStyle(color: 'favorable' | 'unfavorable' | 'neutral'): React.CSSProperties {
  if (color === 'favorable') return { color: 'var(--status-success)' };
  if (color === 'unfavorable') return { color: 'var(--status-error)' };
  return { color: 'var(--text-secondary)' };
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
  const role = user?.role ?? 'controller';
  const readOnly = isRoleReadOnly(role);
  const canExplain = canExplainVariance(role);
  const canApprove = canApproveVariance(role);
  const queryClient = useQueryClient();
  const [localExplanations, setLocalExplanations] = useState<Record<string, string>>({});
  const [localDismissedAi, setLocalDismissedAi] = useState<Record<string, boolean>>({});
  const [explanationSources, setExplanationSources] = useState<Record<string, 'manual' | 'ai_draft' | 'ai_edited'>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [investigatingVariance, setInvestigatingVariance] = useState<VarianceRecord | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [draftingAll, setDraftingAll] = useState(false);
  const [localClassifications, setLocalClassifications] = useState<Record<string, string>>({});
  const classifyMutation = useClassifyVariance(sessionId);
  const [variancePeriodView, setVariancePeriodView] = useState<VariancePeriodView>('current');
  const [comparisonType, setComparisonType] = useState<VarianceComparisonType>('prior_year_same_period');
  const { data: cumulativeVarData } = useCumulativeVariances(
    variancePeriodView !== 'current' ? sessionId : null,
    variancePeriodView !== 'current' ? variancePeriodView : null,
    comparisonType
  );

  // ─── Auto-save draft explanations ──────────────────────────────────────────
  const [draftSavedStatus, setDraftSavedStatus] = useState<Record<string, 'saving' | 'saved' | null>>({});
  const prevLocalExplanationsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    // Only auto-save entries that changed since the last render
    const changedEntries = Object.entries(localExplanations).filter(
      ([id, text]) => prevLocalExplanationsRef.current[id] !== text
    );
    if (changedEntries.length === 0) return;

    const timer = setTimeout(async () => {
      for (const [varianceId, text] of changedEntries) {
        if (text.trim().length >= 20) {
          setDraftSavedStatus(prev => ({ ...prev, [varianceId]: 'saving' }));
          try {
            await apiFetch(`/api/close/variances/${varianceId}/draft`, {
              method: 'PUT',
              body: { explanation: text },
            });
            setDraftSavedStatus(prev => ({ ...prev, [varianceId]: 'saved' }));
            setTimeout(() => setDraftSavedStatus(prev => ({ ...prev, [varianceId]: null })), 2000);
          } catch {
            setDraftSavedStatus(prev => ({ ...prev, [varianceId]: null }));
          }
        }
      }
      prevLocalExplanationsRef.current = { ...localExplanations };
    }, 2000);

    return () => clearTimeout(timer);
  }, [localExplanations]);

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

  const handleClassify = useCallback((varianceId: string, classification: string) => {
    setLocalClassifications((prev) => ({ ...prev, [varianceId]: classification }));
    classifyMutation.mutate({ varianceId, classification: classification as VarianceClassification });
  }, [classifyMutation]);

  const CLASSIFICATION_OPTIONS: VarianceClassification[] = ['Timing', 'Permanent', 'Volume', 'Price', 'Mix', 'Other'];

  const entityName = session?.entityName ?? 'Entity';
  const periodLabel = session?.periodLabel ?? 'Period';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display text-[var(--text-primary)]">
            Variance Analysis
          </h1>
          <p className="text-sm mt-0.5 text-[var(--text-secondary)]">
            {periodLabel} vs Prior Period
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              const token = typeof window !== 'undefined' ? localStorage.getItem('cpa_auth_token') : null;
              const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
              const res = await fetch(`${API_URL}/api/close/sessions/${sessionId}/export/variances.xlsx`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `variances-${sessionId}.xlsx`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="px-3 py-1.5 rounded-full text-sm transition-colors border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-table-row-hover)]"
          >
            <FileDown className="w-4 h-4 inline mr-1" />
            Export Excel
          </button>
        {canExplain && materialUnexplained.length > 0 && (
          <button
            type="button"
            onClick={handleDraftAll}
            disabled={draftingAll}
            className="px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2 bg-[var(--interactive-primary)] text-white rounded-[var(--radius-md)] transition-colors hover:bg-[var(--interactive-primary-hover)]"
          >
            {draftingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {draftingAll ? 'Drafting...' : `Draft All Explanations (${materialUnexplained.length})`}
          </button>
        )}
        </div>
      </div>

      {/* Period View Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-sm text-[var(--text-secondary)]">Period:</span>
          {(['current', 'QTD', 'YTD'] as const).map((pv) => (
            <button
              key={pv}
              type="button"
              onClick={() => setVariancePeriodView(pv)}
              className={cn(
                'px-3 py-1 text-sm rounded-[var(--radius-md)] transition-all duration-200',
                variancePeriodView === pv
                  ? 'bg-[var(--interactive-primary)] text-white'
                  : 'border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--interactive-primary)] hover:text-[var(--interactive-primary)]'
              )}
            >
              {pv === 'current' ? 'Current Period' : pv === 'QTD' ? 'Quarter-to-Date' : 'Year-to-Date'}
            </button>
          ))}
        </div>
        {variancePeriodView !== 'current' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)]">Compare:</span>
            <select
              value={comparisonType}
              onChange={(e) => setComparisonType(e.target.value as VarianceComparisonType)}
              className="text-sm px-2 py-1 border border-[var(--border-default)] rounded-[var(--radius-md)] bg-[var(--bg-surface-sunken)] transition-colors focus:border-[var(--border-focus)] focus:outline-none"
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
        <div className="p-3 text-sm rounded-[var(--radius-lg)] border border-[var(--interactive-primary)] bg-[rgba(59,130,246,0.05)] text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--interactive-primary)]">{cumulativeVarData.currentPeriodLabel}</span>{' '}
          vs <span className="font-medium">{cumulativeVarData.priorPeriodLabel || 'N/A'}</span>
          {' '}&mdash; {cumulativeVarData.note}
        </div>
      )}

      {/* Cumulative Variance Table */}
      {variancePeriodView !== 'current' && cumulativeVarData && cumulativeVarData.variances.length > 0 && (
        <div className="overflow-hidden border border-[var(--border-default)] rounded-[var(--radius-lg)] bg-[var(--bg-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr
                style={{
                  borderBottomWidth: '1px',
                  borderBottomStyle: 'solid',
                  borderBottomColor: 'var(--border-default)',
                  backgroundColor: 'var(--bg-surface-sunken)',
                }}
              >
                <th className="text-left py-2.5 px-3 font-medium text-[var(--text-secondary)]">Statement</th>
                <th className="text-left py-2.5 px-3 font-medium text-[var(--text-secondary)]">Line Item</th>
                <th className="text-right py-2.5 px-3 font-medium text-[var(--text-secondary)]">{cumulativeVarData.currentPeriodLabel}</th>
                <th className="text-right py-2.5 px-3 font-medium text-[var(--text-secondary)]">{cumulativeVarData.priorPeriodLabel || 'Prior'}</th>
                <th className="text-right py-2.5 px-3 font-medium text-[var(--text-secondary)]">Change ($)</th>
                <th className="text-right py-2.5 px-3 font-medium text-[var(--text-secondary)]">Change (%)</th>
                <th className="text-center py-2.5 px-3 font-medium text-[var(--text-secondary)]">Material</th>
              </tr>
            </thead>
            <tbody>
              {cumulativeVarData.variances.map((v) => (
                <tr
                  key={v.fsLineId}
                  className={cn(!v.isMaterial && 'opacity-60')}
                  style={{
                    borderBottomWidth: '1px',
                    borderBottomStyle: 'solid',
                    borderBottomColor: 'var(--border-subtle)',
                    ...(v.isMaterial ? { backgroundColor: 'var(--status-warning-bg)' } : {}),
                  }}
                >
                  <td className="py-2 px-3 text-xs uppercase text-[var(--text-tertiary)]">{v.statement.replace(/_/g, ' ')}</td>
                  <td className="py-2 px-3">{v.label}</td>
                  <td className="py-2 px-3 text-right font-mono">{fmtMoney(v.currentAmount, { dollar: true })}</td>
                  <td className="py-2 px-3 text-right font-mono">{fmtMoney(v.priorAmount, { dollar: true })}</td>
                  <td className="py-2 px-3 text-right font-mono">{fmtMoney(v.changeAmount, { dollar: true })}</td>
                  <td className="py-2 px-3 text-right font-mono">{v.changePercent != null ? `${fmtMoney(v.changePercent, { dash: false })}%` : '\u2014'}</td>
                  <td className="py-2 px-3 text-center">{v.isMaterial ? <span className="text-[var(--status-warning)]">&#x25CF;</span> : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-6 py-3 px-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
        <span className="text-sm text-[var(--text-secondary)]">
          {stats.explained} of {stats.material} explained ({stats.material ? Math.round((stats.explained / stats.material) * 100) : 0}%)
        </span>
        <div className="flex-1 min-w-[100px] max-w-[160px] h-2 rounded-full overflow-hidden bg-[var(--bg-surface-sunken)]">
          <div
            className="h-full rounded-full bg-[var(--interactive-primary)] transition-all duration-500 ease-out"
            style={{ width: `${stats.material ? Math.round((stats.explained / stats.material) * 100) : 0}%` }}
          />
        </div>
        <span className="text-sm text-[var(--status-success)]">Approved: <strong>{stats.approved}</strong></span>
        <span
          className={cn(
            'text-sm',
            stats.unexplained > 0 ? 'text-[var(--status-error)] font-medium' : 'text-[var(--text-secondary)]'
          )}
        >
          Need explanation: <strong>{stats.unexplained}</strong>
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
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
          <span className="text-sm text-[var(--text-secondary)]">Statement:</span>
          {['income_statement', 'balance_sheet', 'cash_flow', 'equity'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatementFilter((prev) => (prev === st ? null : st))}
              className={cn(
                'px-2.5 py-1 text-xs font-medium border rounded-[var(--radius-md)] transition-all duration-200',
                statementFilter === st
                  ? 'border-[var(--interactive-primary)] bg-[rgba(59,130,246,0.08)] text-[var(--interactive-primary)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--interactive-primary)] hover:text-[var(--interactive-primary)]'
              )}
            >
              {STATEMENT_LABELS[st] ?? st}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-secondary)]">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'changeAbs' | 'lineItem' | 'statement')}
            className="text-sm px-2 py-1 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface-sunken)] transition-colors focus:border-[var(--border-focus)] focus:outline-none"
          >
            <option value="changeAbs">Largest variance first</option>
            <option value="lineItem">Line item</option>
            <option value="statement">Statement</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {variances.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No variances to explain"
          description="Variances will appear here once statements are generated and prior period data is available."
          variant="prerequisite-missing"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No variances match the current filters"
          description="Try adjusting the filters above to see more results."
        />
      ) : (
      <div className="overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow duration-300">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr
                style={{
                  borderBottomWidth: '1px',
                  borderBottomStyle: 'solid',
                  borderBottomColor: 'var(--border-default)',
                  backgroundColor: 'var(--bg-surface-sunken)',
                }}
              >
                <th className="w-10 py-2" />
                <th className="text-left py-2 px-3 font-medium w-12 text-[var(--text-secondary)]">Statement</th>
                <th className="text-left py-2 px-3 font-medium text-[var(--text-secondary)]">Line Item</th>
                <th className="text-right py-2 px-3 font-medium w-[140px] text-[var(--text-secondary)]">Prior Period</th>
                <th className="text-right py-2 px-3 font-medium w-[140px] text-[var(--text-secondary)]">Current Period</th>
                <th className="text-right py-2 px-3 font-medium w-[130px] text-[var(--text-secondary)]">Change ($)</th>
                <th className="text-right py-2 px-3 font-medium w-20 text-[var(--text-secondary)]">Change (%)</th>
                <th className="text-center py-2 px-2 font-medium w-14 text-[var(--text-secondary)]">Material</th>
                <th className="text-center py-2 px-2 font-medium w-20 text-[var(--text-secondary)]">Explanation</th>
                <th className="text-left py-2 px-3 font-medium w-24 text-[var(--text-secondary)]">Approval</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const isExpanded = expandedId === v.id;
                const color = changeColor(v.statementType, v.lineItemName, v.changeAmount, v.changePercent);
                const displayExplanation = localExplanations[v.id] ?? v.explanation;
                const displayStatus = v.explanationStatus;
                const showAiDraft = v.isMaterial && v.explanationStatus === 'pending' && v.aiDraftExplanation && !localDismissedAi[v.id];
                const isMaterialPending = v.isMaterial && v.explanationStatus === 'pending';
                const isExplained = v.isMaterial && (v.explanationStatus === 'explained' || v.explanationStatus === 'approved');

                return (
                  <React.Fragment key={v.id}>
                    <tr
                      className={cn(!v.isMaterial && 'opacity-70')}
                      style={{
                        borderBottomWidth: '1px',
                        borderBottomStyle: 'solid',
                        borderBottomColor: 'var(--border-subtle)',
                        ...(isMaterialPending
                          ? {
                              borderLeft: '3px solid var(--status-error)',
                              backgroundColor: 'var(--status-error-bg)',
                            }
                          : isExplained
                          ? { borderLeft: '3px solid var(--status-success)' }
                          : {}),
                      }}
                    >
                      <td className="py-1.5 pl-2">
                        {v.isMaterial ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(v.id)}
                            className="p-0.5 rounded"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        ) : null}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-[var(--text-secondary)]">{STATEMENT_LABELS[v.statementType] ?? v.statementType}</td>
                      <td className="py-2 px-3 font-medium">{v.lineItemName}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        <MoneyCell value={v.priorAmount} showDollar />
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        <MoneyCell value={v.currentAmount} showDollar />
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums" style={colorStyle(color)}>
                        <MoneyCell value={v.changeAmount} showDollar />
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums" style={colorStyle(color)}>
                        {v.changePercent}%
                      </td>
                      <td className="py-2 px-2 text-center">{v.isMaterial ? '●' : '—'}</td>
                      <td className="py-2 px-2 text-center">
                        {!v.isMaterial && '—'}
                        {v.isMaterial && displayStatus === 'approved' && <span className="text-[var(--status-success)]">✓</span>}
                        {v.isMaterial && displayStatus === 'pending' && <span className="text-[var(--status-error)]">✗</span>}
                        {v.isMaterial && displayStatus === 'explained' && <span className="text-[var(--status-success)]">✓</span>}
                      </td>
                      <td className="py-2 px-3">
                        {!v.isMaterial && <span className="text-[var(--text-tertiary)]">N/A</span>}
                        {v.isMaterial && displayStatus === 'pending' && <span className="text-[var(--status-warning)]">Pending</span>}
                        {v.isMaterial && displayStatus === 'explained' && <span className="text-[var(--status-warning)]">Pending Approval</span>}
                        {v.isMaterial && displayStatus === 'approved' && <span className="text-[var(--status-success)]">Approved</span>}
                      </td>
                    </tr>
                    {isExpanded && v.isMaterial && (
                      <tr
                        key={`${v.id}-detail`}
                        style={{
                          borderBottomWidth: '1px',
                          borderBottomStyle: 'solid',
                          borderBottomColor: 'var(--border-subtle)',
                          backgroundColor: 'var(--bg-surface-sunken)',
                        }}
                      >
                        <td colSpan={10} className="p-4">
                          <div className="space-y-4 max-w-3xl">
                            {!v.isMaterial ? (
                              <p className="text-sm text-[var(--text-tertiary)]">Below materiality threshold.</p>
                            ) : (
                              <>
                                {/* Classification dropdown */}
                                <div className="flex flex-wrap items-center gap-4">
                                  <div>
                                    <label
                                      className="block text-xs font-medium mb-1 text-[var(--text-secondary)]"
                                    >
                                      Classification
                                    </label>
                                    <select
                                      value={localClassifications[v.id] ?? v.classification ?? ''}
                                      onChange={(e) => handleClassify(v.id, e.target.value)}
                                      className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface-sunken)] transition-colors focus:border-[var(--border-focus)] focus:outline-none disabled:opacity-60"
                                      disabled={readOnly || displayStatus === 'approved'}
                                    >
                                      <option value="">Select classification...</option>
                                      {CLASSIFICATION_OPTIONS.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                      ))}
                                    </select>
                                  </div>
                                  {v.fullYearImpact != null && (
                                    <div>
                                      <label
                                        className="block text-xs font-medium mb-1 text-[var(--text-secondary)]"
                                      >
                                        Full Year Impact
                                      </label>
                                      <div className="text-sm font-mono text-[var(--text-primary)]">
                                        If this trend continues: {fmtMoney(v.fullYearImpact, { dollar: true })} annual impact
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {showAiDraft && (
                                  <AISuggestionCard
                                    title={<><AISuggestionBadge label="AI Draft" confidence={v.aiConfidence ?? undefined} /> Review and Edit</>}
                                    advisoryLabel="Advisory only — do not auto-apply"
                                    actions={
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--ai-border)] text-[var(--ai-primary)] bg-[var(--ai-bg)] transition-colors hover:bg-[var(--ai-badge-bg)]"
                                          onClick={() => handleUseDraft(v.id, v.aiDraftExplanation!)}
                                        >
                                          Use as Starting Point
                                        </button>
                                        <button
                                          type="button"
                                          className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-table-row-hover)]"
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
                                  <label
                                    className="block text-xs font-medium mb-1 text-[var(--text-secondary)]"
                                  >
                                    Explanation {displayStatus === 'approved' ? '' : '(review and edit before saving)'}
                                  </label>
                                  {displayStatus === 'approved' ? (
                                    <p className="text-sm p-3 text-[var(--text-primary)] rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface-sunken)]">
                                      {displayExplanation || '—'}
                                    </p>
                                  ) : (
                                    <>
                                      <textarea
                                        value={localExplanations[v.id] ?? displayExplanation ?? ''}
                                        onChange={(e) => setLocalExplanations((prev) => ({ ...prev, [v.id]: e.target.value }))}
                                        placeholder="Enter explanation (min 20 characters)"
                                        className="w-full min-h-[100px] px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface-sunken)] transition-colors duration-200 focus:border-[var(--border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)]/20"
                                        rows={4}
                                      />
                                      <div className="flex items-center gap-2 mt-1">
                                        <p
                                          className="text-xs"
                                          style={{
                                            color: (localExplanations[v.id] ?? displayExplanation ?? '').trim().length >= 20
                                              ? 'var(--text-secondary)'
                                              : 'var(--status-error)',
                                          }}
                                        >
                                          {(localExplanations[v.id] ?? displayExplanation ?? '').trim().length}/20 min characters
                                        </p>
                                        {draftSavedStatus[v.id] === 'saving' && <span className="text-xs text-[var(--text-tertiary)]">Saving...</span>}
                                        {draftSavedStatus[v.id] === 'saved' && <span className="text-xs text-[var(--status-success)]">Draft saved</span>}
                                      </div>
                                    </>
                                  )}
                                </div>
                                {displayStatus !== 'approved' && !readOnly && (
                                  <div className="flex gap-2">
                                    {canExplain && displayStatus === 'pending' && (
                                      <button
                                        type="button"
                                        className="px-4 py-2 text-sm font-medium disabled:opacity-50 rounded-[var(--radius-md)] bg-[var(--interactive-primary)] text-white transition-colors hover:bg-[var(--interactive-primary-hover)]"
                                        onClick={() => handleSaveExplanation(v.id, localExplanations[v.id] ?? displayExplanation ?? '')}
                                        disabled={((localExplanations[v.id] ?? displayExplanation ?? '').trim().length ?? 0) < 20 || savingIds.has(v.id)}
                                      >
                                        {savingIds.has(v.id) ? 'Saving...' : 'Save Explanation'}
                                      </button>
                                    )}
                                    {canApprove && displayStatus === 'explained' && (
                                      <button
                                        type="button"
                                        className="px-4 py-2 text-sm font-medium disabled:opacity-50 rounded-[var(--radius-md)] border border-[var(--status-success)] text-[var(--status-success)] transition-colors hover:bg-[var(--status-success-bg)]"
                                        onClick={() => handleApprove(v.id)}
                                        disabled={approvingIds.has(v.id)}
                                      >
                                        {approvingIds.has(v.id) ? 'Approving...' : 'Approve Explanation'}
                                      </button>
                                    )}
                                    {canExplain && (
                                      <button
                                        type="button"
                                        className="px-4 py-2 text-sm font-medium flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] transition-colors hover:border-[var(--interactive-primary)] hover:text-[var(--interactive-primary)]"
                                        onClick={() => setInvestigatingVariance(v)}
                                      >
                                        <Search className="w-3.5 h-3.5" /> Investigate
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
      )}

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-4 right-4 px-4 py-3 text-sm font-medium z-50 rounded-[var(--radius-lg)] border shadow-[var(--shadow-md)] animate-in fade-in slide-in-from-bottom-2',
            toast.type === 'success'
              ? 'border-[var(--status-success)] bg-[var(--status-success-bg)] text-[var(--status-success)]'
              : 'border-[var(--status-error)] bg-[var(--status-error-bg)] text-[var(--status-error)]'
          )}
        >
          {toast.message}
        </div>
      )}

      <ContinueToNextStep
        currentStep="Variance Analysis"
        nextStep={{ label: 'Review', href: `/close/${sessionId}/review` }}
        gatesPassed={stats.material > 0 && stats.unexplained === 0}
        gateSummary={`All ${stats.material} material variances explained`}
      />

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
