'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useTrialBalance } from '@/lib/queries/trial-balance';
import { apiFetch } from '@/lib/api';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FilterBar } from '@/components/shared/FilterBar';
import type { Reconciliation, ReconStatus } from '@/lib/types/reconciliation';
import { moneyAbs, cmpMoney, sumMoneyStrings, fmtMoney } from '@/lib/money';
import { Paperclip, Check, AlertCircle, Layers, CheckCircle2, Loader2, ClipboardList, FileDown, Columns } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ContinueToNextStep } from '@/components/shared/ContinueToNextStep';
import { canCompleteRecon, isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';

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
    return <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-tertiary)' }} />;
  }
  if (state === 'saved') {
    return <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--status-success)' }} />;
  }
  if (state === 'error') {
    return <span title={error ?? 'Save failed'}><AlertCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} /></span>;
  }
  return null;
}

export default function ReconciliationPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { user } = useAuth();
  const role = user?.role ?? 'controller';
  const canRecon = canCompleteRecon(role);
  const readOnly = isRoleReadOnly(role);

  const queryClient = useQueryClient();
  const { data: reconciliations, isLoading } = useReconciliations(sessionId);
  const recons = reconciliations ?? [];
  const initAttempted = useRef(false);

  const [initError, setInitError] = useState<string | null>(null);
  const [showInitConfirm, setShowInitConfirm] = useState(false);

  // Fetch trial balance to show account names in confirmation dialog
  const { data: tbData } = useTrialBalance(sessionId, false);
  const tbRows = tbData?.rows ?? [];
  const balanceSheetAccounts = useMemo(
    () => tbRows.filter((r) => r.accountType === 'ASSET' || r.accountType === 'LIABILITY' || r.accountType === 'EQUITY'),
    [tbRows]
  );

  const initializeMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/reconciliations/initialize`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
      setShowInitConfirm(false);
    },
    onError: (err) => {
      setInitError(err instanceof Error ? err.message : 'Failed to initialize reconciliations');
      setShowInitConfirm(false);
    },
  });

  const [search, setSearch] = useState('');
  const hasIncomplete = recons.some((r) => r.status === 'not_started' || r.status === 'in_progress');
  const [statusFilter, setStatusFilter] = useState<ReconStatus | 'all'>('all');
  const [overToleranceOnly, setOverToleranceOnly] = useState(false);
  const [sortKey, setSortKey] = useState<keyof Reconciliation | string>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // ─── Column visibility ──────────────────────────────────────────────────────
  const [showAllColumns, setShowAllColumns] = useState(false);
  const defaultColumnIds = ['accountCode', 'accountName', 'status', 'glBalance', 'supportingBalance', 'variance', 'evidence'];
  const extraColumnIds = ['unexplainedVariance', 'tolerance', 'prior', 'preparer', 'reviewer'];

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
        return 'border-l-4';
      }
      if (variance !== '' && !isOverTolerance(variance, row.tolerance) && Math.abs(parseFloat(variance) || 0) === 0) {
        return 'border-l-4';
      }
      return '';
    }
    const over = row.supportingBalance != null && moneyAbs(row.unexplainedVariance) > moneyAbs(row.tolerance);
    const completedNotApproved = row.status === 'completed' && !row.reviewer;
    if (over) return 'border-l-4';
    if (completedNotApproved) return 'border-l-4';
    return '';
  };

  const rowStyle = (row: Reconciliation): React.CSSProperties => {
    if (batchMode) {
      const rowState = batchRows[row.id];
      const inputVal = rowState?.value ?? '';
      const variance = computeVarianceDisplay(row.glBalance, inputVal);
      if (variance !== '' && isOverTolerance(variance, row.tolerance)) {
        return { borderLeftColor: 'var(--status-error)', backgroundColor: 'var(--status-error-bg)' };
      }
      if (variance !== '' && !isOverTolerance(variance, row.tolerance) && Math.abs(parseFloat(variance) || 0) === 0) {
        return { borderLeftColor: 'var(--status-success)' };
      }
      return {};
    }
    const over = row.supportingBalance != null && moneyAbs(row.unexplainedVariance) > moneyAbs(row.tolerance);
    const completedNotApproved = row.status === 'completed' && !row.reviewer;
    if (over) return { borderLeftColor: 'var(--status-error)', backgroundColor: 'var(--status-error-bg)' };
    if (completedNotApproved) return { borderLeftColor: 'var(--status-warning)' };
    return {};
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
      cell: (row: Reconciliation) => <span style={{ color: 'var(--text-primary)' }}>{row.accountName}</span>,
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
          <span className="font-mono" style={{ color: 'var(--text-tertiary)' }}>—</span>
        ),
    },
    {
      id: 'variance',
      header: 'Difference',
      width: '130px',
      align: 'right' as const,
      sortKey: 'variance',
      cell: (row: Reconciliation) => {
        if (row.supportingBalance == null) return <span className="font-mono" style={{ color: 'var(--text-tertiary)' }}>—</span>;
        const over = moneyAbs(row.unexplainedVariance) > moneyAbs(row.tolerance);
        return (
          <MoneyCell
            value={row.variance}
            showDollar
            className={over ? 'text-[var(--status-error)]' : 'text-[var(--status-success)]'}
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
        if (row.supportingBalance == null) return <span className="font-mono" style={{ color: 'var(--text-tertiary)' }}>—</span>;
        const over = moneyAbs(row.unexplainedVariance) > moneyAbs(row.tolerance);
        return (
          <MoneyCell
            value={row.unexplainedVariance}
            showDollar
            className={over ? 'text-[var(--status-error)]' : 'text-[var(--status-success)]'}
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
          <span className="font-mono" style={{ color: 'var(--text-tertiary)' }}>—</span>
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
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }} title={`${row.evidenceCount} file(s)`}>
                <Paperclip className="w-4 h-4" />
                {row.evidenceCount}
              </span>
            ) : missing ? (
              <span title="Required but missing"><Paperclip className="w-4 h-4" style={{ color: 'var(--status-error)' }} /></span>
            ) : (
              <span style={{ color: 'var(--text-tertiary)' }}>—</span>
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
      cell: (row: Reconciliation) => <span style={{ color: 'var(--text-primary)' }}>{row.accountName}</span>,
    },
    {
      id: 'glBalance',
      header: 'GL Balance',
      width: '140px',
      align: 'right' as const,
      sortKey: 'glBalance',
      cell: (row: Reconciliation) => (
        <span className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>{fmtMoney(row.glBalance, { dollar: true })}</span>
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
        const inputBorderColor = rowState.saveState === 'error'
          ? 'var(--status-error)'
          : rowState.dirty
          ? 'var(--interactive-primary)'
          : 'var(--border-default)';
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
              className="w-28 text-right font-mono text-sm px-2 py-1 border focus:outline-none focus:ring-1"
              style={{
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                borderColor: inputBorderColor,
                ...(rowState.saveState !== 'error' && !rowState.dirty ? {} : {}),
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = '0 0 0 1px var(--interactive-primary)';
              }}
              onBlurCapture={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
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
        if (variance === '') return <span className="font-mono" style={{ color: 'var(--text-tertiary)' }}>—</span>;
        const over = isOverTolerance(variance, row.tolerance);
        const zero = Math.abs(parseFloat(variance) || 0) === 0;
        const varColor = over
          ? 'var(--status-error)'
          : zero
          ? 'var(--status-success)'
          : 'var(--text-secondary)';
        return (
          <span
            className="font-mono text-sm"
            style={{ color: varColor }}
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

  const visibleNormalColumns = showAllColumns
    ? normalColumns
    : normalColumns.filter((c) => defaultColumnIds.includes(c.id));
  const columns = batchMode ? batchColumns : visibleNormalColumns;

  const footer = batchMode ? undefined : (
    <tr>
      <td colSpan={2} className="px-3 py-2.5 text-xs font-medium text-left" style={{ color: 'var(--text-secondary)' }}>
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
          <h1 className="font-display text-2xl" style={{ color: 'var(--text-primary)' }}>Balance Sheet Reconciliation</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Loading reconciliations...</p>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl" style={{ color: 'var(--text-primary)' }}>Balance Sheet Reconciliation</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Prove every significant balance sheet account</p>
        </div>
        <div
          className="border p-4 flex items-center gap-3"
          style={{
            backgroundColor: 'var(--status-error-bg)',
            borderColor: 'var(--status-error)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <AlertCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--status-error)' }} />
          <div className="flex-1 text-sm" style={{ color: 'var(--status-error)' }}>{initError}</div>
          <button
            type="button"
            onClick={() => { setInitError(null); initAttempted.current = false; }}
            className="px-3 py-1.5 border text-sm hover:opacity-80"
            style={{
              borderRadius: 'var(--radius-md)',
              borderColor: 'var(--status-error)',
              color: 'var(--status-error)',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (recons.length === 0 && !isLoading && !initializeMutation.isPending) {
    const accountsToShow = balanceSheetAccounts.length > 0 ? balanceSheetAccounts : tbRows;
    const previewCount = Math.min(10, accountsToShow.length);
    const remainingCount = accountsToShow.length - previewCount;

    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl" style={{ color: 'var(--text-primary)' }}>Balance Sheet Reconciliation</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Prove every significant balance sheet account</p>
        </div>
        {accountsToShow.length > 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Ready to initialize reconciliations"
            description={`${accountsToShow.length} accounts will be set up for reconciliation.`}
            actionLabel={initializeMutation.isPending ? 'Initializing...' : 'Initialize Reconciliations'}
            onAction={() => setShowInitConfirm(true)}
          />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="Complete account mapping first, then reconciliations will be initialized"
            description="Map your GL accounts to reporting line items so the system knows which balance sheet accounts need reconciliation."
            ctaLabel="Go to Mapping"
            ctaHref={`/close/${sessionId}/mapping`}
          />
        )}
        <ConfirmDialog
          open={showInitConfirm}
          onClose={() => setShowInitConfirm(false)}
          onConfirm={() => initializeMutation.mutate()}
          title="Initialize Reconciliations"
          message={
            <div>
              <p className="mb-3">The following accounts will be created for reconciliation:</p>
              <ul className="space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                {accountsToShow.slice(0, previewCount).map((row) => (
                  <li key={row.accountCode} className="flex items-center gap-2">
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{row.accountCode}</span>
                    <span>{row.accountName}</span>
                  </li>
                ))}
              </ul>
              {remainingCount > 0 && (
                <p className="mt-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  + {remainingCount} more account{remainingCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          }
          confirmLabel="Initialize"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl" style={{ color: 'var(--text-primary)' }}>Balance Sheet Reconciliation</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Prove every significant balance sheet account</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              const token = typeof window !== 'undefined' ? localStorage.getItem('cpa_auth_token') : null;
              const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
              const res = await fetch(`${API_URL}/api/close/sessions/${sessionId}/export/reconciliations.xlsx`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `reconciliations-${sessionId}.xlsx`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="px-3 py-1.5 rounded-full border text-sm transition-colors"
            style={{
              borderColor: 'var(--border-default)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-table-row-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <FileDown className="w-4 h-4 inline mr-1" />
            Export Excel
          </button>
          {/* Batch Entry toggle */}
          {canRecon && <button
            type="button"
            onClick={handleToggleBatch}
            className="inline-flex items-center gap-2 px-3 py-1.5 border text-sm font-medium transition-colors"
            style={batchMode
              ? {
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--interactive-primary)',
                  color: 'white',
                  borderColor: 'var(--interactive-primary)',
                }
              : {
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  borderColor: 'var(--border-default)',
                }
            }
            onMouseEnter={(e) => {
              if (!batchMode) {
                e.currentTarget.style.borderColor = 'var(--interactive-primary)';
                e.currentTarget.style.color = 'var(--interactive-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!batchMode) {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
            title={batchMode ? 'Exit batch entry mode' : 'Enter batch entry mode — edit supporting balances inline'}
          >
            <Layers className="w-4 h-4" />
            Batch Entry
          </button>}
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {completed} of {total} complete ({progressPct}%)
          </span>
        </div>
      </div>

      {/* Batch mode info banner */}
      {batchMode && (
        <div
          className="flex items-center gap-3 py-2.5 px-4 text-sm border"
          style={{
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--interactive-primary)',
            color: 'var(--text-secondary)',
          }}
        >
          <Layers className="w-4 h-4 shrink-0" style={{ color: 'var(--interactive-primary)' }} />
          <span>
            Batch mode: type a supporting balance and press{' '}
            <kbd
              className="px-1 py-0.5 rounded border font-mono text-xs"
              style={{
                backgroundColor: 'var(--bg-surface-sunken)',
                borderColor: 'var(--border-default)',
              }}
            >Tab</kbd>{' '}or{' '}
            <kbd
              className="px-1 py-0.5 rounded border font-mono text-xs"
              style={{
                backgroundColor: 'var(--bg-surface-sunken)',
                borderColor: 'var(--border-default)',
              }}
            >Enter</kbd>{' '}to auto-save.
            Click any row to open the detail view.
          </span>
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-3 py-3 px-4 border"
        style={{
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
        }}
      >
        <StatusBadge variant="success" label={`${completed} Complete`} />
        <StatusBadge variant="info" label={`${inProgress} In Progress`} />
        {notStarted > 0 && (
          <StatusBadge variant="neutral" label={`${notStarted} Not Started`} />
        )}
        {overTolerance > 0 && (
          <StatusBadge variant="warning" label={`${overTolerance} Over Tolerance`} />
        )}
        <div className="flex-1 min-w-[120px] max-w-[200px]">
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-surface-sunken)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressPct}%`, backgroundColor: 'var(--interactive-primary)' }}
            />
          </div>
        </div>
        <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>{progressPct}%</span>
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
              className="rounded"
              style={{ borderColor: 'var(--border-default)' }}
            />
            Over tolerance only
          </label>
        </FilterBar>
        {!batchMode && (
          <button
            type="button"
            onClick={() => setShowAllColumns((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border text-sm font-medium transition-colors"
            style={{
              borderRadius: 'var(--radius-md)',
              borderColor: showAllColumns ? 'var(--interactive-primary)' : 'var(--border-default)',
              color: showAllColumns ? 'var(--interactive-primary)' : 'var(--text-secondary)',
              backgroundColor: showAllColumns ? 'var(--interactive-primary-bg, rgba(59,130,246,0.08))' : 'transparent',
            }}
          >
            <Columns className="w-4 h-4" />
            {showAllColumns ? 'Fewer Columns' : 'All Columns'}
          </button>
        )}
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
        rowStyle={rowStyle}
        emptyMessage="No reconciliations match your filters"
      />

      <ContinueToNextStep
        currentStep="Reconciliation"
        nextStep={{ label: 'Adjustments', href: `/close/${sessionId}/adjustments` }}
        gatesPassed={total > 0 && completed === total}
        gateSummary={`All ${total} reconciliations complete`}
      />

      {/* Save All footer — only shown in batch mode when there are dirty rows */}
      {batchMode && (
        <div className="flex items-center justify-end gap-4 pt-1">
          {dirtyCount > 0 && (
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {dirtyCount} unsaved {dirtyCount === 1 ? 'entry' : 'entries'}
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSavingAll || dirtyCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border text-sm font-medium transition-colors"
            style={dirtyCount === 0
              ? {
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-tertiary)',
                  borderColor: 'var(--border-default)',
                  cursor: 'not-allowed',
                }
              : {
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--interactive-primary)',
                  color: 'white',
                  borderColor: 'var(--interactive-primary)',
                }
            }
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
