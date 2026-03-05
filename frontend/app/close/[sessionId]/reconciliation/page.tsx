'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { apiFetch } from '@/lib/api';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FilterBar } from '@/components/shared/FilterBar';
import type { Reconciliation, ReconStatus } from '@/lib/types/reconciliation';
import { moneyAbs, cmpMoney, sumMoneyStrings, fmtMoney } from '@/lib/money';
import { Paperclip, Check, AlertCircle, Layers, CheckCircle2, Loader2 } from 'lucide-react';

const STATUS_ORDER: ReconStatus[] = ['not_started', 'in_progress', 'completed', 'approved'];
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

// ─── Batch-mode per-row state ────────────────────────────────────────────────
type RowSaveState = 'idle' | 'saving' | 'saved' | 'error';

interface BatchRowState {
  value: string;        // raw input string the user typed
  saveState: RowSaveState;
  dirty: boolean;       // modified but not yet saved
  errorMsg?: string;
}

// Compute client-side variance: glBalance - supportingBalance (display only)
function computeVarianceDisplay(glBalance: string, supportingBalanceInput: string): string {
  const gl = parseFloat(glBalance.replace(/[$,()]/g, '') || '0');
  const sup = parseFloat(supportingBalanceInput.replace(/[$,()]/g, '') || '0');
  if (!isFinite(gl) || !isFinite(sup) || supportingBalanceInput.trim() === '') return '';
  return (gl - sup).toFixed(2);
}

// Determine if a client-side variance is over tolerance
function isOverTolerance(variance: string, tolerance: string): boolean {
  if (!variance) return false;
  const v = Math.abs(parseFloat(variance) || 0);
  const t = moneyAbs(tolerance);
  return v > t;
}

// ─── SaveIndicator component ─────────────────────────────────────────────────
function SaveIndicator({ state, error }: { state: RowSaveState; error?: string }) {
  if (state === 'saving') {
    return <Loader2 className="w-4 h-4 animate-spin text-text-muted" />;
  }
  if (state === 'saved') {
    return <CheckCircle2 className="w-4 h-4 text-status-green" />;
  }
  if (state === 'error') {
    return <span title={error ?? 'Save failed'}><AlertCircle className="w-4 h-4 text-status-red" /></span>;
  }
  return null;
}

