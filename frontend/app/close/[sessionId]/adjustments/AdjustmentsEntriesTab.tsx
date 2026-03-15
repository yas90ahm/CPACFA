'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useJournalEntries } from '@/lib/queries/adjustments';
import { apiFetch } from '@/lib/api';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { cn } from '@/lib/utils';
import { sumMoneyStrings, moneyAbs } from '@/lib/money';
import type { JournalEntry, JournalEntryStatus } from '@/lib/types/journal-entry';
import { Paperclip, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { canCreateJE, canProposeJE, canApproveJE, canPostJE, isReadOnly as isRoleReadOnly } from '@/lib/permissions';

const STATUS_LABEL: Record<JournalEntryStatus, string> = {
  draft: 'Draft',
  proposed: 'Proposed',
  approved: 'Approved',
  posted: 'Posted',
  rejected: 'Rejected',
};
const STATUS_BADGE: Record<JournalEntryStatus, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral',
  proposed: 'info',
  approved: 'warning',
  posted: 'success',
  rejected: 'error',
};

export interface AdjustmentsEntriesTabProps {
  sessionId: string;
  entries: JournalEntry[];
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onNewEntry: () => void;
  onEdit: (je: JournalEntry) => void;
  onView: (je: JournalEntry) => void;
  onPropose: (je: JournalEntry) => void;
  onApprove: (je: JournalEntry) => void;
  onReject: (je: JournalEntry) => void;
  onPost: (je: JournalEntry) => void;
  onDelete: (je: JournalEntry) => void;
  onReverse?: (jeId: string) => void;
  statusFilter: JournalEntryStatus | 'all';
  onStatusFilterChange: (v: JournalEntryStatus | 'all') => void;
  search: string;
  onSearchChange: (v: string) => void;
}

