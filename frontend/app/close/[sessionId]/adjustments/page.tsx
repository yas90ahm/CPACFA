'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useMemo, useCallback } from 'react';
import { useAjeTemplates, useJournalEntries } from '@/lib/queries/adjustments';
import { AdjustmentsTemplatesTab } from './AdjustmentsTemplatesTab';
import { AdjustmentsEntriesTab } from './AdjustmentsEntriesTab';
import { JournalEntryForm } from './JournalEntryForm';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { cn } from '@/lib/utils';
import type { JournalEntry, JournalEntryStatus, AJETemplate } from '@/lib/types/journal-entry';

export default function AdjustmentsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const tab = searchParams.get('tab') === 'templates' ? 'templates' : 'entries';

  const { data: templatesFromQuery = [] } = useAjeTemplates(sessionId);
  const { data: entriesFromQuery = [] } = useJournalEntries(sessionId);

  const [localTemplateSkips, setLocalTemplateSkips] = useState<Record<string, { reason: string }>>({});
  const [localAppliedTemplates, setLocalAppliedTemplates] = useState<Record<string, { resultingJeId: string }>>({});
  const [localDraftJEs, setLocalDraftJEs] = useState<JournalEntry[]>([]);
  const [localEntryPatches, setLocalEntryPatches] = useState<Record<string, Partial<JournalEntry> & { lines?: JournalEntry['lines'] }>>({});
  const [localDeletedJeIds, setLocalDeletedJeIds] = useState<string[]>([]);
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
    const all = [...entriesFromQuery, ...localDraftJEs];
    const max = all.length ? Math.max(...all.map((e) => e.jeNumber)) : 1045;
    return max + 1;
  }, [entriesFromQuery, localDraftJEs]);

  const allEntries = useMemo(() => {
    const combined = [...entriesFromQuery, ...localDraftJEs].filter((e) => !localDeletedJeIds.includes(e.id));
    const patched = combined.map((e) => {
      const patch = localEntryPatches[e.id];
      return patch ? { ...e, ...patch, lines: patch.lines ?? e.lines } : e;
    });
    return patched.sort((a, b) => b.jeNumber - a.jeNumber);
  }, [entriesFromQuery, localDraftJEs, localEntryPatches, localDeletedJeIds]);

  const draftCount = allEntries.filter((e) => e.status === 'draft').length;
  const proposedCount = allEntries.filter((e) => e.status === 'proposed').length;
  const approvedCount = allEntries.filter((e) => e.status === 'approved').length;
  const postedCount = allEntries.filter((e) => e.status === 'posted').length;
  const totalDebitImpact = useMemo(
    () => allEntries.filter((e) => e.status === 'posted').reduce((s, e) => s + e.lines.reduce((sum, l) => sum + l.debit, 0), 0),
    [allEntries]
  );
  const pendingTemplatesCount = templates.filter((t) => t.periodStatus === 'pending').length;

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
      const newJe: JournalEntry = {
        id: `je-local-${Date.now()}`,
        sessionId,
        jeNumber: nextJeNumber,
        date: '2026-01-31',
        memo: template.name,
        status: 'draft',
        source: 'template',
        templateId: template.id,
        templateName: template.name,
        lines: [
          { id: `l-${Date.now()}-1`, accountCode: template.debitAccountCode, accountName: template.debitAccountName, description: null, debit: template.amount, credit: 0 },
          { id: `l-${Date.now()}-2`, accountCode: template.creditAccountCode, accountName: template.creditAccountName, description: null, debit: 0, credit: template.amount },
        ],
        evidenceCount: 0,
        createdBy: 'Sarah Chen',
        createdAt: new Date().toISOString(),
        proposedBy: null,
        proposedAt: null,
        approvedBy: null,
        approvedAt: null,
        postedBy: null,
        postedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
      };
      setLocalDraftJEs((prev) => [...prev, newJe]);
      setLocalAppliedTemplates((prev) => ({ ...prev, [template.id]: { resultingJeId: newJe.id } }));
      setTab('entries');
      setExpandedJeId(newJe.id);
      setSlideOverOpen(false);
    },
    [sessionId, nextJeNumber, setTab]
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

  const handleBulkApply = useCallback(() => {
    const pending = templates.filter((t) => t.periodStatus === 'pending');
    let num = nextJeNumber;
    const newJEs: JournalEntry[] = pending.map((t) => {
      const je: JournalEntry = {
        id: `je-local-${Date.now()}-${t.id}`,
        sessionId,
        jeNumber: num++,
        date: '2026-01-31',
        memo: t.name,
        status: 'draft',
        source: 'template',
        templateId: t.id,
        templateName: t.name,
        lines: [
          { id: `l-${t.id}-1`, accountCode: t.debitAccountCode, accountName: t.debitAccountName, description: null, debit: t.amount, credit: 0 },
          { id: `l-${t.id}-2`, accountCode: t.creditAccountCode, accountName: t.creditAccountName, description: null, debit: 0, credit: t.amount },
        ],
        evidenceCount: 0,
        createdBy: 'Sarah Chen',
        createdAt: new Date().toISOString(),
        proposedBy: null,
        proposedAt: null,
        approvedBy: null,
        approvedAt: null,
        postedBy: null,
        postedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
      };
      return je;
    });
    setLocalDraftJEs((prev) => [...prev, ...newJEs]);
    setLocalAppliedTemplates((prev) => {
      const next = { ...prev };
      newJEs.forEach((j) => {
        if (j.templateId) next[j.templateId] = { resultingJeId: j.id };
      });
      return next;
    });
    setTab('entries');
    if (newJEs.length) setExpandedJeId(newJEs[0].id);
  }, [templates, sessionId, nextJeNumber, setTab]);

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
      if (slideOverMode === 'edit' && slideOverJeId) {
        if (slideOverJeId.startsWith('je-local-')) {
          setLocalDraftJEs((prev) =>
            prev.map((e) =>
              e.id === slideOverJeId ? { ...e, date: payload.date ?? e.date, memo: payload.memo ?? e.memo, lines: payload.lines ?? e.lines } : e
            )
          );
        } else {
          setLocalEntryPatches((prev) => ({ ...prev, [slideOverJeId]: { date: payload.date, memo: payload.memo, lines: payload.lines } }));
        }
      } else {
        const newJe: JournalEntry = {
          id: `je-local-${Date.now()}`,
          sessionId,
          jeNumber: nextJeNumber,
          date: payload.date ?? '2026-01-31',
          memo: payload.memo ?? '',
          status: 'draft',
          source: 'manual',
          templateId: null,
          templateName: null,
          lines: payload.lines ?? [],
          evidenceCount: 0,
          createdBy: 'Sarah Chen',
          createdAt: new Date().toISOString(),
          proposedBy: null,
          proposedAt: null,
          approvedBy: null,
          approvedAt: null,
          postedBy: null,
          postedAt: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
        };
        setLocalDraftJEs((prev) => [...prev, newJe]);
      }
      setSlideOverOpen(false);
    },
    [slideOverMode, slideOverJeId, sessionId, nextJeNumber]
  );

  const handleSaveAndPropose = useCallback(
    (payload: Partial<JournalEntry> & { lines: JournalEntry['lines'] }) => {
      if (slideOverMode === 'edit' && slideOverJeId) {
        if (slideOverJeId.startsWith('je-local-')) {
          setLocalDraftJEs((prev) =>
            prev.map((e) =>
              e.id === slideOverJeId ? { ...e, date: payload.date ?? e.date, memo: payload.memo ?? e.memo, lines: payload.lines ?? e.lines, status: 'proposed' as const, proposedBy: 'Sarah Chen', proposedAt: new Date().toISOString() } : e
            )
          );
        } else {
          setLocalEntryPatches((prev) => ({
            ...prev,
            [slideOverJeId]: { date: payload.date, memo: payload.memo, lines: payload.lines, status: 'proposed', proposedBy: 'Sarah Chen', proposedAt: new Date().toISOString() },
          }));
        }
      } else {
        const newJe: JournalEntry = {
          id: `je-local-${Date.now()}`,
          sessionId,
          jeNumber: nextJeNumber,
          date: payload.date ?? '2026-01-31',
          memo: payload.memo ?? '',
          status: 'proposed',
          source: 'manual',
          templateId: null,
          templateName: null,
          lines: payload.lines ?? [],
          evidenceCount: 0,
          createdBy: 'Sarah Chen',
          createdAt: new Date().toISOString(),
          proposedBy: 'Sarah Chen',
          proposedAt: new Date().toISOString(),
          approvedBy: null,
          approvedAt: null,
          postedBy: null,
          postedAt: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
        };
        setLocalDraftJEs((prev) => [...prev, newJe]);
      }
      setSlideOverOpen(false);
    },
    [slideOverMode, slideOverJeId, sessionId, nextJeNumber]
  );

  const handlePropose = useCallback((je: JournalEntry) => {
    if (je.status !== 'draft') return;
    if (je.id.startsWith('je-local-')) {
      setLocalDraftJEs((prev) => prev.map((e) => (e.id === je.id ? { ...e, status: 'proposed' as const, proposedBy: 'Sarah Chen', proposedAt: new Date().toISOString() } : e)));
    } else {
      setLocalEntryPatches((prev) => ({ ...prev, [je.id]: { ...prev[je.id], status: 'proposed', proposedBy: 'Sarah Chen', proposedAt: new Date().toISOString() } }));
    }
    setSlideOverOpen(false);
  }, []);

  const handleApprove = useCallback((je: JournalEntry) => {
    if (je.status !== 'proposed') return;
    if (je.id.startsWith('je-local-')) {
      setLocalDraftJEs((prev) => prev.map((e) => (e.id === je.id ? { ...e, status: 'approved' as const, approvedBy: 'Mike Torres', approvedAt: new Date().toISOString() } : e)));
    } else {
      setLocalEntryPatches((prev) => ({ ...prev, [je.id]: { ...prev[je.id], status: 'approved', approvedBy: 'Mike Torres', approvedAt: new Date().toISOString() } }));
    }
    setSlideOverOpen(false);
  }, []);

  const handleReject = useCallback((je: JournalEntry) => {
    setRejectJeId(je.id);
    setRejectReason('');
    setSlideOverOpen(false);
  }, []);

  const confirmReject = useCallback(() => {
    if (!rejectJeId || rejectReason.trim().length < 10) return;
    if (rejectJeId.startsWith('je-local-')) {
      setLocalDraftJEs((prev) =>
        prev.map((e) =>
          e.id === rejectJeId ? { ...e, status: 'rejected' as const, rejectedBy: 'Mike Torres', rejectedAt: new Date().toISOString(), rejectionReason: rejectReason.trim() } : e
        )
      );
    } else {
      setLocalEntryPatches((prev) => ({ ...prev, [rejectJeId]: { ...prev[rejectJeId], status: 'rejected', rejectedBy: 'Mike Torres', rejectedAt: new Date().toISOString(), rejectionReason: rejectReason.trim() } }));
    }
    setRejectJeId(null);
    setRejectReason('');
    setSlideOverOpen(false);
  }, [rejectJeId, rejectReason]);

  const handlePost = useCallback((je: JournalEntry) => {
    setPostConfirmJe(je);
  }, []);

  const confirmPost = useCallback(() => {
    if (!postConfirmJe) return;
    if (postConfirmJe.id.startsWith('je-local-')) {
      setLocalDraftJEs((prev) =>
        prev.map((e) => (e.id === postConfirmJe.id ? { ...e, status: 'posted' as const, postedBy: 'Sarah Chen', postedAt: new Date().toISOString() } : e))
      );
    } else {
      setLocalEntryPatches((prev) => ({ ...prev, [postConfirmJe.id]: { ...prev[postConfirmJe.id], status: 'posted', postedBy: 'Sarah Chen', postedAt: new Date().toISOString() } }));
    }
    setPostSuccessJe(postConfirmJe);
    setPostConfirmJe(null);
    setSlideOverOpen(false);
  }, [postConfirmJe]);

  const handleDelete = useCallback((je: JournalEntry) => {
    if (je.id.startsWith('je-local-')) {
      setLocalDraftJEs((prev) => prev.filter((e) => e.id !== je.id));
    } else {
      setLocalDeletedJeIds((prev) => (prev.includes(je.id) ? prev : [...prev, je.id]));
    }
    setSlideOverOpen(false);
    setExpandedJeId((id) => (id === je.id ? null : id));
  }, []);

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
