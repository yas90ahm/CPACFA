'use client';

import { useParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTrialBalance } from '@/lib/queries/trial-balance';
import { useTrialBalanceContext } from '../context/trial-balance-context';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { FilterBar } from '@/components/shared/FilterBar';
import { cn } from '@/lib/utils';
import { cmpMoney, moneyAbs, sumMoneyStrings } from '@/lib/money';
import { apiFetch } from '@/lib/api';
import type { TrialBalanceRow, AccountType, GLDrillDownResponse } from '@/lib/types/trial-balance';

const ACCOUNT_TYPE_STYLE: Record<AccountType, string> = {
  ASSET: 'bg-status-blue-dim text-status-blue',
  LIABILITY: 'bg-status-amber-dim text-status-amber',
  EQUITY: 'bg-equity-dim text-equity',
  REVENUE: 'bg-status-green-dim text-status-green',
  EXPENSE: 'bg-status-red-dim text-status-red',
};

export default function TrialBalancePage() {
  const p = useParams();
  const sessionId = p.sessionId as string;
  const [adjusted, setAdjusted] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilters, setTypeFilters] = useState<Set<AccountType>>(new Set());
  const [mappingFilter, setMappingFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [sortKey, setSortKey] = useState<keyof TrialBalanceRow | string | null>('accountCode');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: drillDown, isLoading: drillDownLoading } = useQuery({
    queryKey: ['tb-drill-down', sessionId, expandedId],
    queryFn: () =>
      apiFetch<GLDrillDownResponse>(
        `/api/close/sessions/${sessionId}/trial-balance/${encodeURIComponent(expandedId!)}/entries`
      ),
    enabled: !!sessionId && !!expandedId,
    staleTime: 30_000,
  });

  const { data, isLoading } = useTrialBalance(sessionId, adjusted);
  const { rows } = useTrialBalanceContext();
  const totalDebits = data?.totalDebits ?? '0.00';
  const totalCredits = data?.totalCredits ?? '0.00';
  const difference = sumMoneyStrings([totalDebits, `-${totalCredits.replace(/^-/, '')}`]);
  const balanced = moneyAbs(difference) < 0.02;
  const unmappedCount = rows.filter((r) => !r.mappingReportingLineId).length;

  const filtered = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.accountCode.toLowerCase().includes(q) || r.accountName.toLowerCase().includes(q)
      );
    }
    if (typeFilters.size > 0) {
      list = list.filter((r) => typeFilters.has(r.accountType));
    }
    if (mappingFilter === 'mapped') list = list.filter((r) => r.mappingReportingLineId != null);
    if (mappingFilter === 'unmapped') list = list.filter((r) => r.mappingStatus === 'unmapped');

    const key = sortKey as keyof TrialBalanceRow;
    const moneyKeys = new Set(['debitBalance', 'creditBalance', 'netBalance']);
    if (key) {
      list = [...list].sort((a, b) => {
        if (moneyKeys.has(key)) {
          const c = cmpMoney(a[key] as string, b[key] as string);
          return sortDir === 'asc' ? c : -c;
        }
        const as = String(a[key] ?? '');
        const bs = String(b[key] ?? '');
        return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
      });
    }
    return list;
  }, [rows, search, typeFilters, mappingFilter, sortKey, sortDir]);

  const typePills = (['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const).map(
    (t) => ({
      id: t,
      label: t,
      active: typeFilters.has(t),
      toggle: () => {
        setTypeFilters((prev) => {
          const next = new Set(prev);
          if (next.has(t)) next.delete(t);
          else next.add(t);
          return next;
        });
      },
    })
  );

  const mappingPills = [
    { id: 'all', label: 'All', active: mappingFilter === 'all', toggle: () => setMappingFilter('all') },
    { id: 'mapped', label: 'Mapped', active: mappingFilter === 'mapped', toggle: () => setMappingFilter('mapped') },
    { id: 'unmapped', label: 'Unmapped', active: mappingFilter === 'unmapped', toggle: () => setMappingFilter('unmapped') },
  ];

  const columns = [
    {
      id: 'code',
      header: 'Account Code',
      width: '100px',
      align: 'left' as const,
      sortKey: 'accountCode',
      cell: (r: TrialBalanceRow) => <span className="font-mono text-primary">{r.accountCode}</span>,
    },
    {
      id: 'name',
      header: 'Account Name',
      align: 'left' as const,
      cell: (r: TrialBalanceRow) => <span className="text-primary">{r.accountName}</span>,
    },
    {
      id: 'type',
      header: 'Account Type',
      width: '100px',
      align: 'left' as const,
      sortKey: 'accountType',
      cell: (r: TrialBalanceRow) => (
        <span className={cn('px-2 py-0.5 rounded text-xs', ACCOUNT_TYPE_STYLE[r.accountType])}>
          {r.accountType}
        </span>
      ),
    },
    {
      id: 'debit',
      header: 'Debit Balance',
      width: '140px',
      align: 'right' as const,
      sortKey: 'debitBalance',
      cell: (r: TrialBalanceRow) => <MoneyCell value={r.debitBalance} />,
    },
    {
      id: 'credit',
      header: 'Credit Balance',
      width: '140px',
      align: 'right' as const,
      sortKey: 'creditBalance',
      cell: (r: TrialBalanceRow) => <MoneyCell value={r.creditBalance} />,
    },
    {
      id: 'net',
      header: 'Net Balance',
      width: '140px',
      align: 'right' as const,
      sortKey: 'netBalance',
      cell: (r: TrialBalanceRow) => <MoneyCell value={r.netBalance} />,
    },
    {
      id: 'mapping',
      header: 'Mapping',
      width: '180px',
      align: 'left' as const,
      cell: (r: TrialBalanceRow) =>
        r.mappingReportingLineName ? (
          <span className="text-primary">{r.mappingReportingLineName}</span>
        ) : (
          <span className="text-status-amber">⚠ Unmapped</span>
        ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '80px',
      align: 'center' as const,
      cell: (r: TrialBalanceRow) => (
        <span
          className={cn(
            'inline-block w-2 h-2 rounded-full',
            r.mappingStatus === 'mapped' && 'bg-status-green',
            r.mappingStatus === 'unmapped' && 'bg-status-amber',
            r.mappingStatus === 'changed' && 'bg-status-amber'
          )}
          title={r.mappingStatus}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-primary">Trial Balance</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {data?.periodLabel ?? '—'} — {adjusted ? 'Adjusted' : 'Unadjusted'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAdjusted(false)}
            className={cn(
              'px-3 py-1.5 rounded-input text-sm border',
              !adjusted ? 'bg-accent-dim text-accent border-accent/30' : 'bg-elevated text-text-secondary border-border-light'
            )}
          >
            Unadjusted
          </button>
          <button
            type="button"
            onClick={() => setAdjusted(true)}
            className={cn(
              'px-3 py-1.5 rounded-input text-sm border',
              adjusted ? 'bg-accent-dim text-accent border-accent/30' : 'bg-elevated text-text-secondary border-border-light'
            )}
          >
            Adjusted
          </button>
          {!data?.rows?.length && <span className="text-xs text-text-tertiary">No adjustments posted</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 py-2 px-3 rounded-input bg-surface border border-border">
        <span className="font-mono text-sm text-primary">Total Debits: <MoneyCell value={totalDebits} showDollar /></span>
        <span className="font-mono text-sm text-primary">Total Credits: <MoneyCell value={totalCredits} showDollar /></span>
        <span className={cn('font-mono text-sm', balanced ? 'text-status-green' : 'text-status-red')}>
          Difference: <MoneyCell value={difference} showDollar />
        </span>
        <span className="text-text-secondary text-sm">Account Count: {filtered.length}</span>
        {rows.length === 0 ? (
          <span className="text-text-tertiary text-sm">No accounts loaded</span>
        ) : unmappedCount > 0 ? (
          <span className="px-2 py-0.5 rounded text-xs bg-status-amber-dim text-status-amber">Unmapped: {unmappedCount}</span>
        ) : (
          <span className="text-status-green text-sm">All mapped</span>
        )}
      </div>

      <FilterBar
        searchPlaceholder="Search by code or name…"
        searchValue={search}
        onSearchChange={setSearch}
        pills={[...typePills, ...mappingPills]}
      />

      <DataTable<TrialBalanceRow>
        columns={columns}
        rows={filtered}
        getRowId={(r) => r.accountCode}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={(k) => {
          if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          else setSortKey(k);
        }}
        onRowClick={(r) => setExpandedId(expandedId === r.accountCode ? null : r.accountCode)}
        expandedRowId={expandedId}
        renderExpanded={(r) => {
          const entries = expandedId === r.accountCode ? (drillDown?.entries ?? []) : [];
          const loading = expandedId === r.accountCode && drillDownLoading;
          return (
            <div>
              <div className="text-xs font-medium text-text-secondary mb-2">GL entries</div>
              {loading ? (
                <div className="py-4 text-center text-sm text-text-tertiary">Loading entries…</div>
              ) : entries.length === 0 ? (
                <div className="py-4 text-center text-sm text-text-tertiary">No entries found for this account.</div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-text-tertiary text-left">
                      <th className="pr-4">Date</th>
                      <th className="pr-4">Description</th>
                      <th className="text-right pr-4">Debit</th>
                      <th className="text-right pr-4">Credit</th>
                      <th className="pr-4">Source</th>
                      <th>JE #</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td className="font-mono pr-4">{e.date}</td>
                        <td className="pr-4">{e.description ?? '—'}</td>
                        <td className="font-mono text-right pr-4"><MoneyCell value={e.debit} /></td>
                        <td className="font-mono text-right pr-4"><MoneyCell value={e.credit} /></td>
                        <td className="pr-4">
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-xs',
                            e.source === 'adjusting_entry'
                              ? 'bg-accent-dim text-accent'
                              : 'bg-elevated text-text-secondary'
                          )}>
                            {e.source === 'adjusting_entry' ? 'AJE' : 'GL'}
                          </span>
                        </td>
                        <td className="font-mono text-text-tertiary">{e.jeNumber ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {r.mappingStatus === 'unmapped' && (
                <Link
                  href={`/close/${sessionId}/mapping?unmapped=1`}
                  className="mt-2 inline-block text-sm text-accent hover:underline"
                >
                  Map this account →
                </Link>
              )}
            </div>
          );
        }}
        footer={
          filtered.length > 0 ? (
          <tr>
            <td colSpan={3} className="px-3 py-2.5 text-right font-medium text-primary">Total</td>
            <td className="px-3 py-2.5 text-right font-mono text-primary"><MoneyCell value={totalDebits} showDollar /></td>
            <td className="px-3 py-2.5 text-right font-mono text-primary"><MoneyCell value={totalCredits} showDollar /></td>
            <td colSpan={3} />
          </tr>
          ) : undefined
        }
        emptyMessage={rows.length === 0 ? 'No trial balance data yet. Upload a GL or trial balance from the dashboard.' : undefined}
        loading={isLoading}
        rowClassName={(r) => (r.mappingStatus === 'unmapped' ? 'border-l-4 border-l-status-amber bg-status-amber/5' : '')}
      />
    </div>
  );
}
