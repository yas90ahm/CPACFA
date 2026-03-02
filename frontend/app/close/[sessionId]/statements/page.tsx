'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCloseSession } from '@/lib/queries/close-session';
import { useStatements, useValidation } from '@/lib/queries/statements';
import { StatementTable } from './StatementTable';
import { EquityTable } from './EquityTable';
import { JournalEntryForm } from '../adjustments/JournalEntryForm';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { cn } from '@/lib/utils';
import type { JournalEntry } from '@/lib/types/journal-entry';
import { Check, X, AlertTriangle, Loader2, FileDown } from 'lucide-react';

const TABS = [
  { id: 'income-statement', label: 'Income Statement', href: 'income-statement' },
  { id: 'balance-sheet', label: 'Balance Sheet', href: 'balance-sheet' },
  { id: 'cash-flow', label: 'Cash Flow', href: 'cash-flow' },
  { id: 'equity', label: 'Stockholders\' Equity', href: 'equity' },
  { id: 'validation', label: 'Validation', href: 'validation' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function formatGeneratedAt(iso: string | null): string {
  if (!iso) return 'Not generated';
  const d = new Date(iso);
  return `Generated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function InlineValidation({ checks }: { checks: { id: string; name: string; passing: boolean; detail: string }[] }) {
  if (checks.length === 0) return null;
  return (
    <div className="mt-8 pt-6 border-t border-border print:mt-4 print:pt-2">
      <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">Validation</h3>
      <div className="space-y-1.5">
        {checks.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-sm">
            {c.passing ? (
              <Check className="w-4 h-4 text-status-green shrink-0" />
            ) : (
              <X className="w-4 h-4 text-status-red shrink-0" />
            )}
            <span className={c.passing ? 'text-text-secondary' : 'text-status-red'}>{c.name}</span>
            {c.detail && <span className="text-text-tertiary text-xs ml-1">({c.detail})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatementsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const tab = (searchParams.get('tab') as TabId) || 'income-statement';

  const { data: session } = useCloseSession(sessionId);
  const { data: statements } = useStatements(sessionId);
  const { data: validation } = useValidation(sessionId);

  const [generating, setGenerating] = useState(false);
  const [regenerateConfirm, setRegenerateConfirm] = useState(false);
  const [showPriorPeriod, setShowPriorPeriod] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [jePanelOpen, setJePanelOpen] = useState(false);
  const [jePanelEntry, setJePanelEntry] = useState<JournalEntry | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);

  const hasStatements = !!statements?.incomeStatement;
  const generatedAt = session?.statementsGeneratedAt ?? null;
  const isStale = session?.statementsStale ?? false;

  const setTab = useCallback(
    (t: TabId) => {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState({}, '', url.pathname + url.search);
    },
    []
  );

  const queryClient = useQueryClient();
  const { getAuthToken } = useAuth();

  const generateMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/statement-packages/generate`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['validation', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['close-session', sessionId] });
      setGenerating(false);
      setRegenerateConfirm(false);
      setToast({ type: 'success', message: 'Statements generated successfully.' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err: Error) => {
      setGenerating(false);
      setToast({ type: 'warning', message: err.message || 'Failed to generate statements' });
      setTimeout(() => setToast(null), 5000);
    },
  });

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    generateMutation.mutate();
  }, [generateMutation]);

  const handleExportPdf = useCallback(async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${baseUrl}/api/export/pdf`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ closeSessionId: sessionId, exportMode: 'draft' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error((err as { error?: string }).error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Draft_Financials.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast({ type: 'warning', message: err instanceof Error ? err.message : 'Export failed' });
    }
  }, [sessionId, getAuthToken]);

  const handleRegenerate = useCallback(() => {
    if (hasStatements) {
      setRegenerateConfirm(true);
    } else {
      handleGenerate();
    }
  }, [hasStatements, handleGenerate]);

  const handleConfirmRegenerate = useCallback(() => {
    setRegenerateConfirm(false);
    handleGenerate();
  }, [handleGenerate]);

  const openJeById = useCallback(async (jeId: string) => {
    try {
      const je = await apiFetch<JournalEntry>(`/api/close/journal-entries/${jeId}`);
      setJePanelEntry(je);
      setJePanelOpen(true);
    } catch {
      // JE not found or not accessible — ignore
    }
  }, []);

  const entityName = session?.entityName ?? 'Entity';
  const periodLabel = session?.periodLabel ?? 'Period';

  /** Derive "For the Period Ended ..." or "As of ..." date from session period. */
  const periodEndDisplay = (() => {
    if (!session?.periodEnd) return periodLabel;
    try {
      const d = new Date(session.periodEnd + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return periodLabel;
    }
  })();

  return (
    <div className="space-y-4 print:space-y-0">
      {/* Stale banner */}
      {isStale && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-card border border-status-amber bg-status-amber-dim print:hidden">
          <div className="flex items-center gap-2 text-status-amber font-medium">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            Statements are stale — changes were made after last generation. Last generated: {formatGeneratedAt(generatedAt)}.
          </div>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={generating}
            className="px-4 py-2 rounded-input bg-status-amber text-white text-sm font-medium hover:opacity-90 disabled:opacity-70 flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Regenerate Now
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:block">
        <div>
          <h1 className="text-2xl font-display text-primary">Financial Statements</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {periodLabel} — {entityName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          {generatedAt && (
            <span className="text-sm text-text-muted">{formatGeneratedAt(generatedAt)}</span>
          )}
          {isStale && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-status-amber-dim text-status-amber text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              Stale
            </span>
          )}
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={showPriorPeriod} onChange={(e) => setShowPriorPeriod(e.target.checked)} />
            Show prior period
          </label>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={showChanges} onChange={(e) => setShowChanges(e.target.checked)} />
            Show changes
          </label>
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3 py-1.5 rounded-input border border-border text-sm text-text-secondary hover:bg-hover print:hidden"
            aria-label="Export PDF"
          >
            <FileDown className="w-4 h-4 inline mr-1.5" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={generating}
            className={cn(
              'px-4 py-2 rounded-input text-sm font-medium flex items-center gap-2',
              !hasStatements || isStale
                ? 'bg-accent text-white hover:opacity-90'
                : 'border border-border text-primary hover:bg-hover',
              generating && 'opacity-70'
            )}
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {!hasStatements ? 'Generate Statements' : isStale ? 'Regenerate Statements' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border print:border-0 print:hidden">
        <nav className="flex gap-6" aria-label="Statement tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'pb-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.id ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-primary'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-surface border border-border rounded-card p-6 print:border-0 print:shadow-none print:p-0">
        {!hasStatements && tab !== 'validation' && (
          <div className="text-center py-12">
            <p className="text-lg font-medium text-primary mb-2">No statements generated yet</p>
            <p className="text-text-secondary text-sm mb-6 max-w-md mx-auto">
              Generate financial statements from your adjusted trial balance. All four statements (Income Statement, Balance Sheet, Cash Flow, Equity) will be produced.
            </p>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={generating}
              className="px-6 py-2.5 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-70 inline-flex items-center gap-2"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Generate Statements
            </button>
          </div>
        )}
        {tab === 'income-statement' && statements?.incomeStatement && (
          <>
            <div className="text-center mb-6 print:mb-4">
              <h2 className="text-lg font-display text-primary mb-1 print:mb-2">{entityName}</h2>
              <p className="text-sm font-medium text-primary">INCOME STATEMENT</p>
              <p className="text-sm text-text-secondary">For the Period Ended {periodEndDisplay}</p>
            </div>
            <StatementTable
              lines={statements.incomeStatement.lines}
              showPriorPeriod={showPriorPeriod}
              showChanges={showChanges}
              onOpenJeById={openJeById}
            />
            {validation && <InlineValidation checks={validation.checks} />}
          </>
        )}
        {tab === 'balance-sheet' && statements?.balanceSheet && (
          <>
            <div className="text-center mb-6 print:mb-4">
              <h2 className="text-lg font-display text-primary mb-1 print:mb-2">{entityName}</h2>
              <p className="text-sm font-medium text-primary">BALANCE SHEET</p>
              <p className="text-sm text-text-secondary">As of {periodEndDisplay}</p>
            </div>
            <StatementTable
              lines={statements.balanceSheet.lines}
              showPriorPeriod={showPriorPeriod}
              showChanges={showChanges}
              onOpenJeById={openJeById}
            />
            {validation && <InlineValidation checks={validation.checks} />}
          </>
        )}
        {tab === 'cash-flow' && statements?.cashFlow && (
          <>
            <div className="text-center mb-6 print:mb-4">
              <h2 className="text-lg font-display text-primary mb-1 print:mb-2">{entityName}</h2>
              <p className="text-sm font-medium text-primary">STATEMENT OF CASH FLOWS</p>
              <p className="text-sm text-text-secondary">For the Period Ended {periodEndDisplay}</p>
            </div>
            <StatementTable
              lines={statements.cashFlow.lines}
              showPriorPeriod={showPriorPeriod}
              showChanges={showChanges}
              onOpenJeById={openJeById}
            />
            {validation && <InlineValidation checks={validation.checks} />}
          </>
        )}
        {tab === 'equity' && statements?.equityColumnar && (
          <>
            <div className="text-center mb-6 print:mb-4">
              <h2 className="text-lg font-display text-primary mb-1 print:mb-2">{entityName}</h2>
              <p className="text-sm font-medium text-primary">STATEMENT OF STOCKHOLDERS&apos; EQUITY</p>
              <p className="text-sm text-text-secondary">For the Period Ended {periodEndDisplay}</p>
            </div>
            <EquityTable columns={statements.equityColumnar.columns} rows={statements.equityColumnar.rows} />
            {validation && <InlineValidation checks={validation.checks} />}
          </>
        )}
        {tab === 'validation' && validation && (
          <>
            <h2 className="text-lg font-display text-primary mb-4">Cross-Statement Validation</h2>
            {!validation.allPassing && (
              <div className="mb-4 p-4 rounded-card border border-status-red bg-status-red-dim text-status-red font-medium">
                2 validation checks failing — statements cannot be certified
              </div>
            )}
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-secondary">Check</th>
                  <th className="text-left py-2 font-medium text-text-secondary w-24">Status</th>
                  <th className="text-left py-2 font-medium text-text-secondary">Detail</th>
                </tr>
              </thead>
              <tbody>
                {validation.checks.map((c) => (
                  <tr key={c.id} className="border-b border-border-light">
                    <td className="py-2">{c.name}</td>
                    <td className="py-2">
                      {c.passing ? (
                        <span className="inline-flex items-center gap-1 text-status-green">
                          <Check className="w-4 h-4" /> Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-status-red">
                          <X className="w-4 h-4" /> Fail
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-text-secondary">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-4 right-4 px-4 py-3 rounded-card border text-sm font-medium z-50 print:hidden',
            toast.type === 'success' ? 'border-status-green bg-status-green-dim text-status-green' : 'border-status-amber bg-status-amber-dim text-status-amber'
          )}
        >
          {toast.message}
        </div>
      )}

      {/* Regenerate confirm */}
      <ConfirmDialog
        open={regenerateConfirm}
        onClose={() => setRegenerateConfirm(false)}
        onConfirm={handleConfirmRegenerate}
        title="Regenerate statements?"
        message="Regenerate all four statements? This will replace the current statements and re-run variance analysis."
        confirmLabel="Regenerate"
      />

      {/* JE detail panel */}
      {jePanelEntry && (
        <JournalEntryForm
          open={jePanelOpen}
          onClose={() => { setJePanelOpen(false); setJePanelEntry(null); }}
          mode="view"
          entry={{ ...jePanelEntry, sessionId }}
          sessionId={sessionId}
          onSaveDraft={() => {}}
        />
      )}
    </div>
  );
}
