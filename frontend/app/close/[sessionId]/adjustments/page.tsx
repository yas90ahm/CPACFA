'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useAjeTemplates, useJournalEntries } from '@/lib/queries/adjustments';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { AdjustmentsTemplatesTab } from './AdjustmentsTemplatesTab';
import { AdjustmentsEntriesTab } from './AdjustmentsEntriesTab';
import { JournalEntryForm } from './JournalEntryForm';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { cn } from '@/lib/utils';
import type { JournalEntry, JournalEntryStatus, AJETemplate } from '@/lib/types/journal-entry';

const displayUser = (user: { userId: string; email?: string } | null) => user?.email ?? user?.userId ?? 'Unknown';

export default function AdjustmentsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const tab = searchParams.get('tab') === 'templates' ? 'templates' : 'entries';
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: templatesFromQuery = [] } = useAjeTemplates(sessionId);
  const { data: entriesFromQuery = [] } = useJournalEntries(sessionId);

  const proposeMutation = useMutation({
    mutationFn: (jeId: string) => apiFetch(`/api/close/journal-entries/${jeId}/propose`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (jeId: string) =>
      apiFetch(`/api/close/journal-entries/${jeId}/approve`, {
        method: 'POST',
        body: { approvedBy: displayUser(user) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['readiness'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ jeId, reason }: { jeId: string; reason: string }) =>
      apiFetch(`/api/close/journal-entries/${jeId}/reject`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });

  const postMutation = useMutation({
    mutationFn: (jeId: string) => apiFetch(`/api/close/journal-entries/${jeId}/post`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['readiness'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
    },
  });

  const [localTemplateSkips, setLocalTemplateSkips] = useState<Record<string, { reason: string }>>({});
  const [localAppliedTemplates, setLocalAppliedTemplates] = useState<Record<string, { resultingJeId: string }>>({});
  const [expandedJeId, setExpandedJeId] = useState<string | null>(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [slideOverMode, setSlideOverMode] = useState<'create' | 'edit' | 'view'>('create');
  const [slideOverJeId, setSlideOverJeId] = useState<string | null>(null);
  const [rejectJeId, setRejectJeId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [postConfirmJe, setPostConfirmJe] = useState<JournalEntry | null>(null);
  const [postSuccessJe, setPostSuccessJe] = useState<JournalEntry | null>(null);
  const [statusFilter, setStatusFilter] = useState<JournalEntryStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const templates = useMemo(() => {
    return templatesFromQuery.map((t) => {
      const skip = localTemplateSkips[t.id];
      if (skip) return { ...t, periodStatus: 'skipped' as const, skipReason: skip.reason, appliedOrSkippedBy: 'You', appliedOrSkippedAt: new Date().toISOString() };
      const applied = localAppliedTemplates[t.id];
      if (applied) return { ...t, periodStatus: 'applied' as const, resultingJeId: applied.resultingJeId, appliedOrSkippedBy: 'You', appliedOrSkippedAt: new Date().toISOString() };
      return t;
    });
  }, [templatesFromQuery, localTemplateSkips, localAppliedTemplates]);

  const nextJeNumber = useMemo(() => {
    const max = entriesFromQuery.length ? Math.max(...entriesFromQuery.map((e) => e.jeNumber)) : 1045;
    return max + 1;
  }, [entriesFromQuery]);

  const allEntries = useMemo(
    () => [...entriesFromQuery].sort((a, b) => b.jeNumber - a.jeNumber),
    [entriesFromQuery]
  );

  const draftCount = allEntries.filter((e) => e.status === 'draft').length;
  const proposedCount = allEntries.filter((e) => e.status === 'proposed').length;
  const approvedCount = allEntries.filter((e) => e.status === 'approved').length;
  const postedCount = allEntries.filter((e) => e.status === 'posted').length;
  const totalDebitImpact = useMemo(
    () => allEntries.filter((e) => e.status === 'posted').reduce((s, e) => s + e.lines.reduce((sum, l) => sum + l.debit, 0), 0),
    [allEntries]
  );
  const pendingTemplatesCount = templates.filter((t) => t.periodStatus === 'pending').length;

  const createDraftMutation = useMutation({
    mutationFn: (payload: { closeSessionId: string; memo: string; source: 'manual' | 'template'; lines: Array<{ accountRef: string; debit?: number; credit?: number; description?: string }>; templateId?: string | null }) =>
      apiFetch<JournalEntry>(`/api/close/journal-entries`, {
        method: 'POST',
        body: {
          closeSessionId: payload.closeSessionId,
          memo: payload.memo,
          source: payload.source,
          createdBy: displayUser(user),
          lines: payload.lines,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });

  const deleteJeMutation = useMutation({
    mutationFn: (jeId: string) => apiFetch(`/api/close/journal-entries/${jeId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
  const setTab = useCallback(
    (t: 'entries' | 'templates') => {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState({}, '', url.pathname + url.search);
    },
    []
  );

  const handleApplyTemplate = useCallback(
    (template: AJETemplate) => {
      createDraftMutation.mutate(
        {
          closeSessionId: sessionId,
          memo: template.name,
          source: 'template',
          lines: [
            { accountRef: template.debitAccountCode, debit: template.amount, credit: 0 },
            { accountRef: template.creditAccountCode, debit: 0, credit: template.amount },
          ],
        },
        {
          onSuccess: (je) => {
            setLocalAppliedTemplates((prev) => ({ ...prev, [template.id]: { resultingJeId: je.id } }));
            setTab('entries');
            setExpandedJeId(je.id);
            setSlideOverOpen(false);
          },
        }
      );
    },
    [sessionId, createDraftMutation, setTab]
  );

  const handleSkipTemplate = useCallback((templateId: string, reason: string) => {
    setLocalTemplateSkips((prev) => ({ ...prev, [templateId]: { reason } }));
  }, []);

  const handleUndoSkip = useCallback((templateId: string) => {
    setLocalTemplateSkips((prev) => {
      const next = { ...prev };
      delete next[templateId];
      return next;
    });
  }, []);

  const handleBulkApply = useCallback(async () => {
    const pending = templates.filter((t) => t.periodStatus === 'pending');
    const next = { ...localAppliedTemplates };
    for (const t of pending) {
      try {
        const je = await createDraftMutation.mutateAsync({
          closeSessionId: sessionId,
          memo: t.name,
          source: 'template',
          lines: [
            { accountRef: t.debitAccountCode, debit: t.amount, credit: 0 },
            { accountRef: t.creditAccountCode, debit: 0, credit: t.amount },
          ],
        });
        next[t.id] = { resultingJeId: (je as { id: string }).id };
      } catch (_) {
        // skip on error
      }
    }
    setLocalAppliedTemplates(next);
    setTab('entries');
    if (pending.length) setExpandedJeId((next[pending[0].id] as { resultingJeId: string })?.resultingJeId ?? null);
  }, [templates, sessionId, createDraftMutation, setTab, localAppliedTemplates]);

  const openCreate = useCallback(() => {
    setSlideOverMode('create');
    setSlideOverJeId(null);
    setSlideOverOpen(true);
  }, []);

  const openEdit = useCallback((je: JournalEntry) => {
    setSlideOverMode('edit');
    setSlideOverJeId(je.id);
    setSlideOverOpen(true);
  }, []);

  const openView = useCallback((je: JournalEntry) => {
    setSlideOverMode('view');
    setSlideOverJeId(je.id);
    setSlideOverOpen(true);
  }, []);

  const currentEntry = slideOverJeId ? allEntries.find((e) => e.id === slideOverJeId) ?? null : null;

  const handleSaveDraft = useCallback(
    (payload: Partial<JournalEntry> & { lines: JournalEntry['lines'] }) => {
      if (slideOverMode === 'create') {
        createDraftMutation.mutate(
          {
            closeSessionId: sessionId,
            memo: (payload.memo ?? '').trim(),
            source: 'manual',
            lines: (payload.lines ?? []).map((l) => ({
              accountRef: l.accountCode,
              debit: l.debit,
              credit: l.credit,
              description: l.description ?? undefined,
            })),
          },
          { onSuccess: () => setSlideOverOpen(false) }
        );
      } else {
        setSlideOverOpen(false);
      }
    },
    [slideOverMode, sessionId, createDraftMutation]
  );

  const handleSaveAndPropose = useCallback(
    (payload: Partial<JournalEntry> & { lines: JournalEntry['lines'] }) => {
      if (slideOverMode === 'create') {
        createDraftMutation.mutate(
          {
            closeSessionId: sessionId,
            memo: (payload.memo ?? '').trim(),
            source: 'manual',
            lines: (payload.lines ?? []).map((l) => ({
              accountRef: l.accountCode,
              debit: l.debit,
              credit: l.credit,
              description: l.description ?? undefined,
            })),
          },
          {
            onSuccess: async (je) => {
              const id = (je as { id: string }).id;
              try {
                await proposeMutation.mutateAsync(id);
              } finally {
                setSlideOverOpen(false);
              }
            },
          }
        );
      } else {
        setSlideOverOpen(false);
      }
    },
    [slideOverMode, sessionId, createDraftMutation, proposeMutation]
  );

  const handlePropose = useCallback((je: JournalEntry) => {
    if (je.status !== 'draft') return;
    proposeMutation.mutate(je.id);
    setSlideOverOpen(false);
  }, [proposeMutation]);

  const handleApprove = useCallback((je: JournalEntry) => {
    if (je.status !== 'proposed') return;
    approveMutation.mutate(je.id);
    setSlideOverOpen(false);
  }, [approveMutation]);

  const handleReject = useCallback((je: JournalEntry) => {
    setRejectJeId(je.id);
    setRejectReason('');
    setSlideOverOpen(false);
  }, []);

  const confirmReject = useCallback(() => {
    if (!rejectJeId || rejectReason.trim().length < 10) return;
    rejectMutation.mutate({ jeId: rejectJeId, reason: rejectReason.trim() }, {
      onSuccess: () => {
        setRejectJeId(null);
        setRejectReason('');
        setSlideOverOpen(false);
      },
    });
  }, [rejectJeId, rejectReason, rejectMutation]);

  const handlePost = useCallback((je: JournalEntry) => {
    setPostConfirmJe(je);
  }, []);

  const confirmPost = useCallback(() => {
    if (!postConfirmJe) return;
    postMutation.mutate(postConfirmJe.id, {
      onSuccess: () => {
        setPostSuccessJe(postConfirmJe);
        setPostConfirmJe(null);
        setSlideOverOpen(false);
      },
    });
  }, [postConfirmJe, postMutation]);

  const handleDelete = useCallback((je: JournalEntry) => {
    deleteJeMutation.mutate(je.id);
    setSlideOverOpen(false);
    setExpandedJeId((id) => (id === je.id ? null : id));
  }, [deleteJeMutation]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-primary">Adjusting Entries</h1>
        <p className="text-text-secondary text-sm mt-0.5">Templates and journal entries for this period</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 py-3 px-4 rounded-input bg-surface border border-border">
        <span className="text-text-secondary text-sm">Total Entries: {allEntries.length}</span>
        <span className="text-text-muted text-sm">Draft: {draftCount}</span>
        <span className="text-accent text-sm">Pending Approval: {proposedCount}</span>
        <span className="text-status-amber text-sm">Approved: {approvedCount}</span>
        <span className="text-status-green text-sm">Posted: {postedCount}</span>
        <span className="font-mono text-sm">Total Debit Impact: <MoneyCell value={totalDebitImpact} showDollar /></span>
        <span className={pendingTemplatesCount > 0 ? 'text-status-amber text-sm' : 'text-status-green text-sm'}>
          Templates: {pendingTemplatesCount > 0 ? `${pendingTemplatesCount} pending` : 'All resolved ✓'}
        </span>
      </div>

      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setTab('entries')}
          className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px', tab === 'entries' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-primary')}
        >
          Journal Entries
        </button>
        <button
          type="button"
          onClick={() => setTab('templates')}
          className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px', tab === 'templates' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-primary')}
        >
          Templates
        </button>
      </div>

      {tab === 'templates' && (
        <AdjustmentsTemplatesTab
          sessionId={sessionId}
          templates={templates}
          journalEntries={allEntries}
          onApplyTemplate={handleApplyTemplate}
          onSkipTemplate={handleSkipTemplate}
          onUndoSkip={handleUndoSkip}
          onBulkApply={handleBulkApply}
        />
      )}

      {tab === 'entries' && (
        <AdjustmentsEntriesTab
          sessionId={sessionId}
          entries={allEntries}
          expandedId={expandedJeId}
          onExpand={setExpandedJeId}
          onNewEntry={openCreate}
          onEdit={openEdit}
          onView={openView}
          onPropose={handlePropose}
          onApprove={handleApprove}
          onReject={handleReject}
          onPost={handlePost}
          onDelete={handleDelete}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          search={search}
          onSearchChange={setSearch}
        />
      )}

      <JournalEntryForm
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        mode={slideOverMode}
        entry={currentEntry}
        sessionId={sessionId}
        onSaveDraft={handleSaveDraft}
        onSaveAndPropose={handleSaveAndPropose}
        onApprove={handleApprove}
        onReject={handleReject}
        onPost={handlePost}
      />

      {rejectJeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRejectJeId(null)} />
          <div className="relative bg-surface border border-border rounded-card p-6 max-w-md w-full">
            <h3 className="font-display text-lg text-primary mb-2">Reason for rejection</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 rounded-input border border-border bg-input text-sm min-h-[80px]"
              placeholder="Min 10 characters…"
            />
            <div className="flex gap-2 mt-4">
              <button type="button" className="px-4 py-2 rounded-input border border-border text-sm" onClick={() => setRejectJeId(null)}>Cancel</button>
              <button type="button" className="px-4 py-2 rounded-input bg-status-red text-white text-sm" disabled={rejectReason.trim().length < 10} onClick={confirmReject}>Submit Rejection</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!postConfirmJe}
        onClose={() => setPostConfirmJe(null)}
        onConfirm={confirmPost}
        title={`Post Journal Entry #${postConfirmJe?.jeNumber}?`}
        message="This will:"
        detail={`• Update the adjusted trial balance\n• Mark financial statements as stale (regeneration required)\n• Refresh reconciliation GL balances\n• This action cannot be undone — posted entries are immutable`}
        confirmLabel="Post Entry"
      />

      {postSuccessJe && (
        <div className="fixed bottom-4 right-4 z-50 bg-surface border border-border rounded-card shadow-lg p-4 max-w-sm">
          <p className="font-medium text-status-green">✓ JE #{postSuccessJe.jeNumber} posted successfully</p>
          <p className="text-sm text-text-secondary mt-2">Cascade effects: Adjusted TB updated, statements marked stale, reconciliation GL balances refreshed.</p>
          <button type="button" className="mt-3 text-sm text-accent hover:underline" onClick={() => setPostSuccessJe(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
