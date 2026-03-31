'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

export interface ApprovalActionProps {
  entityType: 'journal-entry' | 'reconciliation' | 'variance' | 'mapping';
  entitySummary: string;
  dollarImpact?: string;
  onApprove: () => void;
  onReject: (reason: string) => void;
  disabled?: boolean;
  requireComment?: boolean;
  className?: string;
}

export function ApprovalAction({
  entityType,
  entitySummary,
  dollarImpact,
  onApprove,
  onReject,
  disabled = false,
  requireComment = false,
  className,
}: ApprovalActionProps) {
  const [mode, setMode] = useState<'idle' | 'rejecting' | 'approved'>('idle');
  const [reason, setReason] = useState('');

  const handleApprove = useCallback(() => {
    onApprove();
    setMode('approved');
    // Reset after brief toast
    setTimeout(() => setMode('idle'), 2000);
  }, [onApprove]);

  const handleReject = useCallback(() => {
    if (requireComment && !reason.trim()) return;
    onReject(reason);
    setMode('idle');
    setReason('');
  }, [onReject, reason, requireComment]);

  if (mode === 'approved') {
    return (
      <div className={cn('flex items-center gap-2 py-2', className)}>
        <Check className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--status-success)' }}>Approved</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {dollarImpact && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Impact: <span className="font-mono tabular-nums">{dollarImpact}</span>
        </p>
      )}

      {mode === 'idle' && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--status-success)' }}
          >
            <Check className="w-3.5 h-3.5" />
            Approve
          </button>
          <button
            type="button"
            onClick={() => setMode('rejecting')}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              color: 'var(--status-error)',
              border: '1px solid var(--border-default)',
            }}
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
        </div>
      )}

      {mode === 'rejecting' && (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={requireComment ? 'Reason for rejection (required)' : 'Reason for rejection (optional)'}
            rows={2}
            className="w-full text-sm rounded-md"
            style={{
              backgroundColor: 'var(--bg-surface-sunken)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReject}
              disabled={requireComment && !reason.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--interactive-destructive)' }}
            >
              Confirm Rejection
            </button>
            <button
              type="button"
              onClick={() => { setMode('idle'); setReason(''); }}
              className="px-3 py-1.5 text-sm font-medium rounded-md"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
