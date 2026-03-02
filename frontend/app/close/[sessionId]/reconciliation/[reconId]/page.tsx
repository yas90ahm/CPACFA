'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useReconciliations, useReconciliation } from '@/lib/queries/reconciliations';
import { useCloseSession } from '@/lib/queries/close-session';
import { useAuth } from '@/lib/auth';
import { apiFetch, apiUpload } from '@/lib/api';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { moneyAbs, sumMoneyStrings, fmtMoney } from '@/lib/money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FileUpload } from '@/components/shared/FileUpload';
import { FileList } from '@/components/shared/FileList';
import { cn } from '@/lib/utils';
import type {
  Reconciliation,
  ReconcilingItem,
  ReconcilingItemType,
  ReconStatus,
} from '@/lib/types/reconciliation';
import type { EvidenceFile } from '@/lib/types/evidence';
import { ChevronLeft, ChevronRight, Pencil, Check, Paperclip, Edit2, Trash2 } from 'lucide-react';

const STATUS_LABEL: Record<ReconStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  approved: 'Approved',
};
const STATUS_BADGE: Record<ReconStatus, 'neutral' | 'info' | 'warning' | 'success'> = {
  not_started: 'neutral',
  in_progress: 'info',
  completed: 'warning',
  approved: 'success',
};

const ITEM_TYPES: ReconcilingItemType[] = [
  'Outstanding Check',
  'Deposit in Transit',
  'Bank Fee',
  'Timing Difference',
  'Error Correction',
  'Accrual',
  'Amortization',
  'Depreciation',
  'Addition',
  'Disposal',
  'Reclassification',
  'Write-off',
  'Payment',
  'Collection',
  'Intercompany',
  'Other',
];

const STATUS_ORDER: ReconStatus[] = ['not_started', 'in_progress', 'completed', 'approved'];

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function formatDateTime(d: string): string {
  return new Date(d).toLocaleString();
}

