'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400',
    approved: 'bg-emerald-500/10 text-emerald-400',
    rejected: 'bg-red-500/10 text-red-400',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider', styles[status] ?? 'bg-gray-500/10 text-gray-400')}>
      {status}
    </span>
  );
}

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
    <div className={cn(
      'bg-[#141829] border rounded-xl overflow-hidden transition-colors',
      isPending ? 'border-[#7C5CFC]/20' : 'border-[#1e2235]'
    )}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
            isPending ? 'bg-[#7C5CFC]/10' : item.status === 'approved' ? 'bg-emerald-500/10' : 'bg-red-500/10'
          )}>
            {isPending ? <Sparkles className="w-4 h-4 text-[#7C5CFC]" /> :
             item.status === 'approved' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
             <XCircle className="w-4 h-4 text-red-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={item.status} />
              <span className="text-[10px] text-gray-600 capitalize">{item.type.replace(/_/g, ' ')}</span>
            </div>
            <p className="text-sm text-gray-200">{item.proposedAction}</p>
            <p className="text-[11px] text-gray-600 mt-1">
              {formatRelativeTime(item.createdAt)}
              {item.approvedBy && ` · Approved by ${item.approvedBy}`}
              {item.rejectedReason && ` · Rejected: ${item.rejectedReason}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded text-gray-600 hover:text-gray-400"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[#1e2235]">
          {item.justification && (
            <div className="mt-3 p-4 bg-[#0d1017] rounded-lg">
              <p className="text-[10px] font-semibold text-[#7C5CFC] uppercase tracking-wider mb-2">AI Justification (IRAC)</p>
              <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{item.justification}</p>
            </div>
          )}

          {item.amount && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">Financial Impact:</span>
              <span className="text-white font-mono font-medium">${item.amount}</span>
            </div>
          )}

          {item.payload && Object.keys(item.payload).length > 0 && (
            <details className="mt-3">
              <summary className="text-[10px] text-gray-600 cursor-pointer hover:text-gray-400">Technical Details</summary>
              <pre className="mt-1 p-2 bg-[#0d1017] rounded text-[10px] text-gray-500 overflow-x-auto">
                {JSON.stringify(item.payload, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Actions for pending items */}
      {isPending && (
        <div className="px-4 pb-4 border-t border-[#1e2235]">
          {showRejectInput ? (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                className="w-full px-3 py-2 rounded-lg bg-[#0d1017] border border-[#262C48] text-sm text-white placeholder:text-gray-600 focus:border-red-500/50 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={resolving || !rejectReason.trim()}
                  onClick={() => { onReject(rejectReason); setShowRejectInput(false); }}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 disabled:opacity-50"
                >
                  Confirm Reject
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectInput(false)}
                  className="px-3 py-1.5 rounded-lg text-gray-500 text-xs hover:text-gray-300"
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Approve
              </button>
              <button
                type="button"
                disabled={resolving}
                onClick={() => setShowRejectInput(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
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
        <div className="h-20 bg-[#141829] rounded-xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-[#141829] rounded-xl" />)}
        </div>
        <div className="h-48 bg-[#141829] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#7C5CFC]/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-[#7C5CFC]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">AI Review Queue</h1>
            <p className="text-sm text-gray-500">Review and approve AI-generated proposals</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Pending</span>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{stats.pending}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Approved</span>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{stats.approved}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Rejected</span>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{stats.rejected}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-[#7C5CFC]" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Rejection Rate</span>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{stats.rejectionRate}%</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-600" />
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize',
              filter === f ? 'bg-[#7C5CFC]/10 text-[#7C5CFC]' : 'text-gray-500 hover:text-gray-300 hover:bg-[#141829]'
            )}
          >
            {f}
            {f === 'pending' && stats.pending > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[9px]">{stats.pending}</span>
            )}
          </button>
        ))}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-12 text-center">
          <Target className="w-8 h-8 mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">
            {filter === 'pending' ? 'No proposals awaiting review' : `No ${filter} proposals`}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            AI proposals are generated when you upload GL data or post journal entries
          </p>
        </div>
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
