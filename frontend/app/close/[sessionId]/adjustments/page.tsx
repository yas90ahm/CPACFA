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
import { sumMoneyStrings } from '@/lib/money';
import type { JournalEntry, JournalEntryStatus, AJETemplate } from '@/lib/types/journal-entry';

const displayUser = (user: { userId: string; email?: string } | null) => user?.email ?? user?.userId ?? 'Unknown';

function useToast() {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const show = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), type === 'success' ? 3000 : 5000);
  }, []);
  return { toast, show };
}

export default function AdjustmentsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const tab = searchParams.get('tab') === 'templates' ? 'templates' : 'entries';
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast, show: showToast } = useToast();

  const { data: templatesFromQuery = [] } = useAjeTemplates(sessionId);
  const { data: entriesFromQuery = [] } = useJournalEntries(sessionId);

  const proposeMutation = useMutation({
    mutationFn: (jeId: string) => apiFetch(`/api/close/journal-entries/${jeId}/propose`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      showToast('success', 'Entry submitted for approval.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to propose entry'),
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
      showToast('success', 'Entry approved.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to approve entry'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ jeId, reason }: { jeId: string; reason: string }) =>
      apiFetch(`/api/close/journal-entries/${jeId}/reject`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      showToast('success', 'Entry rejected.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to reject entry'),
  });

  const postMutation = useMutation({
    mutationFn: (jeId: string) => apiFetch(`/api/close/journal-entries/${jeId}/post`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['readiness'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to post entry'),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: (params: { applicationId: string; closeSessionId: string }) =>
      apiFetch<{ jeId: string }>('/api/close/templates/apply', {
        method: 'POST',
        body: { applicationId: params.applicationId, closeSessionId: params.closeSessionId, createdBy: displayUser(user) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['readiness'] });
      showToast('success', 'Template applied.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to apply template'),
  });

  const skipTemplateMutation = useMutation({
    mutationFn: (params: { applicationId: string; closeSessionId: string; reason: string }) =>
      apiFetch('/api/close/templates/skip', {
        method: 'POST',
        body: params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['readiness'] });
      showToast('success', 'Template skipped.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to skip template'),
  });
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

  const templates = templatesFromQuery;

  // JE numbers are assigned by the backend — no frontend generation needed

  const allEntries = useMemo(
    () => [...entriesFromQuery].sort((a, b) => b.jeNumber - a.jeNumber),
    [entriesFromQuery]
  );

  const draftCount = allEntries.filter((e) => e.status === 'draft').length;
  const proposedCount = allEntries.filter((e) => e.status === 'proposed').length;
  const approvedCount = allEntries.filter((e) => e.status === 'approved').length;
  const postedCount = allEntries.filter((e) => e.status === 'posted').length;
  const totalDebitImpact = useMemo(
    () => sumMoneyStrings(allEntries.filter((e) => e.status === 'posted').flatMap((e) => e.lines.map((l) => l.debit))),
    [allEntries]
  );
  const pendingTemplatesCount = templates.filter((t) => t.periodStatus === 'pending').length;

  const createDraftMutation = useMutation({
    mutationFn: (payload: { closeSessionId: string; memo: string; source: 'manual' | 'template'; lines: Array<{ accountRef: string; debit?: string; credit?: string; description?: string }>; templateId?: string | null; reversalDate?: string | null }) =>
      apiFetch<JournalEntry>(`/api/close/journal-entries`, {
        method: 'POST',
        body: {
          closeSessionId: payload.closeSessionId,
          memo: payload.memo,
          source: payload.source,
          createdBy: displayUser(user),
          lines: payload.lines,
          ...(payload.reversalDate ? { reversalDate: payload.reversalDate } : {}),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      showToast('success', 'Draft created.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to create draft'),
  });

  const deleteJeMutation = useMutation({
    mutationFn: (jeId: string) => apiFetch(`/api/close/journal-entries/${jeId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      showToast('success', 'Entry deleted.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to delete entry'),
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
      applyTemplateMutation.mutate(
        { applicationId: template.id, closeSessionId: sessionId },
        {
          onSuccess: (result) => {
            setTab('entries');
            setExpandedJeId(result.jeId);
            setSlideOverOpen(false);
          },
        }
      );
    },
    [sessionId, applyTemplateMutation, setTab]
  );

  const handleSkipTemplate = useCallback((templateId: string, reason: string) => {
    skipTemplateMutation.mutate({ applicationId: templateId, closeSessionId: sessionId, reason });
  }, [skipTemplateMutation, sessionId]);

  const handleUndoSkip = useCallback((_templateId: string) => {
    // Backend does not support undo skip — re-fetch to get latest status
    queryClient.invalidateQueries({ queryKey: ['templates'] });
  }, [queryClient]);

  const handleBulkApply = useCallback(async () => {
    const pending = templates.filter((t) => t.periodStatus === 'pending');
    let firstJeId: string | null = null;
    for (const t of pending) {
      try {
        const result = await applyTemplateMutation.mutateAsync({ applicationId: t.id, closeSessionId: sessionId });
        if (!firstJeId) firstJeId = result.jeId;
      } catch {
        // skip on error, continue with remaining templates
      }
    }
    setTab('entries');
    if (firstJeId) setExpandedJeId(firstJeId);
  }, [templates, sessionId, applyTemplateMutation, setTab]);

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
            reversalDate: payload.reversalDate ?? null,
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
            reversalDate: payload.reversalDate ?? null,
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
        <h1 className="font-display text-2xl text-primary">Journal Entries</h1>
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
          <p className="font-medium text-status-green">JE #{postSuccessJe.jeNumber} posted successfully</p>
          <p className="text-sm text-text-secondary mt-2">Cascade effects: Adjusted TB updated, statements marked stale, reconciliation GL balances refreshed.</p>
          <button type="button" className="mt-3 text-sm text-accent hover:underline" onClick={() => setPostSuccessJe(null)}>Dismiss</button>
        </div>
      )}

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
    </div>
  );
}
