'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { apiFetch } from '@/lib/api';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FilterBar } from '@/components/shared/FilterBar';
import type { Reconciliation, ReconStatus } from '@/lib/types/reconciliation';
import { moneyAbs, cmpMoney, sumMoneyStrings } from '@/lib/money';
import { Paperclip, Check, AlertCircle } from 'lucide-react';

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

  const filtered = useMemo(() => {
    let list = recons;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.accountCode.toLowerCase().includes(q) || r.accountName.toLowerCase().includes(q));
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
    const over = row.supportingBalance != null && moneyAbs(row.unexplainedVariance) > moneyAbs(row.tolerance);
    const completedNotApproved = row.status === 'completed' && !row.reviewer;
    if (over) return 'border-l-4 border-l-status-red';
    if (completedNotApproved) return 'border-l-4 border-l-status-amber';
    return '';
  };

  const columns = [
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
      header: 'Variance',
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

  const footer = (
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
      <td colSpan={5} />
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-primary">Reconciliation</h1>
          <p className="text-text-secondary text-sm mt-0.5">Prove every significant balance sheet account</p>
        </div>
        <span className="text-sm text-text-secondary">
          {completed} of {total} complete ({progressPct}%)
        </span>
      </div>

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
    </div>
  );
}
