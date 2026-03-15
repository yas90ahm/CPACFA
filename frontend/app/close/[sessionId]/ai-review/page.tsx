'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AISuggestionBadge } from '@/components/shared/AISuggestionBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { StatusType } from '@/components/shared/StatusBadge';
import {
  Brain,
  CheckCircle2,
  XCircle,
  Clock,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Filter,
  BarChart3,
  AlertTriangle,
  Target,
} from 'lucide-react';
import { useHITLStaging, useResolveStaging, useDecisionRecords, useJustifications, type StagingItem } from '@/lib/queries/ai-insights';
import { EmptyState } from '@/components/shared/EmptyState';

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

/** Map HITL staging statuses to shared StatusBadge StatusType */
const HITL_STATUS_MAP: Record<string, StatusType> = {
  pending: 'pending',
  approved: 'complete',
  rejected: 'failed',
};

function StagingItemCard({ item, onApprove, onReject, resolving }: {
  item: StagingItem;
  onApprove: () => void;
  onReject: (reason: string) => void;
  resolving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const isPending = item.status === 'pending';

  return (
    <div
      className="rounded-xl overflow-hidden transition-colors"
      style={{
        background: 'var(--bg-surface)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: isPending ? 'var(--ai-border)' : 'var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            style={{
              background: isPending
                ? 'var(--ai-bg)'
                : item.status === 'approved'
                  ? 'var(--status-success-bg)'
                  : 'var(--status-error-bg)',
            }}
          >
            {isPending ? (
              <Sparkles className="w-4 h-4" style={{ color: 'var(--ai-primary)' }} />
            ) : item.status === 'approved' ? (
              <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
            ) : (
              <XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={HITL_STATUS_MAP[item.status] ?? 'not-started'} size="sm" />
              <AISuggestionBadge label="AI Justification" confidence={item.confidence ?? undefined} />
              <span className="text-xs capitalize" style={{ color: 'var(--text-tertiary)' }}>{item.type.replace(/_/g, ' ')}</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.proposedAction}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {formatRelativeTime(item.createdAt)}
              {item.approvedBy && ` · Approved by ${item.approvedBy}`}
              {item.rejectedReason && ` · Rejected: ${item.rejectedReason}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {item.justification && (
            <div className="mt-3 p-4 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--ai-primary)' }}>AI Justification (IRAC)</p>
              <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{item.justification}</p>
            </div>
          )}

          {item.amount && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span style={{ color: 'var(--text-tertiary)' }}>Financial Impact:</span>
              <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>${item.amount}</span>
            </div>
          )}

          {item.payload && Object.keys(item.payload).length > 0 && (
            <details className="mt-3">
              <summary className="text-xs cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>Technical Details</summary>
              <pre
                className="mt-1 p-2 rounded text-xs overflow-x-auto"
                style={{ background: 'var(--bg-surface-sunken)', color: 'var(--text-tertiary)' }}
              >
                {JSON.stringify(item.payload, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Actions for pending items */}
      {isPending && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {showRejectInput ? (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{
                  background: 'var(--bg-surface-sunken)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={resolving || !rejectReason.trim()}
                  onClick={() => { onReject(rejectReason); setShowRejectInput(false); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                  style={{ background: 'var(--status-error-bg)', color: 'var(--status-error)' }}
                >
                  Confirm Reject
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectInput(false)}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                disabled={resolving}
                onClick={onApprove}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Approve
              </button>
              <button
                type="button"
                disabled={resolving}
                onClick={() => setShowRejectInput(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'var(--status-error-bg)', color: 'var(--status-error)' }}
              >
                <ThumbsDown className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AIReviewQueuePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const { data: allStaging = [], isLoading } = useHITLStaging();
  const resolve = useResolveStaging();

  const filtered = useMemo(() => {
    if (filter === 'all') return allStaging;
    return allStaging.filter((s) => s.status === filter);
  }, [allStaging, filter]);

  const stats = useMemo(() => {
    const pending = allStaging.filter((s) => s.status === 'pending').length;
    const approved = allStaging.filter((s) => s.status === 'approved').length;
    const rejected = allStaging.filter((s) => s.status === 'rejected').length;
    const total = approved + rejected;
    const rejectionRate = total > 0 ? Math.round((rejected / total) * 100) : 0;
    return { pending, approved, rejected, rejectionRate };
  }, [allStaging]);

  const handleApprove = (id: string) => {
    resolve.mutate({ id, action: 'approve' });
  };

  const handleReject = (id: string, reason: string) => {
    resolve.mutate({ id, action: 'reject', reason });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 rounded-xl" style={{ background: 'var(--bg-surface)' }} />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--bg-surface)' }} />)}
        </div>
        <div className="h-48 rounded-xl" style={{ background: 'var(--bg-surface)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--ai-bg)' }}
          >
            <Brain className="w-5 h-5" style={{ color: 'var(--ai-primary)' }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>AI Review Queue</h1>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Review and approve AI-generated proposals</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Pending</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.pending}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)' }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Approved</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.approved}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)' }}>
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Rejected</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.rejected}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)' }}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4" style={{ color: 'var(--ai-primary)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Rejection Rate</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.rejectionRate}%</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize"
            style={
              filter === f
                ? { background: 'var(--ai-bg)', color: 'var(--ai-primary)' }
                : { color: 'var(--text-tertiary)' }
            }
          >
            {f}
            {f === 'pending' && stats.pending > 0 && (
              <span
                className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs"
                style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}
              >
                {stats.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Target}
          title={filter === 'pending' ? 'No proposals awaiting review' : `No ${filter} proposals`}
          description="AI proposals are generated when you upload GL data or post journal entries"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <StagingItemCard
              key={item.id}
              item={item}
              onApprove={() => handleApprove(item.id)}
              onReject={(reason) => handleReject(item.id, reason)}
              resolving={resolve.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