export default function ReconDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionId = params.sessionId as string;
  const reconId = params.reconId as string;
  const { user } = useAuth();

  const { data: session } = useCloseSession(sessionId);
  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: reconData } = useReconciliation(sessionId, reconId);
  const recon = reconData?.reconciliation ?? null;
  const baseItems = reconData?.items ?? [];

  const { data: evidenceData } = useQuery({
    queryKey: ['recon-evidence', sessionId, reconId],
    queryFn: () =>
      apiFetch<{ attachments: Array<{ id: string; originalFilename?: string; label?: string; sizeBytes?: number; mimeType?: string; hashSha256?: string; attachedBy?: string; attachedAt?: string }> }>(
        `/api/close/sessions/${sessionId}/reconciliations/${reconId}/evidence`
      ),
    enabled: !!sessionId && !!reconId,
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/complete`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
  });
  const approveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/approve`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/reject`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
  });
  const uploadEvidenceMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiUpload(
        `/api/close/sessions/${sessionId}/reconciliations/${reconId}/evidence`,
        formData
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-evidence', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
    },
  });

  const sortedIds = useMemo(() => {
    const copy = [...reconciliations].sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a.status);
      const ib = STATUS_ORDER.indexOf(b.status);
      return ia - ib;
    });
    return copy.map((r) => r.id);
  }, [reconciliations]);

  const idx = sortedIds.indexOf(reconId);
  const prevId = idx > 0 ? sortedIds[idx - 1] : null;
  const nextId = idx >= 0 && idx < sortedIds.length - 1 ? sortedIds[idx + 1] : null;

  const [supportingBalanceLocal, setSupportingBalanceLocal] = useState<string | null>(null);
  const [notesLocal, setNotesLocal] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemDesc, setAddItemDesc] = useState('');
  const [addItemAmt, setAddItemAmt] = useState<string | null>(null);
  const [addItemType, setAddItemType] = useState<ReconcilingItemType>('Outstanding Check');
  const [addItemDate, setAddItemDate] = useState('');
  const [localEvidence, setLocalEvidence] = useState<EvidenceFile[]>([]);
  const [editingSupporting, setEditingSupporting] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [savingSupporting, setSavingSupporting] = useState(false);

  /* ── Supporting Balance Mutation ── */
  const supportingBalanceMutation = useMutation({
    mutationFn: (amount: string) =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/supporting-balance`, {
        method: 'POST',
        body: { amount },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
      setSupportingBalanceLocal(null);
      setEditingSupporting(false);
      setSavingSupporting(false);
    },
    onError: () => setSavingSupporting(false),
  });

  /* ── Add Reconciling Item Mutation ── */
  const addItemMutation = useMutation({
    mutationFn: (params: { description: string; amount: string; item_type: string }) =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/items`, {
        method: 'POST',
        body: params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
      setAddItemDesc('');
      setAddItemAmt(null);
      setAddItemType('Outstanding Check');
      setAddItemDate('');
      setShowAddItem(false);
    },
  });

  /* ── Delete Reconciling Item Mutation ── */
  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/items/${itemId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
  });

  /* ── Activity Log (audit log) ── */
  const { data: activityData } = useQuery({
    queryKey: ['recon-activity', reconId],
    queryFn: () =>
      apiFetch<{
        entries: Array<{
          id: string;
          timestamp: string;
          actor: string;
          action: string;
          resource?: string;
          detail?: string;
        }>;
      }>(`/api/close/audit-log`, {
        params: { resource: `reconciliation:${reconId}` },
      }),
    enabled: !!reconId,
  });

  const activity: Array<{ id: string; user: string; description: string; timestamp: string }> = useMemo(
    () =>
      (activityData?.entries ?? []).map((e) => ({
        id: e.id,
        user: e.actor,
        description: [e.action, e.detail].filter(Boolean).join(' — '),
        timestamp: e.timestamp,
      })),
    [activityData]
  );

  /* ── Save Notes Mutation (via audit log) ── */
  const saveNotesMutation = useMutation({
    mutationFn: (notes: string) =>
      apiFetch(`/api/close/audit-log`, {
        method: 'POST',
        body: {
          actor: user?.email ?? user?.userId ?? 'unknown',
          action: 'recon_notes_updated',
          resource: `reconciliation:${reconId}`,
          detail: notes,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-activity', reconId] });
    },
  });

  const handleNotesBlur = useCallback(() => {
    const trimmed = notesLocal.trim();
    const existing = (recon?.notes ?? '').trim();
    if (trimmed && trimmed !== existing) {
      saveNotesMutation.mutate(trimmed);
    }
  }, [notesLocal, recon?.notes, saveNotesMutation]);

  const evidenceFromApi: EvidenceFile[] = useMemo(
    () =>
      (evidenceData?.attachments ?? []).map((a) => ({
        id: a.id,
        fileName: a.originalFilename ?? a.label ?? 'evidence',
        fileSize: a.sizeBytes ?? 0,
        mimeType: a.mimeType ?? '',
        uploadedBy: a.attachedBy ?? 'Unknown',
        uploadedAt: a.attachedAt ?? '',
        sha256Hash: a.hashSha256 ?? '',
        downloadUrl: '#',
      })),
    [evidenceData]
  );
  const evidence = [...evidenceFromApi, ...localEvidence];
  const items = baseItems;

  // Supporting balance: use local edit if present, otherwise backend value
  const hasUnsavedSupporting = supportingBalanceLocal != null && supportingBalanceLocal.trim() !== '';
  const hasSupportingBalance = recon?.supportingBalance != null;
  const supportingDisplay = supportingBalanceLocal ?? (recon?.supportingBalance ?? null);
  const notesDisplay = notesLocal !== '' ? notesLocal : (recon?.notes ?? '');
  const isCompleted = recon?.status === 'completed' || recon?.status === 'approved';
  const isApproved = recon?.status === 'approved';
  const isPreparer = recon?.preparer != null && (user?.userId === recon.preparer || user?.email === recon.preparer);
  // SoD: A user is only a valid reviewer if a preparer exists AND current user is NOT that preparer.
  // If preparer is null (nobody has completed it yet), nobody can approve.
  const isReviewer = recon?.preparer != null && !isPreparer;
  // Defense-in-depth: disable approve button for the preparer even if UI logic shows it
  const canApproveOwn = isPreparer;
  const periodEnd = session?.periodEnd ?? session?.createdAt ?? null;
  const periodEndDisplay = periodEnd ? new Date(periodEnd).toISOString().slice(0, 10) : '—';

  // Use backend-computed values (Decimal.js + NUMERIC) — never recalculate in JavaScript.
  // moneyAbs() is parseFloat-based but only used for UI display decisions (color, sort), not financial computation.
  const toleranceVal = moneyAbs(recon?.tolerance);
  const displayItemsTotal = sumMoneyStrings(items.map(i => i.amount));
  // Backend-authoritative values for variance/unexplained
  const backendVariance = recon?.variance ?? null;
  const backendUnexplained = recon?.unexplainedVariance ?? null;
  const withinTolerance = hasSupportingBalance && backendUnexplained != null && moneyAbs(backendUnexplained) <= toleranceVal;
  const overTolerance = hasSupportingBalance && backendUnexplained != null && moneyAbs(backendUnexplained) > toleranceVal;

  // Completeness gate uses ONLY backend-computed values — no JS floating-point arithmetic.
  // User must save supporting balance first (no unsaved local edits).
  const canMarkComplete =
    recon &&
    (recon.status === 'not_started' || recon.status === 'in_progress') &&
    hasSupportingBalance &&
    !hasUnsavedSupporting &&
    backendUnexplained != null &&
    moneyAbs(backendUnexplained) <= toleranceVal &&
    evidence.length >= 1;

  const missingForComplete: string[] = [];
  if (recon && (recon.status === 'not_started' || recon.status === 'in_progress')) {
    if (!hasSupportingBalance) missingForComplete.push('Supporting balance required');
    if (hasUnsavedSupporting) missingForComplete.push('Save supporting balance before completing');
    if (hasSupportingBalance && backendUnexplained != null && moneyAbs(backendUnexplained) > toleranceVal) missingForComplete.push('Unexplained difference must be within tolerance');
    if (evidence.length < 1) missingForComplete.push('At least one supporting document required');
  }

  const handleSaveSupporting = useCallback(() => {
    if (supportingBalanceLocal != null && supportingBalanceLocal.trim() !== '') {
      setSavingSupporting(true);
      supportingBalanceMutation.mutate(supportingBalanceLocal.trim());
    }
  }, [supportingBalanceLocal, supportingBalanceMutation]);

  const FRONT_TO_BACKEND_TYPE: Record<ReconcilingItemType, string> = {
    'Outstanding Check': 'outstanding_check',
    'Deposit in Transit': 'deposit_in_transit',
    'Bank Fee': 'bank_fee',
    'Timing Difference': 'timing_difference',
    'Error Correction': 'error_correction',
    'Accrual': 'accrual',
    'Amortization': 'amortization',
    'Depreciation': 'depreciation',
    'Addition': 'addition',
    'Disposal': 'disposal',
    'Reclassification': 'reclassification',
    'Write-off': 'write_off',
    'Payment': 'payment',
    'Collection': 'collection',
    'Intercompany': 'intercompany',
    'Other': 'other',
  };

  const handleAddItem = useCallback(() => {
    const amt = addItemAmt ? addItemAmt.replace(/,/g, '') : '0';
    if (!addItemDesc.trim()) return;
    addItemMutation.mutate({
      description: addItemDesc.trim(),
      amount: amt,
      item_type: FRONT_TO_BACKEND_TYPE[addItemType] ?? 'other',
    });
  }, [addItemDesc, addItemAmt, addItemType, addItemMutation]);

  const handleDeleteItem = useCallback(
    (id: string) => {
      deleteItemMutation.mutate(id);
    },
    [deleteItemMutation]
  );

  const handleUpload = useCallback(
    (file: File): Promise<void> => {
      uploadEvidenceMutation.mutate(file);
      return Promise.resolve();
    },
    [uploadEvidenceMutation]
  );

  const handleDeleteEvidence = useCallback((id: string) => {
    if (id.startsWith('ev-local-')) {
      setLocalEvidence((prev) => prev.filter((f) => f.id !== id));
    }
  }, []);

  const handleMarkComplete = useCallback(() => {
    if (!canMarkComplete) return;
    completeMutation.mutate(undefined, { onSuccess: () => router.refresh() });
  }, [canMarkComplete, completeMutation, router]);

  const handleApprove = useCallback(() => {
    if (!recon || recon.status !== 'completed' || !isReviewer || canApproveOwn) return;
    approveMutation.mutate(undefined, { onSuccess: () => router.refresh() });
  }, [recon, isReviewer, canApproveOwn, approveMutation, router]);

  const handleReject = useCallback(() => {
    if (rejectReason.trim().length < 10) return;
    rejectMutation.mutate(rejectReason.trim(), {
      onSuccess: () => {
        setShowRejectInput(false);
        setRejectReason('');
        router.refresh();
      },
    });
  }, [rejectReason, rejectMutation, router]);

  if (!recon) {
    return (
      <div className="p-6">
        <p className="text-text-secondary">Reconciliation not found.</p>
        <Link href={`/close/${sessionId}/reconciliation`} className="text-accent hover:underline mt-2 inline-block">
          Back to Reconciliation
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <nav className="text-sm text-text-secondary mb-1">
            <Link href={`/close/${sessionId}/reconciliation`} className="text-accent hover:underline">
              Reconciliation
            </Link>
            <span className="mx-2">›</span>
            <span className="text-primary">
              Account {recon.accountCode} — {recon.accountName}
            </span>
          </nav>
          <h1 className="font-display text-2xl text-primary">
            {recon.accountName}
            <span className="font-mono text-base text-text-secondary ml-2">{recon.accountCode}</span>
          </h1>
          <div className="mt-2">
            <StatusBadge variant={STATUS_BADGE[recon.status]} label={STATUS_LABEL[recon.status]} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {prevId && (
            <Link
              href={`/close/${sessionId}/reconciliation/${prevId}`}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-input border border-border hover:bg-hover text-sm"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </Link>
          )}
          {nextId && (
            <Link
              href={`/close/${sessionId}/reconciliation/${nextId}`}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-input border border-border hover:bg-hover text-sm"
            >
              Next <ChevronRight className="w-4 h-4" />
            </Link>
          )}
          {(recon.status === 'not_started' || recon.status === 'in_progress') && (
            <>
              <button
                type="button"
                disabled={!canMarkComplete}
                title={missingForComplete.length ? missingForComplete.join('; ') : 'Mark complete'}
                className={cn(
                  'px-4 py-2 rounded-input text-sm font-medium',
                  canMarkComplete
                    ? 'bg-accent text-white hover:bg-accent/90'
                    : 'bg-elevated text-text-muted cursor-not-allowed'
                )}
                onClick={handleMarkComplete}
              >
                Mark Complete
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover"
                onClick={() => router.refresh()}
              >
                Save Progress
              </button>
            </>
          )}
          {recon.status === 'completed' && isReviewer && (
            <>
              <button
                type="button"
                disabled={canApproveOwn}
                title={canApproveOwn ? 'Segregation of duties — a different user must approve' : 'Approve'}
                className={cn(
                  'px-4 py-2 rounded-input text-sm font-medium',
                  canApproveOwn ? 'bg-elevated text-text-muted cursor-not-allowed' : 'bg-status-green text-white hover:opacity-90'
                )}
                onClick={handleApprove}
              >
                Approve
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-input border border-status-red text-status-red text-sm font-medium hover:bg-status-red-dim"
                onClick={() => setShowRejectInput(true)}
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      {showRejectInput && (
        <div className="p-4 rounded-card border border-status-red bg-status-red-dim">
          <label className="block text-sm font-medium text-primary mb-2">Rejection reason (min 10 chars)</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full px-3 py-2 rounded-input border border-border bg-input text-sm"
            rows={3}
            placeholder="Explain why this reconciliation is being rejected..."
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="px-4 py-2 rounded-input bg-status-red text-white text-sm font-medium"
              onClick={handleReject}
              disabled={rejectReason.trim().length < 10}
            >
              Submit Rejection
            </button>
            <button type="button" className="px-4 py-2 rounded-input border border-border text-sm" onClick={() => setShowRejectInput(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        <div className="space-y-6">
          <section className="bg-surface border border-border rounded-card p-6">
            <h2 className="text-sm font-medium text-text-secondary mb-4">Balance comparison</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs text-text-secondary mb-1">GL Balance</div>
                <div className="font-mono text-xl tabular-nums">
                  <MoneyCell value={recon.glBalance} showDollar />
                </div>
                <div className="text-xs text-text-muted mt-1">from adjusted trial balance as of {periodEndDisplay}</div>
              </div>
              <div>
                <div className="text-xs text-text-secondary mb-1">Supporting Balance</div>
                {(recon.status === 'not_started' || recon.status === 'in_progress') && (editingSupporting || (!hasSupportingBalance && supportingBalanceLocal == null)) ? (
                  <div>
                    <MoneyInput
                      value={supportingBalanceLocal ?? (recon.supportingBalance ?? null)}
                      onChange={setSupportingBalanceLocal}
                      size="lg"
                      placeholder="0.00"
                    />
                    <div className="text-xs text-text-muted mt-1">from {recon.sourceDocumentType}</div>
                    <button
                      type="button"
                      className="mt-2 text-xs text-accent hover:underline disabled:opacity-50"
                      onClick={handleSaveSupporting}
                      disabled={savingSupporting || !supportingBalanceLocal?.trim()}
                    >
                      {savingSupporting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="font-mono text-xl tabular-nums">
                      {hasSupportingBalance || supportingDisplay != null ? <MoneyCell value={supportingDisplay} showDollar /> : <span className="text-text-muted">—</span>}
                    </div>
                    <div className="text-xs text-text-muted mt-1">from {recon.sourceDocumentType}</div>
                    {(recon.status === 'not_started' || recon.status === 'in_progress') && (hasSupportingBalance || supportingBalanceLocal != null) && (
                      <button
                        type="button"
                        className="mt-2 text-xs text-accent hover:underline inline-flex items-center gap-1"
                        onClick={() => setEditingSupporting(true)}
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-center">
              <div
                className={cn(
                  'px-6 py-4 rounded-input border-2 text-center',
                  !hasSupportingBalance
                    ? 'border-border-light text-text-muted'
                    : withinTolerance
                      ? 'border-status-green text-status-green'
                      : 'border-status-red text-status-red'
                )}
              >
                <div className="text-sm font-medium">Difference</div>
                <div className="font-mono text-xl tabular-nums mt-1">
                  {!hasSupportingBalance ? (
                    'Enter supporting balance'
                  ) : (
                    <MoneyCell value={backendVariance} showDollar />
                  )}
                </div>
                {hasSupportingBalance && backendUnexplained != null && (
                  <div className="text-xs mt-2">
                    {withinTolerance ? 'Within tolerance ✓' : overTolerance ? `Over tolerance by ${fmtMoney(backendUnexplained, { dollar: true })}` : ''}
                  </div>
                )}
                <div className="text-xs text-text-muted mt-1">Tolerance: {fmtMoney(recon.tolerance, { dollar: true })}</div>
              </div>
            </div>
          </section>

          <section className="bg-surface border border-border rounded-card p-6">
            <h2 className="text-sm font-medium text-text-secondary mb-4">Reconciling items</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-medium text-text-secondary">Description</th>
                    <th className="text-right py-2 font-medium text-text-secondary w-28">Amount</th>
                    <th className="text-left py-2 font-medium text-text-secondary w-36">Type</th>
                    <th className="text-left py-2 font-medium text-text-secondary w-28">Date</th>
                    {(recon.status === 'not_started' || recon.status === 'in_progress') && <th className="w-20" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border-light">
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 text-right font-mono">
                        <MoneyCell value={item.amount} showDollar />
                      </td>
                      <td className="py-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-elevated">{item.type}</span>
                      </td>
                      <td className="py-2">{formatDate(item.date)}</td>
                      {(recon.status === 'not_started' || recon.status === 'in_progress') && (
                        <td className="py-2">
                          <button
                            type="button"
                            className="p-1 text-text-tertiary hover:text-status-red"
                            onClick={() => handleDeleteItem(item.id)}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <span className="text-text-secondary text-sm">Items total: </span>
                <span className="font-mono font-medium">
                  <MoneyCell value={recon.reconcilingItemsTotal} showDollar />
                </span>
              </div>
              <div className={cn('text-sm font-medium', withinTolerance ? 'text-status-green' : 'text-status-red')}>
                Unexplained: <MoneyCell value={backendUnexplained} showDollar />
                {withinTolerance && moneyAbs(backendUnexplained) < 0.01 && ' ✓ Fully reconciled'}
                {withinTolerance && moneyAbs(backendUnexplained) >= 0.01 && ' — within tolerance'}
                {overTolerance && ' — add reconciling items or investigate'}
              </div>
            </div>
            {(recon.status === 'not_started' || recon.status === 'in_progress') && (
              <>
                {!showAddItem ? (
                  <button
                    type="button"
                    className="mt-4 px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover"
                    onClick={() => setShowAddItem(true)}
                  >
                    Add Item
                  </button>
                ) : (
                  <div className="mt-4 p-4 rounded-input border border-border bg-elevated space-y-3">
                    <input
                      type="text"
                      value={addItemDesc}
                      onChange={(e) => setAddItemDesc(e.target.value)}
                      placeholder="Description"
                      className="w-full px-3 py-2 rounded-input border border-border bg-input text-sm"
                    />
                    <MoneyInput value={addItemAmt} onChange={setAddItemAmt} size="sm" placeholder="0.00" />
                    <select
                      value={addItemType}
                      onChange={(e) => setAddItemType(e.target.value as ReconcilingItemType)}
                      className="w-full px-3 py-2 rounded-input border border-border bg-input text-sm"
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={addItemDate}
                      onChange={(e) => setAddItemDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-input border border-border bg-input text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-4 py-2 rounded-input bg-accent text-white text-sm disabled:opacity-50"
                        onClick={handleAddItem}
                        disabled={addItemMutation.isPending || !addItemDesc.trim()}
                      >
                        {addItemMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" className="px-4 py-2 rounded-input border border-border text-sm" onClick={() => setShowAddItem(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="bg-surface border border-border rounded-card p-6">
            <h2 className="text-sm font-medium text-text-secondary mb-2">Notes</h2>
            <textarea
              value={notesDisplay}
              onChange={(e) => setNotesLocal(e.target.value)}
              onBlur={handleNotesBlur}
              disabled={isApproved}
              placeholder="Add notes about this reconciliation..."
              className="w-full px-3 py-2 rounded-input border border-border bg-input text-sm min-h-[80px]"
            />
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-surface border border-border rounded-card p-6">
            <h2 className="text-sm font-medium text-text-secondary mb-2 flex items-center gap-2">
              Supporting documents
              <span className="px-1.5 py-0.5 rounded text-xs bg-elevated">{evidence.length}</span>
            </h2>
            {evidence.length < 1 && (recon.status === 'not_started' || recon.status === 'in_progress') && (
              <p className="text-status-amber text-sm mb-3">At least one supporting document is required to complete this reconciliation</p>
            )}
            {(recon.status === 'not_started' || recon.status === 'in_progress') && (
              <FileUpload
                onUpload={handleUpload}
                acceptedTypes={['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']}
                maxSizeMB={10}
              />
            )}
            {evidence.length > 0 && (
              <div className="mt-4">
                <FileList files={evidence} onDelete={handleDeleteEvidence} showHash readonly={isApproved} />
              </div>
            )}
          </section>

          {isCompleted && (
            <section className="bg-surface border border-border rounded-card p-6">
              <h2 className="text-sm font-medium text-text-secondary mb-3">Approval info</h2>
              <dl className="text-sm space-y-2">
                <div>
                  <dt className="text-text-muted">Completed by</dt>
                  <dd className="font-medium">{recon.preparer ?? '—'} on {formatDate(recon.completedAt)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Approved by</dt>
                  <dd className="font-medium">{recon.reviewer ? `${recon.reviewer} on ${formatDate(recon.approvedAt)}` : 'Pending approval'}</dd>
                </div>
                {recon.rejectedReason && (
                  <div className="mt-3 p-3 rounded-input bg-status-amber-dim border border-status-amber/30 text-status-amber">
                    {recon.rejectedReason}
                  </div>
                )}
              </dl>
            </section>
          )}

          <section className="bg-surface border border-border rounded-card p-6">
            <h2 className="text-sm font-medium text-text-secondary mb-3">History</h2>
            <ul className="space-y-2">
              {activity.length === 0 ? (
                <li className="text-text-muted text-sm">No activity yet</li>
              ) : (
                activity
                  .slice()
                  .reverse()
                  .map((a) => (
                    <li key={a.id} className="text-sm">
                      <span className="font-medium text-primary">{a.user}</span>
                      <span className="text-text-secondary"> {a.description}</span>
                      <span className="text-text-muted text-xs block">{formatDateTime(a.timestamp)}</span>
                    </li>
                  ))
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
