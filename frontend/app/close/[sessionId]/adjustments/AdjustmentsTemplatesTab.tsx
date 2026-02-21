'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { cn } from '@/lib/utils';
import type { AJETemplate } from '@/lib/types/journal-entry';

const FREQ_BADGE: Record<string, 'neutral' | 'info'> = { Monthly: 'info', Quarterly: 'neutral', Annual: 'neutral' };
const PERIOD_BADGE: Record<string, 'warning' | 'success' | 'neutral'> = { pending: 'warning', applied: 'success', skipped: 'neutral' };
const PERIOD_LABEL: Record<string, string> = { pending: 'Pending', applied: 'Applied', skipped: 'Skipped' };

export interface AdjustmentsTemplatesTabProps {
  sessionId: string;
  templates: AJETemplate[];
  journalEntries: { id: string; jeNumber: number }[];
  onApplyTemplate: (template: AJETemplate) => void;
  onSkipTemplate: (templateId: string, reason: string) => void;
  onUndoSkip: (templateId: string) => void;
  onBulkApply: () => void;
}

export function AdjustmentsTemplatesTab({
  templates,
  journalEntries,
  onApplyTemplate,
  onSkipTemplate,
  onUndoSkip,
  onBulkApply,
  sessionId,
}: AdjustmentsTemplatesTabProps) {
  const jeNumberById = useMemo(() => Object.fromEntries(journalEntries.map((e) => [e.id, e.jeNumber])), [journalEntries]);
  const [skipTemplateId, setSkipTemplateId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [applyConfirm, setApplyConfirm] = useState<AJETemplate | null>(null);
  const [bulkApplyConfirm, setBulkApplyConfirm] = useState(false);

  const pending = templates.filter((t) => t.periodStatus === 'pending');
  const resolved = templates.filter((t) => t.periodStatus === 'applied' || t.periodStatus === 'skipped');
  const allResolved = pending.length === 0;

  const columns = [
    {
      id: 'name',
      header: 'Template Name',
      sortKey: 'name' as const,
      cell: (row: AJETemplate) => <span className="font-medium text-primary">{row.name}</span>,
    },
    {
      id: 'frequency',
      header: 'Frequency',
      width: '100px',
      cell: (row: AJETemplate) => <StatusBadge variant={FREQ_BADGE[row.frequency] ?? 'neutral'} label={row.frequency} />,
    },
    {
      id: 'accounts',
      header: 'Accounts',
      cell: (row: AJETemplate) => (
        <span className="text-sm text-text-secondary font-mono">
          {row.debitAccountCode} {row.debitAccountName} ↔ {row.creditAccountCode} {row.creditAccountName}
        </span>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      width: '130px',
      align: 'right' as const,
      cell: (row: AJETemplate) => <MoneyCell value={row.amount} showDollar />,
    },
    {
      id: 'periodStatus',
      header: 'Period Status',
      width: '110px',
      cell: (row: AJETemplate) => (
        <StatusBadge
          variant={PERIOD_BADGE[row.periodStatus]}
          label={PERIOD_LABEL[row.periodStatus]}
          className={row.periodStatus === 'skipped' ? 'line-through' : ''}
        />
      ),
    },
    {
      id: 'appliedBy',
      header: 'Applied/Skipped By',
      width: '180px',
      cell: (row: AJETemplate) =>
        row.appliedOrSkippedBy ? (
          <span className="text-sm">
            {row.appliedOrSkippedBy}
            {row.appliedOrSkippedAt && <span className="text-text-muted block text-xs">{new Date(row.appliedOrSkippedAt).toLocaleString()}</span>}
          </span>
        ) : (
          '—'
        ),
    },
    {
      id: 'action',
      header: 'Action',
      width: '200px',
      cell: (row: AJETemplate) => {
        if (row.periodStatus === 'pending') {
          return (
            <div className="flex gap-2">
              <button type="button" className="text-sm text-accent hover:underline" onClick={() => setApplyConfirm(row)}>
                Apply
              </button>
              <button type="button" className="text-sm text-text-secondary hover:underline" onClick={() => setSkipTemplateId(row.id)}>
                Skip
              </button>
            </div>
          );
        }
        if (row.periodStatus === 'applied' && row.resultingJeId) {
          const num = jeNumberById[row.resultingJeId];
          return (
            <Link href={`/close/${sessionId}/adjustments?tab=entries`} className="text-sm text-accent hover:underline">
              View JE #{num ?? '?'} →
            </Link>
          );
        }
        if (row.periodStatus === 'skipped') {
          return (
            <div className="flex gap-2">
              <span title={row.skipReason ?? ''} className="text-sm text-text-muted truncate max-w-[120px]">
                {row.skipReason ? 'Skipped' : ''}
              </span>
              <button type="button" className="text-sm text-text-secondary hover:underline" onClick={() => onUndoSkip(row.id)}>
                Undo Skip
              </button>
            </div>
          );
        }
        return null;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {allResolved ? (
          <p className="text-status-green text-sm font-medium">All templates resolved ✓</p>
        ) : (
          <>
            <p className="text-status-amber text-sm">
              {resolved.length} of {templates.length} templates resolved ({pending.length} pending). This blocks advancement.
            </p>
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-elevated rounded-full overflow-hidden">
                <div className="h-full bg-status-green rounded-full" style={{ width: `${(resolved.length / templates.length) * 100}%` }} />
              </div>
              <span className="text-xs text-text-tertiary">{resolved.length}/{templates.length}</span>
            </div>
          </>
        )}
        {pending.length > 0 && (
          <button
            type="button"
            className="px-4 py-2 rounded-input bg-accent text-white text-sm font-medium hover:bg-accent/90"
            onClick={() => setBulkApplyConfirm(true)}
          >
            Apply All Remaining
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={templates}
        getRowId={(r) => r.id}
        emptyMessage="No templates"
        rowClassName={(r) => (r.periodStatus === 'skipped' ? 'opacity-75' : '')}
      />

      {skipTemplateId && (
        <div className="p-4 rounded-card border border-border bg-surface">
          <label className="block text-sm font-medium text-primary mb-2">Skip reason (min 10 characters)</label>
          <textarea
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            className="w-full px-3 py-2 rounded-input border border-border bg-input text-sm min-h-[80px]"
            placeholder="e.g. No equipment additions this period — depreciation schedule unchanged from prior period"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="px-4 py-2 rounded-input bg-accent text-white text-sm"
              disabled={skipReason.trim().length < 10}
              onClick={() => {
                onSkipTemplate(skipTemplateId, skipReason.trim());
                setSkipTemplateId(null);
                setSkipReason('');
              }}
            >
              Skip Template
            </button>
            <button type="button" className="px-4 py-2 rounded-input border border-border text-sm" onClick={() => setSkipTemplateId(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!applyConfirm}
        onClose={() => setApplyConfirm(null)}
        onConfirm={() => {
          if (applyConfirm) {
            onApplyTemplate(applyConfirm);
            setApplyConfirm(null);
          }
        }}
        title="Apply template?"
        message={`Create a draft journal entry from "${applyConfirm?.name}".`}
        detail={`Accounts: ${applyConfirm?.debitAccountCode} ${applyConfirm?.debitAccountName} (debit) ↔ ${applyConfirm?.creditAccountCode} ${applyConfirm?.creditAccountName} (credit)\nAmount: $${applyConfirm?.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
        confirmLabel="Apply"
      />

      <ConfirmDialog
        open={bulkApplyConfirm}
        onClose={() => setBulkApplyConfirm(false)}
        onConfirm={() => {
          onBulkApply();
          setBulkApplyConfirm(false);
        }}
        title="Apply all remaining templates?"
        message={`This will create ${pending.length} draft journal entries. Review and post each one individually.`}
        confirmLabel="Apply All"
      />
    </div>
  );
}
