'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useReconciliations, useReconciliation, useCopyPriorPeriod } from '@/lib/queries/reconciliations';
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
import { canCompleteRecon, canApproveRecon, isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { ReconSourcePanel } from '@/components/close/ReconSourcePanel';
import { RollForwardView } from '@/components/close/RollForwardView';
import { Breadcrumb } from '@/components/shared/Breadcrumb';

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

  const copyPriorMutation = useCopyPriorPeriod(sessionId, reconId);

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
  const [actionError, setActionError] = useState<string | null>(null);

  // Auto-dismiss error after 6 seconds
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 6000);
    return () => clearTimeout(t);
  }, [actionError]);

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
      setActionError(null);
    },
    onError: (err) => {
      setSavingSupporting(false);
      setActionError(err instanceof Error ? err.message : 'Failed to save supporting balance');
    },
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

  /* ── Carry Forward Items Mutation ── */
  const carryForwardMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/carry-forward-items`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
  });
  const carryForwardPending = carryForwardMutation.isPending;
  const handleCarryForward = useCallback(() => {
    carryForwardMutation.mutate();
  }, [carryForwardMutation]);

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

  /* ── Save Notes Mutation ── */
  const saveNotesMutation = useMutation({
    mutationFn: (notes: string) =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/notes`, {
        method: 'PUT',
        body: { notes },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', sessionId, reconId] });
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
  const role = user?.role ?? 'controller';
  const userId = user?.userId ?? '';
  const readOnly = isRoleReadOnly(role);
  const roleCanComplete = canCompleteRecon(role);
  const isCompleted = recon?.status === 'completed' || recon?.status === 'approved';
  const isApproved = recon?.status === 'approved';
  const isPreparer = recon?.preparer != null && (user?.userId === recon.preparer || user?.email === recon.preparer);
  // SoD: A user is only a valid reviewer if a preparer exists AND current user is NOT that preparer AND role permits.
  const isReviewer = recon?.preparer != null && !isPreparer;
  const roleCanApprove = canApproveRecon(role, recon?.preparer ?? '', userId);
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
      // Strip commas and dollar signs — send clean decimal string to API
      const cleaned = supportingBalanceLocal.trim().replace(/[$,]/g, '');
      supportingBalanceMutation.mutate(cleaned);
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
    if (!canMarkComplete) {
      if (missingForComplete.length > 0) {
        setActionError(missingForComplete.join('. '));
      }
      return;
    }
    setActionError(null);
    completeMutation.mutate(undefined, {
      onSuccess: () => router.refresh(),
      onError: (err) => setActionError(err instanceof Error ? err.message : 'Failed to mark complete'),
    });
  }, [canMarkComplete, missingForComplete, completeMutation, router]);

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
        <p style={{ color: 'var(--text-secondary)' }}>Reconciliation not found.</p>
        <Link
          href={`/close/${sessionId}/reconciliation`}
          className="hover:underline mt-2 inline-block"
          style={{ color: 'var(--interactive-primary)' }}
        >
          Back to Reconciliation
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error toast */}
      {actionError && (
        <div
          className="flex items-center justify-between px-4 py-3 text-sm rounded-[var(--radius-lg)]"
          style={{ border: '1px solid var(--status-error)', backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error)' }}
        >
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="hover:opacity-80 ml-4 font-medium" aria-label="Dismiss">x</button>
        </div>
      )}
      <Breadcrumb items={[
        { label: 'Close', href: `/close/${sessionId}/dashboard` },
        { label: 'Reconciliation', href: `/close/${sessionId}/reconciliation` },
        { label: recon.accountName || 'Detail' },
      ]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl" style={{ color: 'var(--text-primary)' }}>
            {recon.accountName}
            <span className="font-mono text-base ml-2" style={{ color: 'var(--text-secondary)' }}>{recon.accountCode}</span>
          </h1>
          <div className="mt-2">
            <StatusBadge variant={STATUS_BADGE[recon.status]} label={STATUS_LABEL[recon.status]} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {prevId && (
            <Link
              href={`/close/${sessionId}/reconciliation/${prevId}`}
              className="inline-flex items-center gap-1 px-3 py-2 border text-sm"
              style={{
                borderColor: 'var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </Link>
          )}
          {nextId && (
            <Link
              href={`/close/${sessionId}/reconciliation/${nextId}`}
              className="inline-flex items-center gap-1 px-3 py-2 border text-sm"
              style={{
                borderColor: 'var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              Next <ChevronRight className="w-4 h-4" />
            </Link>
          )}
          {(recon.status === 'not_started' || recon.status === 'in_progress') && roleCanComplete && (
            <>
              <button
                type="button"
                disabled={!canMarkComplete}
                title={missingForComplete.length ? missingForComplete.join('; ') : 'Mark complete'}
                className={cn(
                  'px-4 py-2 text-sm font-medium',
                  !canMarkComplete && 'cursor-not-allowed'
                )}
                style={canMarkComplete
                  ? {
                      backgroundColor: 'var(--interactive-primary)',
                      color: 'white',
                      borderRadius: 'var(--radius-md)',
                    }
                  : {
                      backgroundColor: 'var(--bg-surface-sunken)',
                      color: 'var(--text-tertiary)',
                      borderRadius: 'var(--radius-md)',
                    }
                }
                onClick={handleMarkComplete}
              >
                Mark Complete
              </button>
              <button
                type="button"
                className="px-4 py-2 border text-sm font-medium"
                style={{
                  borderColor: 'var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                }}
                onClick={() => router.refresh()}
              >
                Save Progress
              </button>
            </>
          )}
          {recon.status === 'completed' && isReviewer && roleCanApprove && (
            <>
              <button
                type="button"
                disabled={canApproveOwn}
                title={canApproveOwn ? 'Segregation of duties — a different user must approve' : 'Approve'}
                className={cn(
                  'px-4 py-2 text-sm font-medium',
                  canApproveOwn && 'cursor-not-allowed'
                )}
                style={canApproveOwn
                  ? {
                      backgroundColor: 'var(--bg-surface-sunken)',
                      color: 'var(--text-tertiary)',
                      borderRadius: 'var(--radius-md)',
                    }
                  : {
                      backgroundColor: 'var(--status-success)',
                      color: 'white',
                      borderRadius: 'var(--radius-md)',
                    }
                }
                onClick={handleApprove}
              >
                Approve
              </button>
              <button
                type="button"
                className="px-4 py-2 border text-sm font-medium"
                style={{
                  borderColor: 'var(--status-error)',
                  color: 'var(--status-error)',
                  borderRadius: 'var(--radius-md)',
                }}
                onClick={() => setShowRejectInput(true)}
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      {showRejectInput && (
        <div
          className="p-4 border"
          style={{
            borderColor: 'var(--status-error)',
            backgroundColor: 'var(--status-error-bg)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Rejection reason (min 10 chars)</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full px-3 py-2 border text-sm"
            style={{
              borderColor: 'var(--border-default)',
              backgroundColor: 'var(--bg-surface-sunken)',
              borderRadius: 'var(--radius-md)',
            }}
            rows={3}
            placeholder="Explain why this reconciliation is being rejected..."
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium"
              style={{
                backgroundColor: 'var(--status-error)',
                color: 'white',
                borderRadius: 'var(--radius-md)',
              }}
              onClick={handleReject}
              disabled={rejectReason.trim().length < 10}
            >
              Submit Rejection
            </button>
            <button
              type="button"
              className="px-4 py-2 border text-sm"
              style={{
                borderColor: 'var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}
              onClick={() => setShowRejectInput(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        <div className="space-y-6">
          <section
            className="border p-6"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>Balance comparison</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>GL Balance</div>
                <div className="font-mono text-xl tabular-nums">
                  <MoneyCell value={recon.glBalance} showDollar />
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>from adjusted trial balance as of {periodEndDisplay}</div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Supporting Balance</div>
                {!readOnly && (recon.status === 'not_started' || recon.status === 'in_progress') && (editingSupporting || (!hasSupportingBalance && supportingBalanceLocal == null)) ? (
                  <div>
                    <MoneyInput
                      value={supportingBalanceLocal ?? (recon.supportingBalance ?? null)}
                      onChange={setSupportingBalanceLocal}
                      size="lg"
                      placeholder="0.00"
                    />
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>from {recon.sourceDocumentType}</div>
                    <button
                      type="button"
                      className="mt-2 text-xs hover:underline disabled:opacity-50"
                      style={{ color: 'var(--interactive-primary)' }}
                      onClick={handleSaveSupporting}
                      disabled={savingSupporting || !supportingBalanceLocal?.trim() || !/^-?\d+(\.\d{0,2})?$/.test(supportingBalanceLocal?.replace(/[$,]/g, '') ?? '')}
                      title={supportingBalanceLocal && !/^-?\d+(\.\d{0,2})?$/.test(supportingBalanceLocal.replace(/[$,]/g, '')) ? 'Enter a valid dollar amount (e.g. 342521.22)' : undefined}
                    >
                      {savingSupporting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="font-mono text-xl tabular-nums">
                      {hasSupportingBalance || supportingDisplay != null ? <MoneyCell value={supportingDisplay} showDollar /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>from {recon.sourceDocumentType}</div>
                    {!readOnly && (recon.status === 'not_started' || recon.status === 'in_progress') && (hasSupportingBalance || supportingBalanceLocal != null) && (
                      <button
                        type="button"
                        className="mt-2 text-xs hover:underline inline-flex items-center gap-1"
                        style={{ color: 'var(--interactive-primary)' }}
                        onClick={() => setEditingSupporting(true)}
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {recon.priorPeriodGlBalance != null && (
              <div
                className="mt-4 p-3 border"
                style={{
                  backgroundColor: 'var(--bg-surface-sunken)',
                  borderColor: 'var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Prior Period Reference</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>GL Balance:</span>
                    <span className="font-mono ml-1"><MoneyCell value={recon.priorPeriodGlBalance} showDollar /></span>
                  </div>
                  <div>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Supporting:</span>
                    <span className="font-mono ml-1">
                      {recon.priorPeriodSupportingBalance != null
                        ? <MoneyCell value={recon.priorPeriodSupportingBalance} showDollar />
                        : '—'}
                    </span>
                  </div>
                </div>
                {!recon.copiedFromPrior && !hasSupportingBalance && (recon.status === 'not_started' || recon.status === 'in_progress') && (
                  <button
                    type="button"
                    className="mt-2 text-xs hover:underline disabled:opacity-50"
                    style={{ color: 'var(--interactive-primary)' }}
                    onClick={() => copyPriorMutation.mutate()}
                    disabled={copyPriorMutation.isPending}
                  >
                    {copyPriorMutation.isPending ? 'Copying...' : 'Copy from last period'}
                  </button>
                )}
                {recon.copiedFromPrior && (
                  <div className="mt-1 text-xs" style={{ color: 'var(--status-success)' }}>Copied from prior period</div>
                )}
              </div>
            )}
            <div className="mt-6 flex justify-center">
              <div
                className="px-6 py-4 border-2 text-center"
                style={{
                  borderRadius: 'var(--radius-md)',
                  ...(
                    !hasSupportingBalance
                      ? { borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }
                      : withinTolerance
                        ? { borderColor: 'var(--status-success)', color: 'var(--status-success)' }
                        : { borderColor: 'var(--status-error)', color: 'var(--status-error)' }
                  ),
                }}
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
                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Tolerance: {fmtMoney(recon.tolerance, { dollar: true })}</div>
              </div>
            </div>
          </section>

          {/* Roll-Forward Schedule — renders only for applicable account types */}
          <RollForwardView sessionId={sessionId} reconId={reconId} />

          {/* Source Data Panel — only in editable states */}
          {recon.status !== 'approved' && (
            <ReconSourcePanel sessionId={sessionId} reconId={reconId} />
          )}

          <section
            className="border p-6"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>Reconciling items</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <th className="text-left py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Description</th>
                    <th className="text-right py-2 font-medium w-28" style={{ color: 'var(--text-secondary)' }}>Amount</th>
                    <th className="text-left py-2 font-medium w-36" style={{ color: 'var(--text-secondary)' }}>Type</th>
                    <th className="text-left py-2 font-medium w-28" style={{ color: 'var(--text-secondary)' }}>Date</th>
                    {!readOnly && (recon.status === 'not_started' || recon.status === 'in_progress') && <th className="w-20" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 text-right font-mono">
                        <MoneyCell value={item.amount} showDollar />
                      </td>
                      <td className="py-2">
                        <span
                          className="px-2 py-0.5 rounded text-xs"
                          style={{ backgroundColor: 'var(--bg-surface-sunken)' }}
                        >
                          {item.type}
                        </span>
                      </td>
                      <td className="py-2">{formatDate(item.date)}</td>
                      {!readOnly && (recon.status === 'not_started' || recon.status === 'in_progress') && (
                        <td className="py-2">
                          <button
                            type="button"
                            className="p-1"
                            style={{ color: 'var(--text-tertiary)' }}
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
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Items total: </span>
                <span className="font-mono font-medium">
                  <MoneyCell value={recon.reconcilingItemsTotal} showDollar />
                </span>
              </div>
              <div
                className="text-sm font-medium"
                style={{ color: withinTolerance ? 'var(--status-success)' : 'var(--status-error)' }}
              >
                Unexplained: <MoneyCell value={backendUnexplained} showDollar />
                {withinTolerance && moneyAbs(backendUnexplained) < 0.01 && ' ✓ Fully reconciled'}
                {withinTolerance && moneyAbs(backendUnexplained) >= 0.01 && ' — within tolerance'}
                {overTolerance && ' — add reconciling items or investigate'}
              </div>
            </div>
            {!readOnly && (recon.status === 'not_started' || recon.status === 'in_progress') && (
              <>
                {!showAddItem ? (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 border text-sm font-medium"
                      style={{
                        borderColor: 'var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                      }}
                      onClick={() => setShowAddItem(true)}
                    >
                      Add Item
                    </button>
                    {recon.priorPeriodGlBalance != null && !items.some((i) => i.description.startsWith('[Carried forward]')) && (
                      <button
                        type="button"
                        className="px-4 py-2 border text-sm font-medium"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--interactive-primary) 40%, transparent)',
                          color: 'var(--interactive-primary)',
                          borderRadius: 'var(--radius-md)',
                        }}
                        onClick={handleCarryForward}
                        disabled={carryForwardPending}
                      >
                        {carryForwardPending ? 'Carrying forward...' : 'Carry Forward from Prior Period'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className="mt-4 p-4 border space-y-3"
                    style={{
                      borderColor: 'var(--border-default)',
                      backgroundColor: 'var(--bg-surface-sunken)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <input
                      type="text"
                      value={addItemDesc}
                      onChange={(e) => setAddItemDesc(e.target.value)}
                      placeholder="Description"
                      className="w-full px-3 py-2 border text-sm"
                      style={{
                        borderColor: 'var(--border-default)',
                        backgroundColor: 'var(--bg-surface-sunken)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    />
                    <MoneyInput value={addItemAmt} onChange={setAddItemAmt} size="sm" placeholder="0.00" />
                    <select
                      value={addItemType}
                      onChange={(e) => setAddItemType(e.target.value as ReconcilingItemType)}
                      className="w-full px-3 py-2 border text-sm"
                      style={{
                        borderColor: 'var(--border-default)',
                        backgroundColor: 'var(--bg-surface-sunken)',
                        borderRadius: 'var(--radius-md)',
                      }}
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
                      className="w-full px-3 py-2 border text-sm"
                      style={{
                        borderColor: 'var(--border-default)',
                        backgroundColor: 'var(--bg-surface-sunken)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-4 py-2 text-sm disabled:opacity-50"
                        style={{
                          backgroundColor: 'var(--interactive-primary)',
                          color: 'white',
                          borderRadius: 'var(--radius-md)',
                        }}
                        onClick={handleAddItem}
                        disabled={addItemMutation.isPending || !addItemDesc.trim()}
                      >
                        {addItemMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 border text-sm"
                        style={{
                          borderColor: 'var(--border-default)',
                          borderRadius: 'var(--radius-md)',
                        }}
                        onClick={() => setShowAddItem(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section
            className="border p-6"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Notes</h2>
            <textarea
              value={notesDisplay}
              onChange={(e) => setNotesLocal(e.target.value)}
              onBlur={handleNotesBlur}
              disabled={isApproved || readOnly}
              placeholder="Add notes about this reconciliation..."
              className="w-full px-3 py-2 border text-sm min-h-[80px]"
              style={{
                borderColor: 'var(--border-default)',
                backgroundColor: 'var(--bg-surface-sunken)',
                borderRadius: 'var(--radius-md)',
              }}
            />
          </section>
        </div>

        <div className="space-y-6">
          <section
            className="border p-6"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <h2 className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              Supporting documents
              <span
                className="px-1.5 py-0.5 rounded text-xs"
                style={{ backgroundColor: 'var(--bg-surface-sunken)' }}
              >
                {evidence.length}
              </span>
            </h2>
            {evidence.length < 1 && (recon.status === 'not_started' || recon.status === 'in_progress') && (
              <p className="text-sm mb-3" style={{ color: 'var(--status-warning)' }}>At least one supporting document is required to complete this reconciliation</p>
            )}
            {!readOnly && (recon.status === 'not_started' || recon.status === 'in_progress') && (
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
            <section
              className="border p-6"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-default)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Approval info</h2>
              <dl className="text-sm space-y-2">
                <div>
                  <dt style={{ color: 'var(--text-tertiary)' }}>Completed by</dt>
                  <dd className="font-medium">{recon.preparer ?? '—'} on {formatDate(recon.completedAt)}</dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-tertiary)' }}>Approved by</dt>
                  <dd className="font-medium">{recon.reviewer ? `${recon.reviewer} on ${formatDate(recon.approvedAt)}` : 'Pending approval'}</dd>
                </div>
                {recon.rejectedReason && (
                  <div
                    className="mt-3 p-3 border"
                    style={{
                      backgroundColor: 'var(--status-warning-bg)',
                      borderColor: 'color-mix(in srgb, var(--status-warning) 30%, transparent)',
                      color: 'var(--status-warning)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    {recon.rejectedReason}
                  </div>
                )}
              </dl>
            </section>
          )}

          <section
            className="border p-6"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>History</h2>
            <ul className="space-y-2">
              {activity.length === 0 ? (
                <li className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No activity yet</li>
              ) : (
                activity
                  .slice()
                  .reverse()
                  .map((a) => (
                    <li key={a.id} className="text-sm">
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{a.user}</span>
                      <span style={{ color: 'var(--text-secondary)' }}> {a.description}</span>
                      <span className="text-xs block" style={{ color: 'var(--text-tertiary)' }}>{formatDateTime(a.timestamp)}</span>
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