export function AdjustmentsEntriesTab({
  sessionId,
  entries,
  expandedId,
  onExpand,
  onNewEntry,
  onEdit,
  onView,
  onPropose,
  onApprove,
  onReject,
  onPost,
  onDelete,
  onReverse,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
}: AdjustmentsEntriesTabProps) {
  const { user } = useAuth();
  const role = user?.role ?? 'controller';
  const userId = user?.userId ?? '';
  const readOnly = isRoleReadOnly(role);
  const canCreate = canCreateJE(role);
  const canPropose = canProposeJE(role);
  const canPost = canPostJE(role);

  const { data: manifest } = useQuery({
    queryKey: ['evidence-manifest', sessionId],
    queryFn: () =>
      apiFetch<{ jeEvidence: Array<{ jeId: string; files: Array<{ id: string; fileName: string }> }> }>(
        `/api/close/sessions/${sessionId}/evidence-manifest`
      ),
    enabled: !!sessionId,
  });

  const evidenceByJeId = useMemo(() => {
    const map: Record<string, Array<{ id: string; fileName: string }>> = {};
    manifest?.jeEvidence?.forEach((j) => {
      map[j.jeId] = j.files ?? [];
    });
    return map;
  }, [manifest]);

  const filtered = useMemo(() => {
    let list = entries;
    if (statusFilter !== 'all') list = list.filter((e) => e.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => String(e.jeNumber).includes(q) || (e.memo ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [entries, statusFilter, search]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => b.jeNumber - a.jeNumber), [filtered]);

  const columns = [
    { id: 'jeNumber', header: 'JE #', width: '70px', align: 'left' as const, sortKey: 'jeNumber', cell: (row: JournalEntry) => <span className="font-mono">{row.jeNumber}</span> },
    { id: 'date', header: 'Date', width: '100px', align: 'left' as const, cell: (row: JournalEntry) => <span className="text-sm">{new Date(row.date).toLocaleDateString()}</span> },
    { id: 'memo', header: 'Memo', cell: (row: JournalEntry) => <span className="text-sm truncate block max-w-[200px]" title={row.memo}>{row.memo}</span> },
    {
      id: 'debitTotal',
      header: 'Debit Total',
      width: '130px',
      align: 'right' as const,
      cell: (row: JournalEntry) => <MoneyCell value={sumMoneyStrings((row.lines ?? []).map(l => l.debit))} showDollar />,
    },
    {
      id: 'creditTotal',
      header: 'Credit Total',
      width: '130px',
      align: 'right' as const,
      cell: (row: JournalEntry) => <MoneyCell value={sumMoneyStrings((row.lines ?? []).map(l => l.credit))} showDollar />,
    },
    { id: 'status', header: 'Status', width: '130px', cell: (row: JournalEntry) => (
      <div className="flex items-center gap-1.5">
        <StatusBadge variant={STATUS_BADGE[row.status]} label={STATUS_LABEL[row.status]} />
        {row.reversalDate && <span className="text-xs text-accent font-medium" title={`Reverses on ${row.reversalDate}`}>↺</span>}
      </div>
    ) },
    { id: 'source', header: 'Source', width: '90px', cell: (row: JournalEntry) => <span className="text-sm">{row.source === 'template' ? 'Template' : 'Manual'}</span> },
    {
      id: 'evidence',
      header: 'Evidence',
      width: '60px',
      align: 'center' as const,
      cell: (row: JournalEntry) => {
        const count = row.evidenceCount;
        const required = moneyAbs(sumMoneyStrings((row.lines ?? []).map(l => l.debit))) >= 10_000;
        const missing = required && count === 0;
        return (
          <div className="flex justify-center">
            {count > 0 ? (
              <span className="inline-flex items-center gap-1 text-text-secondary" title={`${count} file(s)`}>
                <Paperclip className="w-4 h-4" />
                {count}
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
    { id: 'createdBy', header: 'Created By', width: '100px', cell: (row: JournalEntry) => <span className="text-sm">{row.createdBy}</span> },
    {
      id: 'actions',
      header: 'Actions',
      width: '120px',
      align: 'right' as const,
      cell: (row: JournalEntry) => {
        const canApproveThis = canApproveJE(role, row.createdBy ?? '', userId);
        if (readOnly) return <button type="button" className="text-sm text-accent hover:underline" onClick={() => onView(row)}>View</button>;
        if (row.status === 'draft') return <>{canCreate && <button type="button" className="text-sm text-accent hover:underline mr-2" onClick={() => onEdit(row)}>Edit</button>}{canPropose && <button type="button" className="text-sm text-accent hover:underline mr-2" onClick={() => onPropose(row)}>Propose</button>}{canCreate && <button type="button" className="text-sm text-status-red hover:underline" onClick={() => onDelete(row)}>Delete</button>}</>;
        if (row.status === 'proposed') return <><button type="button" className="text-sm text-accent hover:underline mr-2" onClick={() => onView(row)}>View</button>{canApproveThis && <button type="button" className="text-sm text-status-green hover:underline mr-2" onClick={() => onApprove(row)}>Approve</button>}{canApproveThis && <button type="button" className="text-sm text-status-red hover:underline" onClick={() => onReject(row)}>Reject</button>}</>;
        if (row.status === 'approved') return <><button type="button" className="text-sm text-accent hover:underline mr-2" onClick={() => onView(row)}>View</button>{canPost && <button type="button" className="text-sm text-status-green hover:underline" onClick={() => onPost(row)}>Post</button>}</>;
        if (row.status === 'posted') return <><button type="button" className="text-sm text-accent hover:underline mr-2" onClick={() => onView(row)}>View</button>{onReverse && <button type="button" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: 'var(--interactive-primary)' }} onClick={() => onReverse(row.id)}><RotateCcw className="w-3.5 h-3.5" />Reverse</button>}</>;
        if (row.status === 'rejected') return <>{canCreate && <button type="button" className="text-sm text-accent hover:underline mr-2" onClick={() => onEdit(row)}>Edit</button>}{canCreate && <button type="button" className="text-sm text-status-red hover:underline" onClick={() => onDelete(row)}>Delete</button>}</>;
        return null;
      },
    },
  ];

  const renderExpanded = (row: JournalEntry) => {
    const debitTotal = sumMoneyStrings((row.lines ?? []).map(l => l.debit));
    const creditTotal = sumMoneyStrings((row.lines ?? []).map(l => l.credit));
    const evidence = evidenceByJeId[row.id] ?? [];
    return (
      <div className="py-4 space-y-4">
        <div>
          <div className="text-xs text-text-tertiary mb-1">Memo</div>
          <p className="text-sm text-primary">{row.memo}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium text-text-secondary">Account Code</th>
                <th className="text-left py-2 font-medium text-text-secondary">Account Name</th>
                <th className="text-right py-2 font-medium text-text-secondary">Debit</th>
                <th className="text-right py-2 font-medium text-text-secondary">Credit</th>
              </tr>
            </thead>
            <tbody>
              {(row.lines ?? []).map((l) => (
                <tr key={l.id} className="border-b border-border-light">
                  <td className="py-2 font-mono">{l.accountCode}</td>
                  <td className="py-2">{l.accountName}</td>
                  <td className="py-2 text-right font-mono"><MoneyCell value={l.debit} showDollar /></td>
                  <td className="py-2 text-right font-mono"><MoneyCell value={l.credit} showDollar /></td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-medium">
                <td colSpan={2} className="py-2">Totals</td>
                <td className="py-2 text-right font-mono"><MoneyCell value={debitTotal} showDollar /></td>
                <td className="py-2 text-right font-mono"><MoneyCell value={creditTotal} showDollar /></td>
              </tr>
            </tbody>
          </table>
        </div>
        {row.templateName && (
          <p className="text-sm text-text-secondary">Source: {row.templateName}</p>
        )}
        {evidence.length > 0 && (
          <div>
            <div className="text-xs text-text-tertiary mb-2">Evidence</div>
            <ul className="text-sm space-y-1">
              {evidence.map((f) => (
                <li key={f.id}>{f.fileName}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="text-xs text-text-secondary space-y-1">
          <div>Created by {row.createdBy} at {new Date(row.createdAt).toLocaleString()}</div>
          {row.proposedBy && <div>Proposed by {row.proposedBy} at {row.proposedAt ? new Date(row.proposedAt).toLocaleString() : ''}</div>}
          {row.approvedBy && <div>Approved by {row.approvedBy} at {row.approvedAt ? new Date(row.approvedAt).toLocaleString() : ''}</div>}
          {row.postedBy && <div>Posted by {row.postedBy} at {row.postedAt ? new Date(row.postedAt).toLocaleString() : ''}</div>}
        </div>
        {row.rejectionReason && (
          <div className="p-3 rounded-input bg-status-red-dim border border-status-red/30 text-status-red text-sm">
            Rejected by {row.rejectedBy}: {row.rejectionReason}
          </div>
        )}
      </div>
    );
  };

  const pills: { id: string; label: string; active: boolean }[] = [
    { id: 'all', label: 'All', active: statusFilter === 'all' },
    { id: 'draft', label: 'Draft', active: statusFilter === 'draft' },
    { id: 'proposed', label: 'Proposed', active: statusFilter === 'proposed' },
    { id: 'approved', label: 'Approved', active: statusFilter === 'approved' },
    { id: 'posted', label: 'Posted', active: statusFilter === 'posted' },
    { id: 'rejected', label: 'Rejected', active: statusFilter === 'rejected' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by JE # or memo…"
          className="px-3 py-2 rounded-input border border-border bg-input text-sm w-64"
        />
        {pills.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onStatusFilterChange(p.id === 'all' ? 'all' : (p.id as JournalEntryStatus))}
            className={cn('px-3 py-1.5 rounded-input text-xs font-medium border', p.active ? 'bg-accent-dim text-accent border-accent/30' : 'bg-elevated text-text-secondary border-border-light hover:bg-hover')}
          >
            {p.label}
          </button>
        ))}
        {canCreate && (
          <button
            type="button"
            className="ml-auto px-4 py-2 rounded-input bg-accent text-white text-sm font-medium hover:bg-accent/90"
            onClick={onNewEntry}
          >
            + New Journal Entry
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={sorted}
        getRowId={(r) => r.id}
        sortKey="jeNumber"
        sortDir="desc"
        onRowClick={(row) => onExpand(expandedId === row.id ? null : row.id)}
        expandedRowId={expandedId}
        renderExpanded={renderExpanded}
        emptyMessage="No journal entries"
        rowClassName={(row) => {
          if (row.status === 'posted') return 'border-l-4 border-l-status-green';
          if (row.status === 'rejected') return 'border-l-4 border-l-status-red';
          return '';
        }}
      />
    </div>
  );
}