export default function ReconciliationPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const queryClient = useQueryClient();
  const { data: reconciliations, isLoading } = useReconciliations(sessionId);
  const recons = reconciliations ?? [];
  const initAttempted = useRef(false);

  const [initError, setInitError] = useState<string | null>(null);

  const initializeMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/initialize`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
    onError: (err) => {
      setInitError(err instanceof Error ? err.message : 'Failed to initialize reconciliations');
    },
  });

  useEffect(() => {
    if (
      !isLoading &&
      reconciliations &&
      reconciliations.length === 0 &&
      !initializeMutation.isPending &&
      !initAttempted.current
    ) {
      initAttempted.current = true;
      initializeMutation.mutate();
    }
  }, [isLoading, reconciliations, initializeMutation.isPending]);

  const [search, setSearch] = useState('');
  const hasIncomplete = recons.some((r) => r.status === 'not_started' || r.status === 'in_progress');
  const [statusFilter, setStatusFilter] = useState<ReconStatus | 'all'>('all');
  const [overToleranceOnly, setOverToleranceOnly] = useState(false);
  const [sortKey, setSortKey] = useState<keyof Reconciliation | string>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // ─── Batch mode state ──────────────────────────────────────────────────────
  const [batchMode, setBatchMode] = useState(false);
  // Map from reconId → BatchRowState
  const [batchRows, setBatchRows] = useState<Record<string, BatchRowState>>({});
  // Track save-indicator timers so we can clear 'saved' after a delay
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);

  // When batch mode is enabled, seed batchRows from current server data
  const handleToggleBatch = useCallback(() => {
    setBatchMode((prev) => {
      if (!prev) {
        // Entering batch mode — seed inputs from existing supportingBalance values
        const seed: Record<string, BatchRowState> = {};
        for (const r of recons) {
          seed[r.id] = {
            value: r.supportingBalance ?? '',
            saveState: 'idle',
            dirty: false,
          };
        }
        setBatchRows(seed);
      }
      return !prev;
    });
  }, [recons]);

  const filtered = useMemo(() => {
    let list = recons;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => (r.accountCode ?? '').toLowerCase().includes(q) || (r.accountName ?? '').toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    if (overToleranceOnly) {
      list = list.filter((r) => r.supportingBalance != null && moneyAbs(r.unexplainedVariance) > moneyAbs(r.tolerance));
    }
    return list;
  }, [recons, search, statusFilter, overToleranceOnly]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortKey === 'status') {
        const ia = STATUS_ORDER.indexOf(a.status);
        const ib = STATUS_ORDER.indexOf(b.status);
        return sortDir === 'asc' ? ia - ib : ib - ia;
      }
      if (sortKey === 'glBalance' || sortKey === 'supportingBalance' || sortKey === 'variance' || sortKey === 'unexplainedVariance' || sortKey === 'tolerance') {
        const va = a[sortKey as keyof Reconciliation] as string | null | undefined;
        const vb = b[sortKey as keyof Reconciliation] as string | null | undefined;
        const c = cmpMoney(va, vb);
        return sortDir === 'asc' ? c : -c;
      }
      if (sortKey === 'accountCode' || sortKey === 'accountName' || sortKey === 'preparer' || sortKey === 'reviewer') {
        const va = String(a[sortKey as keyof Reconciliation] ?? '');
        const vb = String(b[sortKey as keyof Reconciliation] ?? '');
        const c = va.localeCompare(vb);
        return sortDir === 'asc' ? c : -c;
      }
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const total = recons.length;
  const completed = recons.filter((r) => r.status === 'completed' || r.status === 'approved').length;
  const inProgress = recons.filter((r) => r.status === 'in_progress').length;
  const notStarted = recons.filter((r) => r.status === 'not_started').length;
  const approved = recons.filter((r) => r.status === 'approved').length;
  const overTolerance = recons.filter((r) => r.supportingBalance != null && moneyAbs(r.unexplainedVariance) > moneyAbs(r.tolerance)).length;
  const progressPct = total ? Math.round((completed / total) * 1000) / 10 : 0;

  const totals = useMemo(() => {
    const gl = sumMoneyStrings(filtered.map((r) => r.glBalance));
    const withSupporting = filtered.filter((r) => r.supportingBalance != null);
    const sup = sumMoneyStrings(withSupporting.map((r) => r.supportingBalance));
    const varTot = sumMoneyStrings(withSupporting.map((r) => r.variance));
    const unexTot = sumMoneyStrings(withSupporting.map((r) => r.unexplainedVariance));
    return { gl, sup, varTot, unexTot };
  }, [filtered]);

  const pills: { id: string; label: string; active: boolean; toggle: () => void }[] = [
    { id: 'all', label: 'All', active: statusFilter === 'all', toggle: () => setStatusFilter('all') },
    { id: 'not_started', label: 'Not Started', active: statusFilter === 'not_started', toggle: () => setStatusFilter('not_started') },
    { id: 'in_progress', label: 'In Progress', active: statusFilter === 'in_progress', toggle: () => setStatusFilter('in_progress') },
    { id: 'completed', label: 'Completed', active: statusFilter === 'completed', toggle: () => setStatusFilter('completed') },
    { id: 'approved', label: 'Approved', active: statusFilter === 'approved', toggle: () => setStatusFilter('approved') },
  ];

  const handleSort = (key: keyof Reconciliation | string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else setSortKey(key as keyof Reconciliation);
  };

  const handleRowClick = (row: Reconciliation) => {
    router.push(`/close/${sessionId}/reconciliation/${row.id}`);
  };

  const rowClassName = (row: Reconciliation) => {
    if (batchMode) {
      const rowState = batchRows[row.id];
      const inputVal = rowState?.value ?? '';
      const variance = computeVarianceDisplay(row.glBalance, inputVal);
      if (variance !== '' && isOverTolerance(variance, row.tolerance)) {
        return 'border-l-4 border-l-status-red';
      }
      if (variance !== '' && !isOverTolerance(variance, row.tolerance) && Math.abs(parseFloat(variance) || 0) === 0) {
        return 'border-l-4 border-l-status-green';
      }
      return '';
    }
    const over = row.supportingBalance != null && moneyAbs(row.unexplainedVariance) > moneyAbs(row.tolerance);
    const completedNotApproved = row.status === 'completed' && !row.reviewer;
    if (over) return 'border-l-4 border-l-status-red';
    if (completedNotApproved) return 'border-l-4 border-l-status-amber';
    return '';
  };

  // ─── Batch: save a single row ──────────────────────────────────────────────
  const saveSingleRow = useCallback(async (reconId: string, value: string): Promise<boolean> => {
    if (value.trim() === '') return true; // nothing to save

    setBatchRows((prev) => ({
      ...prev,
      [reconId]: { ...prev[reconId], saveState: 'saving', errorMsg: undefined },
    }));

    try {
      await apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/supporting-balance`, {
        method: 'POST',
        body: { supportingBalance: value.trim() },
      });

      setBatchRows((prev) => ({
        ...prev,
        [reconId]: { ...prev[reconId], saveState: 'saved', dirty: false },
      }));

      // Clear 'saved' indicator after 2.5 s
      if (savedTimers.current[reconId]) clearTimeout(savedTimers.current[reconId]);
      savedTimers.current[reconId] = setTimeout(() => {
        setBatchRows((prev) => ({
          ...prev,
          [reconId]: { ...prev[reconId], saveState: 'idle' },
        }));
      }, 2500);

      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setBatchRows((prev) => ({
        ...prev,
        [reconId]: { ...prev[reconId], saveState: 'error', errorMsg: msg },
      }));
      return false;
    }
  }, [sessionId, queryClient]);

  const handleBatchInputChange = useCallback((reconId: string, newValue: string) => {
    setBatchRows((prev) => ({
      ...prev,
      [reconId]: { ...prev[reconId], value: newValue, dirty: true, saveState: 'idle', errorMsg: undefined },
    }));
  }, []);

  const handleBatchInputBlur = useCallback((reconId: string) => {
    const rowState = batchRows[reconId];
    if (!rowState || !rowState.dirty || rowState.value.trim() === '') return;
    saveSingleRow(reconId, rowState.value);
  }, [batchRows, saveSingleRow]);

  // ─── Batch: Save All ───────────────────────────────────────────────────────
  const handleSaveAll = useCallback(async () => {
    const dirtyIds = Object.entries(batchRows)
      .filter(([, s]) => s.dirty && s.value.trim() !== '')
      .map(([id]) => id);

    if (dirtyIds.length === 0) return;

    setIsSavingAll(true);
    await Promise.all(dirtyIds.map((id) => saveSingleRow(id, batchRows[id].value)));
    setIsSavingAll(false);
  }, [batchRows, saveSingleRow]);

  const dirtyCount = Object.values(batchRows).filter((s) => s.dirty && s.value.trim() !== '').length;

  // ─── Columns: normal view ──────────────────────────────────────────────────
  const normalColumns = [
    {
      id: 'accountCode',
      header: 'Account Code',
      width: '90px',
      align: 'left' as const,
      sortKey: 'accountCode',
      cell: (row: Reconciliation) => <span className="font-mono text-sm">{row.accountCode}</span>,
    },
    {
      id: 'accountName',
      header: 'Account Name',
      width: undefined,
      align: 'left' as const,
      sortKey: 'accountName',
      cell: (row: Reconciliation) => <span className="text-primary">{row.accountName}</span>,
    },
    {
      id: 'glBalance',
      header: 'GL Balance',
      width: '140px',
      align: 'right' as const,
      sortKey: 'glBalance',
      cell: (row: Reconciliation) => <MoneyCell value={row.glBalance} showDollar />,
    },
    {
      id: 'supportingBalance',
      header: 'Supporting Balance',
      width: '140px',
      align: 'right' as const,
      sortKey: 'supportingBalance',
      cell: (row: Reconciliation) =>
        row.supportingBalance != null ? (
          <MoneyCell value={row.supportingBalance} showDollar />
        ) : (
          <span className="text-text-muted font-mono">—</span>
        ),
    },
    {
      id: 'variance',
      header: 'Difference',
      width: '130px',
      align: 'right' as const,
      sortKey: 'variance',
      cell: (row: Reconciliation) => {
        if (row.supportingBalance == null) return <span className="text-text-muted font-mono">—</span>;
        const over = moneyAbs(row.unexplainedVariance) > moneyAbs(row.tolerance);
        return (
          <MoneyCell
            value={row.variance}
            showDollar
            className={over ? 'text-status-red' : 'text-status-green'}
          />
        );
      },
    },
    {
      id: 'unexplainedVariance',
      header: 'Unexplained',
      width: '130px',
      align: 'right' as const,
      sortKey: 'unexplainedVariance',
      cell: (row: Reconciliation) => {
        if (row.supportingBalance == null) return <span className="text-text-muted font-mono">—</span>;
        const over = moneyAbs(row.unexplainedVariance) > moneyAbs(row.tolerance);
        return (
          <MoneyCell
            value={row.unexplainedVariance}
            showDollar
            className={over ? 'text-status-red' : 'text-status-green'}
          />
        );
      },
    },
    {
      id: 'tolerance',
      header: 'Tolerance',
      width: '100px',
      align: 'right' as const,
      sortKey: 'tolerance',
      cell: (row: Reconciliation) => <MoneyCell value={row.tolerance} showDollar />,
    },
    {
      id: 'prior',
      header: 'Prior',
      width: '120px',
      align: 'right' as const,
      sortKey: undefined,
      cell: (row: Reconciliation) =>
        row.priorPeriodSupportingBalance != null ? (
          <MoneyCell value={row.priorPeriodSupportingBalance} showDollar />
        ) : (
          <span className="text-text-muted font-mono">—</span>
        ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '110px',
      align: 'left' as const,
      sortKey: 'status',
      cell: (row: Reconciliation) => (
        <StatusBadge variant={STATUS_BADGE[row.status]} label={STATUS_LABEL[row.status]} />
      ),
    },
    {
      id: 'evidence',
      header: 'Evidence',
      width: '70px',
      align: 'center' as const,
      sortKey: undefined,
      cell: (row: Reconciliation) => {
        const missing = row.status !== 'not_started' && row.evidenceCount === 0;
        return (
          <div className="flex justify-center">
            {row.evidenceCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-text-secondary" title={`${row.evidenceCount} file(s)`}>
                <Paperclip className="w-4 h-4" />
                {row.evidenceCount}
              </span>
            ) : missing ? (
              <span title="Required but missing"><Paperclip className="w-4 h-4 text-status-red" /></span>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'preparer',
      header: 'Preparer',
      width: '100px',
      align: 'left' as const,
      sortKey: 'preparer',
      cell: (row: Reconciliation) => <span className="text-sm">{row.preparer ?? '—'}</span>,
    },
    {
      id: 'reviewer',
      header: 'Reviewer',
      width: '100px',
      align: 'left' as const,
      sortKey: 'reviewer',
      cell: (row: Reconciliation) => <span className="text-sm">{row.reviewer ?? '—'}</span>,
    },
  ];

  // ─── Columns: batch mode ───────────────────────────────────────────────────
  const batchColumns = [
    {
      id: 'accountCode',
      header: 'Account Code',
      width: '90px',
      align: 'left' as const,
      sortKey: 'accountCode',
      cell: (row: Reconciliation) => <span className="font-mono text-sm">{row.accountCode}</span>,
    },
    {
      id: 'accountName',
      header: 'Account Name',
      width: undefined,
      align: 'left' as const,
      sortKey: 'accountName',
      cell: (row: Reconciliation) => <span className="text-primary">{row.accountName}</span>,
    },
    {
      id: 'glBalance',
      header: 'GL Balance',
      width: '140px',
      align: 'right' as const,
      sortKey: 'glBalance',
      cell: (row: Reconciliation) => (
        <span className="font-mono text-sm text-text-secondary">{fmtMoney(row.glBalance, { dollar: true })}</span>
      ),
    },
    {
      id: 'supportingBalance',
      header: 'Supporting Balance',
      width: '160px',
      align: 'right' as const,
      sortKey: 'supportingBalance',
      cell: (row: Reconciliation) => {
        const rowState = batchRows[row.id] ?? { value: row.supportingBalance ?? '', saveState: 'idle', dirty: false };
        return (
          <div
            className="flex items-center gap-1.5 justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              inputMode="decimal"
              value={rowState.value}
              onChange={(e) => handleBatchInputChange(row.id, e.target.value)}
              onBlur={() => handleBatchInputBlur(row.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              placeholder="0.00"
              className={[
                'w-28 text-right font-mono text-sm px-2 py-1 rounded-input border',
                'bg-surface text-primary focus:outline-none focus:ring-1 focus:ring-accent',
                rowState.saveState === 'error'
                  ? 'border-status-red'
                  : rowState.dirty
                  ? 'border-accent'
                  : 'border-border',
              ].join(' ')}
            />
            <div className="w-4 flex-shrink-0">
              <SaveIndicator state={rowState.saveState} error={rowState.errorMsg} />
            </div>
          </div>
        );
      },
    },
    {
      id: 'variance',
      header: 'Variance',
      width: '130px',
      align: 'right' as const,
      sortKey: undefined,
      cell: (row: Reconciliation) => {
        const rowState = batchRows[row.id];
        const inputVal = rowState?.value ?? row.supportingBalance ?? '';
        const variance = computeVarianceDisplay(row.glBalance, inputVal);
        if (variance === '') return <span className="text-text-muted font-mono">—</span>;
        const over = isOverTolerance(variance, row.tolerance);
        const zero = Math.abs(parseFloat(variance) || 0) === 0;
        return (
          <span
            className={[
              'font-mono text-sm',
              over ? 'text-status-red' : zero ? 'text-status-green' : 'text-text-secondary',
            ].join(' ')}
          >
            {fmtMoney(variance, { dollar: true })}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      width: '110px',
      align: 'left' as const,
      sortKey: 'status',
      cell: (row: Reconciliation) => (
        <StatusBadge variant={STATUS_BADGE[row.status]} label={STATUS_LABEL[row.status]} />
      ),
    },
  ];

  const columns = batchMode ? batchColumns : normalColumns;

  const footer = batchMode ? undefined : (
    <tr>
      <td colSpan={2} className="px-3 py-2.5 text-xs font-medium text-text-secondary text-left">
        Totals
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        <MoneyCell value={totals.gl} showDollar />
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        <MoneyCell value={totals.sup} showDollar />
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        <MoneyCell value={totals.varTot} showDollar />
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-xs">
        <MoneyCell value={totals.unexTot} showDollar />
      </td>
      <td colSpan={6} />
    </tr>
  );

  if (isLoading || initializeMutation.isPending) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl text-primary">Reconciliation</h1>
          <p className="text-text-secondary text-sm mt-0.5">Loading reconciliations...</p>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl text-primary">Reconciliation</h1>
          <p className="text-text-secondary text-sm mt-0.5">Prove every significant balance sheet account</p>
        </div>
        <div className="bg-status-red-dim border border-status-red rounded-card p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-status-red shrink-0" />
          <div className="flex-1 text-sm text-status-red">{initError}</div>
          <button
            type="button"
            onClick={() => { setInitError(null); initAttempted.current = false; }}
            className="px-3 py-1.5 rounded-input border border-status-red text-status-red text-sm hover:opacity-80"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-primary">Reconciliation</h1>
          <p className="text-text-secondary text-sm mt-0.5">Prove every significant balance sheet account</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Batch Entry toggle */}
          <button
            type="button"
            onClick={handleToggleBatch}
            className={[
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-input border text-sm font-medium transition-colors',
              batchMode
                ? 'bg-accent text-white border-accent hover:opacity-90'
                : 'bg-surface text-text-secondary border-border hover:border-accent hover:text-accent',
            ].join(' ')}
            title={batchMode ? 'Exit batch entry mode' : 'Enter batch entry mode — edit supporting balances inline'}
          >
            <Layers className="w-4 h-4" />
            Batch Entry
          </button>
          <span className="text-sm text-text-secondary">
            {completed} of {total} complete ({progressPct}%)
          </span>
        </div>
      </div>

      {/* Batch mode info banner */}
      {batchMode && (
        <div className="flex items-center gap-3 py-2.5 px-4 rounded-input bg-surface border border-accent/40 text-sm text-text-secondary">
          <Layers className="w-4 h-4 text-accent shrink-0" />
          <span>
            Batch mode: type a supporting balance and press <kbd className="px-1 py-0.5 rounded bg-elevated border border-border font-mono text-xs">Tab</kbd> or <kbd className="px-1 py-0.5 rounded bg-elevated border border-border font-mono text-xs">Enter</kbd> to auto-save.
            Click any row to open the detail view.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 py-3 px-4 rounded-input bg-surface border border-border">
        <span className="text-status-green text-sm">Completed: {completed}</span>
        <span className="text-accent text-sm">In Progress: {inProgress}</span>
        <span className="text-text-muted text-sm">Not Started: {notStarted}</span>
        <span className="text-status-green text-sm inline-flex items-center gap-1">
          <Check className="w-4 h-4" /> Approved: {approved}
        </span>
        {overTolerance > 0 && (
          <span className="text-status-red font-medium text-sm">Over Tolerance: {overTolerance}</span>
        )}
        <div className="flex-1 min-w-[120px] max-w-[200px]">
          <div className="h-2 bg-elevated rounded-full overflow-hidden">
            <div className="h-full bg-status-green rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterBar
          searchPlaceholder="Search by account code or name"
          searchValue={search}
          onSearchChange={setSearch}
          pills={pills}
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overToleranceOnly}
              onChange={(e) => setOverToleranceOnly(e.target.checked)}
              className="rounded border-border"
            />
            Over tolerance only
          </label>
        </FilterBar>
      </div>

      <DataTable
        columns={columns}
        rows={sorted}
        getRowId={(r) => r.id}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={handleRowClick}
        footer={footer}
        rowClassName={rowClassName}
        emptyMessage="No reconciliations match your filters"
      />

      {/* Save All footer — only shown in batch mode when there are dirty rows */}
      {batchMode && (
        <div className="flex items-center justify-end gap-4 pt-1">
          {dirtyCount > 0 && (
            <span className="text-sm text-text-secondary">
              {dirtyCount} unsaved {dirtyCount === 1 ? 'entry' : 'entries'}
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSavingAll || dirtyCount === 0}
            className={[
              'inline-flex items-center gap-2 px-4 py-2 rounded-input border text-sm font-medium transition-colors',
              dirtyCount === 0
                ? 'bg-surface text-text-muted border-border cursor-not-allowed'
                : 'bg-accent text-white border-accent hover:opacity-90',
            ].join(' ')}
          >
            {isSavingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save All ({dirtyCount})
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
