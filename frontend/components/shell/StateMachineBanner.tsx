'use client';

import { cn } from '@/lib/utils';
import type { CloseState } from '@/lib/types/close-session';
import { Check } from 'lucide-react';

const states: CloseState[] = ['OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'CERTIFIED', 'LOCKED'];

export interface StateMachineBannerProps {
  currentState: CloseState;
  gatesRemaining?: number;
  canAdvance?: boolean;
  isReviewer?: boolean;
  /** When true (e.g. operating partner), hide advance/approve/lock buttons. */
  isReadOnly?: boolean;
}

export function StateMachineBanner({
  currentState,
  gatesRemaining = 3,
  canAdvance = false,
  isReviewer = false,
  isReadOnly = false,
}: StateMachineBannerProps) {
  const idx = states.indexOf(currentState);

  return (
    <div className="fixed top-14 left-0 right-0 z-30 h-10 flex items-center justify-between px-6 bg-surface border-b border-border-light print:hidden">
      <div className="flex items-center gap-1">
        {states.map((s, i) => {
          const isPast = i < idx;
          const isCurrent = i === idx;
          return (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
                  isPast && 'text-status-green',
                  isCurrent && 'text-accent font-medium bg-accent-dim',
                  i > idx && 'text-text-muted'
                )}
              >
                {isPast ? <Check className="w-3.5 h-3.5" /> : <span className={cn('w-2 h-2 rounded-full', isCurrent ? 'bg-accent' : 'bg-text-muted')} />}
                {s.replace('_', ' ')}
              </div>
              {i < states.length - 1 && <div className="w-4 h-px bg-border mx-0.5" />}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        {!isReadOnly && currentState === 'IN_PROGRESS' && (
          <button
            type="button"
            disabled={!canAdvance}
            title={!canAdvance ? String(gatesRemaining) + ' gates remaining' : undefined}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded border',
              canAdvance ? 'bg-accent text-white border-accent' : 'bg-elevated text-text-muted border-border cursor-not-allowed'
            )}
          >
            Submit for Review
          </button>
        )}
        {!isReadOnly && currentState === 'UNDER_REVIEW' && isReviewer && (
          <>
            <button type="button" className="px-3 py-1.5 text-xs font-medium rounded border border-status-green bg-status-green-dim text-status-green">Approve & Certify</button>
            <button type="button" className="px-3 py-1.5 text-xs font-medium rounded border border-status-red bg-status-red-dim text-status-red">Reject</button>
          </>
        )}
        {!isReadOnly && currentState === 'CERTIFIED' && (
          <button type="button" className="px-3 py-1.5 text-xs font-medium rounded border border-accent bg-accent-dim text-accent">Lock Period</button>
        )}
      </div>
    </div>
  );
}
