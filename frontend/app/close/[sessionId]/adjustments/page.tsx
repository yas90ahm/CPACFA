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
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';
import { ContinueToNextStep } from '@/components/shared/ContinueToNextStep';
import { sumMoneyStrings } from '@/lib/money';
import { PenLine, CheckCircle2, XCircle } from 'lucide-react';
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

function ApprovalQueueGroup({
  title,
  entries,
  onApprove,
  onReject,
  isApproving,
}: {
  title: string;
  entries: JournalEntry[];
  onApprove: (je: JournalEntry) => void;
  onReject: (je: JournalEntry) => void;
  isApproving: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1">
      <h3
        className="text-xs font-semibold uppercase tracking-wide px-1 pb-1"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {title} ({entries.length})
      </h3>
      <div
        className="border divide-y"
        style={{
          borderColor: 'var(--border-default)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {entries.map((je) => {
          const totalDebit = sumMoneyStrings(je.lines.map((l) => l.debit));
          const truncatedMemo =
            je.memo.length > 60 ? je.memo.slice(0, 57) + '...' : je.memo;
          return (
            <div
              key={je.id}
              className="flex items-center gap-3 px-4 py-2.5 text-sm"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="font-mono text-xs shrink-0"
                style={{ color: 'var(--interactive-primary)' }}
              >
                JE-{String(je.jeNumber).padStart(3, '0')}
              </span>
              <span
                className="flex-1 truncate"
                style={{ color: 'var(--text-primary)' }}
                title={je.memo}
              >
                {truncatedMemo}
              </span>
              <span
                className="font-mono text-xs shrink-0"
                style={{ color: 'var(--text-primary)' }}
              >
                <MoneyCell value={totalDebit} showDollar />
              </span>
              <span
                className="text-xs shrink-0 max-w-[120px] truncate"
                style={{ color: 'var(--text-secondary)' }}
                title={je.createdBy}
              >
                {je.createdBy}
              </span>
              <span
                className="text-xs shrink-0"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {je.proposedAt
                  ? new Date(je.proposedAt).toLocaleDateString()
                  : ''}
              </span>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border transition-colors"
                  style={{
                    borderColor: 'var(--status-success)',
                    color: 'var(--status-success)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                  disabled={isApproving}
                  onClick={() => onApprove(je)}
                  title="Approve"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border transition-colors"
                  style={{
                    borderColor: 'var(--status-error)',
                    color: 'var(--status-error)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                  onClick={() => onReject(je)}
                  title="Reject"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ApprovalQueueTab({
  groups,
  onApprove,
  onReject,
  isApproving,
}: {
  groups: { recurring: JournalEntry[]; module: JournalEntry[]; manual: JournalEntry[] };
  onApprove: (je: JournalEntry) => void;
  onReject: (je: JournalEntry) => void;
  isApproving: boolean;
}) {
  const total = groups.recurring.length + groups.module.length + groups.manual.length;
  if (total === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No Entries Awaiting Your Approval"
        description="All proposed journal entries have been reviewed, or there are no entries you can approve (you cannot approve entries you created)."
      />
    );
  }
  return (
    <div className="space-y-4">
      <ApprovalQueueGroup
        title="Recurring Templates"
        entries={groups.recurring}
        onApprove={onApprove}
        onReject={onReject}
        isApproving={isApproving}
      />
      <ApprovalQueueGroup
        title="Module Entries"
        entries={groups.module}
        onApprove={onApprove}
        onReject={onReject}
        isApproving={isApproving}
      />
      <ApprovalQueueGroup
        title="Manual Entries"
        entries={groups.manual}
        onApprove={onApprove}
        onReject={onReject}
        isApproving={isApproving}
      />
    </div>
  );
}

export default function AdjustmentsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const rawTab = searchParams.get('tab');
  const tab = rawTab === 'templates' ? 'templates' : rawTab === 'approval' ? 'approval' : 'entries';
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

  const reversalMutation = useMutation({
    mutationFn: (jeId: string) =>
      apiFetch(`/api/close/journal-entries/${jeId}/reverse`, { method: 'POST' }).then(r => r as unknown as { id: string }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      queryClient.invalidateQueries({ queryKey: ['readiness'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      showToast('success', 'Reversing entry created.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to create reversing entry'),
  });

  const handleCreateReversal = useCallback((jeId: string) => {
    reversalMutation.mutate(jeId);
  }, [reversalMutation]);

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
    () => sumMoneyStrings(allEntries.filter((e) => e.status === 'posted').flatMap((e) => (e.lines ?? []).map((l) => l.debit))),
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
  const currentUserEmail = user?.email ?? user?.userId ?? '';

  const approvableEntries = useMemo(
    () => allEntries.filter(
      (je) => je.status === 'proposed' && je.createdBy !== currentUserEmail
    ),
    [allEntries, currentUserEmail]
  );

  const approvalGroups = useMemo(() => {
    const moduleKeywords = /prepaid|depreciation|interest|payroll|lease|inventory|cecl/i;
    const recurring: JournalEntry[] = [];
    const module: JournalEntry[] = [];
    const manual: JournalEntry[] = [];
    for (const je of approvableEntries) {
      if (je.source === 'template' || (je.templateId && je.templateId.length > 0)) {
        recurring.push(je);
      } else if (moduleKeywords.test(je.memo)) {
        module.push(je);
      } else {
        manual.push(je);
      }
    }
    return { recurring, module, manual };
  }, [approvableEntries]);

  const setTab = useCallback(
    (t: 'entries' | 'templates' | 'approval') => {
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

  const handleUndoSkip = useCallback(async (templateId: string) => {
    try {
      await apiFetch('/api/close/templates/undo-skip', {
        method: 'POST',
        body: { applicationId: templateId, closeSessionId: sessionId },
      });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    } catch (err) {
      console.error('Undo skip failed:', err);
    }
  }, [queryClient, sessionId]);

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
        <h1
          className="font-display text-2xl"
          style={{ color: 'var(--text-primary)' }}
        >
          Adjusting Journal Entries
        </h1>
        <p
          className="text-sm mt-0.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          Templates and journal entries for this period
        </p>
      </div>

      {allEntries.length === 0 && templates.length === 0 && (
        <EmptyState
          icon={PenLine}
          title="No adjusting entries yet"
          description="Recurring entries from your templates will appear here when proposed. You can also create manual entries."
          actionLabel="Create Entry"
          onAction={openCreate}
          variant="first-time"
        />
      )}

      {(allEntries.length > 0 || templates.length > 0) && (<>
      <div
        className="flex flex-wrap items-center gap-4 py-3 px-4 border"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <span
          className="text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          Total Entries: {allEntries.length}
        </span>
        <StatusBadge variant="neutral" label={`Draft: ${draftCount}`} size="sm" />
        <StatusBadge variant="warning" label={`Pending: ${proposedCount}`} size="sm" />
        <StatusBadge variant="success" label={`Approved: ${approvedCount}`} size="sm" />
        <StatusBadge status="complete" label={`Posted: ${postedCount}`} size="sm" />
        <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
          Total Debit Impact: <MoneyCell value={totalDebitImpact} showDollar />
        </span>
        <span
          className="text-sm"
          style={{ color: pendingTemplatesCount > 0 ? 'var(--status-warning)' : 'var(--status-success)' }}
        >
          Templates: {pendingTemplatesCount > 0 ? `${pendingTemplatesCount} pending` : 'All resolved \u2713'}
        </span>
      </div>

      <div
        className="flex border-b"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <button
          type="button"
          onClick={() => setTab('entries')}
          className="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
          style={{
            borderColor: tab === 'entries' ? 'var(--interactive-primary)' : 'transparent',
            color: tab === 'entries' ? 'var(--interactive-primary)' : 'var(--text-secondary)',
          }}
        >
          Journal Entries
        </button>
        <button
          type="button"
          onClick={() => setTab('templates')}
          className="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
          style={{
            borderColor: tab === 'templates' ? 'var(--interactive-primary)' : 'transparent',
            color: tab === 'templates' ? 'var(--interactive-primary)' : 'var(--text-secondary)',
          }}
        >
          Templates
        </button>
        <button
          type="button"
          onClick={() => setTab('approval')}
          className="px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2"
          style={{
            borderColor: tab === 'approval' ? 'var(--interactive-primary)' : 'transparent',
            color: tab === 'approval' ? 'var(--interactive-primary)' : 'var(--text-secondary)',
          }}
        >
          Approval Queue
          {approvableEntries.length > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[18px] px-1.5 py-0.5 text-xs font-medium tabular-nums rounded-full"
              style={{
                backgroundColor: 'var(--status-warning-bg)',
                color: 'var(--status-warning)',
              }}
            >
              {approvableEntries.length}
            </span>
          )}
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
          onReverse={handleCreateReversal}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          search={search}
          onSearchChange={setSearch}
        />
      )}

      {tab === 'approval' && (
        <ApprovalQueueTab
          groups={approvalGroups}
          onApprove={(je) => approveMutation.mutate(je.id)}
          onReject={(je) => {
            setRejectJeId(je.id);
            setRejectReason('');
          }}
          isApproving={approveMutation.isPending}
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
          <div
            className="fixed inset-0"
            style={{ backgroundColor: 'var(--bg-overlay)' }}
            onClick={() => setRejectJeId(null)}
          />
          <div
            className="relative p-6 max-w-md w-full border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <h3
              className="font-display text-lg mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Reason for rejection
            </h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 border text-sm min-h-[80px]"
              style={{
                borderColor: 'var(--border-default)',
                backgroundColor: 'var(--bg-surface-sunken)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
              }}
              placeholder="Min 10 characters..."
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 border text-sm"
                style={{
                  borderColor: 'var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                }}
                onClick={() => setRejectJeId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--status-error)',
                  color: '#fff',
                  borderRadius: 'var(--radius-md)',
                }}
                disabled={rejectReason.trim().length < 10}
                onClick={confirmReject}
              >
                Submit Rejection
              </button>
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
        detail={`\u2022 Update the adjusted trial balance\n\u2022 Mark financial statements as stale (regeneration required)\n\u2022 Refresh reconciliation GL balances\n\u2022 This action cannot be undone \u2014 posted entries are immutable`}
        confirmLabel="Post Entry"
      />

      {postSuccessJe && (
        <div
          className="fixed bottom-4 right-4 z-50 p-4 max-w-sm border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <p
            className="font-medium"
            style={{ color: 'var(--status-success)' }}
          >
            JE #{postSuccessJe.jeNumber} posted successfully
          </p>
          <p
            className="text-sm mt-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cascade effects: Adjusted TB updated, statements marked stale, reconciliation GL balances refreshed.
          </p>
          <button
            type="button"
            className="mt-3 text-sm hover:underline"
            style={{ color: 'var(--interactive-primary)' }}
            onClick={() => setPostSuccessJe(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <ContinueToNextStep
        currentStep="Adjustments"
        nextStep={{ label: 'Statements', href: `/close/${sessionId}/statements` }}
        gatesPassed={allEntries.length > 0 && draftCount === 0 && proposedCount === 0 && pendingTemplatesCount === 0}
        gateSummary={`All ${allEntries.length} journal entries resolved, ${postedCount} posted`}
      />

      {toast && (
        <div
          className="fixed bottom-4 right-4 px-4 py-3 border text-sm font-medium z-50"
          style={{
            borderRadius: 'var(--radius-lg)',
            borderColor: toast.type === 'success' ? 'var(--status-success)' : 'var(--status-error)',
            backgroundColor: toast.type === 'success' ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
            color: toast.type === 'success' ? 'var(--status-success)' : 'var(--status-error)',
          }}
        >
          {toast.message}
        </div>
      )}
      </>)}
    </div>
  );
}
