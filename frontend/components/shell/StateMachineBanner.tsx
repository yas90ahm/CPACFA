'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAdvanceSession, useCertifySession, useLockSession } from '@/lib/queries/close-session';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { CloseState } from '@/lib/types/close-session';
import { Check } from 'lucide-react';

const states: CloseState[] = ['OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'CERTIFIED', 'LOCKED'];

export interface StateMachineBannerProps {
  currentState: CloseState;
  sessionId: string;
  gatesRemaining?: number;
  canAdvance?: boolean;
  isReviewer?: boolean;
  /** When true (e.g. operating partner), hide advance/approve/lock buttons. */
  isReadOnly?: boolean;
}

export function StateMachineBanner({
  currentState,
  sessionId,
  gatesRemaining = 0,
  canAdvance = false,
  isReviewer = false,
  isReadOnly = false,
}: StateMachineBannerProps) {
  const idx = states.indexOf(currentState);
  const advanceMutation = useAdvanceSession(sessionId);
  const certifyMutation = useCertifySession(sessionId);
  const lockMutation = useLockSession(sessionId);

  const [showCertifyConfirm, setShowCertifyConfirm] = useState(false);
  const [certifyInput, setCertifyInput] = useState('');
  const [showLockConfirm, setShowLockConfirm] = useState(false);

  const handleSubmitForReview = () => {
    advanceMutation.mutate({ target_state: 'UNDER_REVIEW' });
  };

  const handleCertify = () => {
    if (certifyInput !== 'CERTIFY') return;
    certifyMutation.mutate({ confirmation: 'CERTIFY' }, {
      onSuccess: () => { setShowCertifyConfirm(false); setCertifyInput(''); },
    });
  };

  const handleLock = () => {
    lockMutation.mutate(undefined, {
      onSuccess: () => setShowLockConfirm(false),
    });
  };

  return (
    <>
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
              disabled={!canAdvance || advanceMutation.isPending}
              title={!canAdvance ? String(gatesRemaining) + ' gates remaining' : undefined}
              onClick={handleSubmitForReview}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded border',
                canAdvance ? 'bg-accent text-white border-accent' : 'bg-elevated text-text-muted border-border cursor-not-allowed'
              )}
            >
              {advanceMutation.isPending ? 'Submitting...' : 'Submit for Review'}
            </button>
          )}
          {!isReadOnly && currentState === 'UNDER_REVIEW' && isReviewer && (
            <>
              <button
                type="button"
                onClick={() => setShowCertifyConfirm(true)}
                disabled={certifyMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded border border-status-green bg-status-green-dim text-status-green"
              >
                {certifyMutation.isPending ? 'Certifying...' : 'Approve & Certify'}
              </button>
              <button
                type="button"
                onClick={() => advanceMutation.mutate({ target_state: 'IN_PROGRESS', reason: 'Rejected from banner' })}
                disabled={advanceMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded border border-status-red bg-status-red-dim text-status-red"
              >
                Reject
              </button>
            </>
          )}
          {!isReadOnly && currentState === 'CERTIFIED' && (
            <button
              type="button"
              onClick={() => setShowLockConfirm(true)}
              disabled={lockMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded border border-accent bg-accent-dim text-accent"
            >
              {lockMutation.isPending ? 'Locking...' : 'Lock Period'}
            </button>
          )}
        </div>
      </div>

      {/* Certify Confirmation Dialog */}
      {showCertifyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setShowCertifyConfirm(false); setCertifyInput(''); }} />
          <div className="relative bg-surface border border-border rounded-card shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg text-primary mb-2">Certify Period</h3>
            <p className="text-text-secondary text-sm mb-4">
              Type <strong className="font-mono">CERTIFY</strong> to confirm.
            </p>
            <input
              type="text"
              value={certifyInput}
              onChange={(e) => setCertifyInput(e.target.value)}
              placeholder="Type CERTIFY"
              className="w-full px-3 py-2 rounded-input border border-border bg-surface text-primary mb-4 font-mono"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowCertifyConfirm(false); setCertifyInput(''); }} className="px-4 py-2 rounded-input border border-border text-sm">Cancel</button>
              <button
                type="button"
                onClick={handleCertify}
                disabled={certifyInput !== 'CERTIFY' || certifyMutation.isPending}
                className={cn('px-4 py-2 rounded-input text-sm font-medium', certifyInput === 'CERTIFY' ? 'bg-status-green text-white' : 'bg-surface-alt text-text-muted cursor-not-allowed')}
              >
                {certifyMutation.isPending ? 'Certifying...' : 'Certify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lock Confirmation Dialog */}
      <ConfirmDialog
        open={showLockConfirm}
        onClose={() => setShowLockConfirm(false)}
        onConfirm={handleLock}
        title="Lock Period"
        message="Lock is permanent and irreversible."
        detail="This period cannot be modified after locking."
        confirmLabel={lockMutation.isPending ? 'Locking...' : 'Lock Period'}
        destructive
      />
    </>
  );
}
