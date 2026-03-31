'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import { CheckCircle2, Circle, SkipForward, ChevronDown, ChevronRight, ClipboardList, Loader2 } from 'lucide-react';
import { useCloseSession } from '@/lib/queries/close-session';
import {
  useSessionChecklist,
  useInitializeChecklist,
  useCompleteChecklistItem,
  useSkipChecklistItem,
  type ChecklistItem,
} from '@/lib/queries/checklist';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';

/* ------------------------------------------------------------------ */
/*  Skeleton loader                                                    */
/* ------------------------------------------------------------------ */
function ChecklistSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="rounded-lg p-4 animate-pulse"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full" style={{ background: 'var(--bg-surface-sunken)' }} />
            <div className="flex-1 space-y-2">
              <div className="h-4 rounded w-1/3" style={{ background: 'var(--bg-surface-sunken)' }} />
              <div className="h-3 rounded w-1/5" style={{ background: 'var(--bg-surface-sunken)' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Single checklist item card                                         */
/* ------------------------------------------------------------------ */
interface ChecklistItemCardProps {
  item: ChecklistItem;
  readOnly: boolean;
  onComplete: (itemId: string, notes?: string) => void;
  onSkip: (itemId: string, notes?: string) => void;
  isActioning: boolean;
}

function ChecklistItemCard({ item, readOnly, onComplete, onSkip, isActioning }: ChecklistItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');

  const isCompleted = item.status === 'completed';
  const isSkipped = item.status === 'skipped';
  const isInProgress = item.status === 'in_progress';
  const isPending = item.status === 'pending';
  const canAct = !readOnly && (isPending || isInProgress);

  const leftBorderColor = isCompleted
    ? 'var(--status-success)'
    : isInProgress
      ? 'var(--interactive-primary)'
      : 'transparent';

  return (
    <div
      className="rounded-lg"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderLeftWidth: isCompleted || isInProgress ? '3px' : '1px',
        borderLeftColor: leftBorderColor,
        opacity: isSkipped ? 0.6 : 1,
      }}
    >
      {/* Main row */}
      <button
        type="button"
        className="w-full flex items-center gap-3 p-4 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        {/* Status icon */}
        {isCompleted ? (
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-success)' }} />
        ) : isSkipped ? (
          <SkipForward className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        ) : (
          <Circle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        )}

        {/* Code + name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-mono font-semibold"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {item.code}
            </span>
            <span
              className="text-sm font-medium truncate"
              style={{
                color: 'var(--text-primary)',
                textDecoration: isSkipped ? 'line-through' : 'none',
              }}
            >
              {item.name}
            </span>
          </div>
        </div>

        {/* Required badge */}
        {item.required && (
          <StatusBadge status="pending" label="Required" size="sm" showIcon={false} className="flex-shrink-0" />
        )}

        {/* Status label */}
        <span
          className="text-xs font-medium capitalize flex-shrink-0"
          style={{
            color: isCompleted
              ? 'var(--status-success)'
              : isSkipped
                ? 'var(--text-tertiary)'
                : isInProgress
                  ? 'var(--interactive-primary)'
                  : 'var(--text-secondary)',
          }}
        >
          {item.status.replace('_', ' ')}
        </span>

        {/* Expand chevron */}
        {expanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div
          className="px-4 pb-4 pt-0 space-y-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          {/* Metadata */}
          {(item.completedBy || item.completedAt || item.notes) && (
            <div className="space-y-1 pt-3">
              {item.completedBy && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-medium">Completed by:</span> {item.completedBy}
                </p>
              )}
              {item.completedAt && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-medium">Completed at:</span>{' '}
                  {new Date(item.completedAt).toLocaleString()}
                </p>
              )}
              {item.notes && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-medium">Notes:</span> {item.notes}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          {canAct && (
            <div className="space-y-2 pt-2">
              <input
                type="text"
                placeholder="Add notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-sm rounded-md px-3 py-2 outline-none"
                style={{
                  background: 'var(--bg-surface-sunken)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isActioning}
                  onClick={() => onComplete(item.id, notes || undefined)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-opacity disabled:opacity-50"
                  style={{
                    background: 'var(--status-success-bg)',
                    color: 'var(--status-success)',
                  }}
                >
                  {isActioning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  Complete
                </button>
                {!item.required && (
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => onSkip(item.id, notes || undefined)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-opacity disabled:opacity-50"
                    style={{
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-secondary)',
                      background: 'transparent',
                    }}
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    Skip
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function ChecklistPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const { data: session } = useCloseSession(sessionId);
  const { data: items, isLoading } = useSessionChecklist(sessionId);
  const initMutation = useInitializeChecklist();
  const completeMutation = useCompleteChecklistItem();
  const skipMutation = useSkipChecklistItem();

  const [actioningId, setActioningId] = useState<string | null>(null);

  const completedCount = items?.filter((i) => i.status === 'completed').length ?? 0;
  const totalCount = items?.length ?? 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleInitialize = useCallback(() => {
    initMutation.mutate(sessionId);
  }, [initMutation, sessionId]);

  const handleComplete = useCallback(
    (itemId: string, notes?: string) => {
      setActioningId(itemId);
      completeMutation.mutate(
        { itemId, completedBy: user?.email ?? user?.userId ?? 'unknown', notes },
        { onSettled: () => setActioningId(null) }
      );
    },
    [completeMutation, user]
  );

  const handleSkip = useCallback(
    (itemId: string, notes?: string) => {
      setActioningId(itemId);
      skipMutation.mutate(
        { itemId, completedBy: user?.email ?? user?.userId ?? 'unknown', notes },
        { onSettled: () => setActioningId(null) }
      );
    },
    [skipMutation, user]
  );

  /* ---- Loading ---- */
  if (isLoading) {
    return (
      <div className="max-w-[1000px] space-y-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Close Checklist
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
        <ChecklistSkeleton />
      </div>
    );
  }

  /* ---- Empty / not initialized ---- */
  if (!items || items.length === 0) {
    return (
      <div className="max-w-[1000px] space-y-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Close Checklist
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {session?.periodLabel ?? 'Period'}
          </p>
        </div>
        <EmptyState
          icon={ClipboardList}
          title="No checklist items"
          description="Initialize the close checklist to create standard tasks for this session."
          actionLabel={readOnly ? undefined : 'Initialize Checklist'}
          onAction={readOnly ? undefined : handleInitialize}
        />
      </div>
    );
  }

  /* ---- Main content ---- */
  return (
    <div className="max-w-[1000px] space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Close Checklist
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {session?.periodLabel ?? 'Period'} &mdash; {completedCount} of {totalCount} complete
          </p>
        </div>
        {!readOnly && items.length === 0 && (
          <button
            type="button"
            onClick={handleInitialize}
            disabled={initMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white rounded-md transition-opacity disabled:opacity-50"
            style={{ background: 'var(--interactive-primary)' }}
          >
            {initMutation.isPending ? 'Initializing...' : 'Initialize Checklist'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Progress
          </span>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {progressPct}%
          </span>
        </div>
        <div
          className="w-full rounded-full overflow-hidden"
          style={{ height: 6, background: 'var(--bg-surface-sunken)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              background: progressPct === 100 ? 'var(--status-success)' : 'var(--interactive-primary)',
            }}
          />
        </div>
      </div>

      {/* Checklist items */}
      <div className="space-y-2">
        {items.map((item) => (
          <ChecklistItemCard
            key={item.id}
            item={item}
            readOnly={readOnly}
            onComplete={handleComplete}
            onSkip={handleSkip}
            isActioning={actioningId === item.id}
          />
        ))}
      </div>
    </div>
  );
}
