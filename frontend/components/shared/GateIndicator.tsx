'use client';

import { cn } from '@/lib/utils';
import { Check, X, Circle } from 'lucide-react';
import Link from 'next/link';

export interface GateIndicatorProps {
  gateNumber: number;
  gateName: string;
  status: 'passed' | 'failed' | 'not-evaluated';
  detail?: string;
  failureReason?: string;
  failureLink?: string;
  progress?: { current: number; total: number };
  className?: string;
}

export function GateIndicator({
  gateNumber,
  gateName,
  status,
  detail,
  failureReason,
  failureLink,
  progress,
  className,
}: GateIndicatorProps) {
  return (
    <div className={cn('flex items-start gap-3 py-2', className)}>
      {/* Icon */}
      {status === 'passed' && (
        <div
          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--status-success-bg)' }}
        >
          <Check className="w-3.5 h-3.5" style={{ color: 'var(--status-success)' }} />
        </div>
      )}
      {status === 'failed' && (
        <div
          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--status-error-bg)' }}
        >
          <X className="w-3.5 h-3.5" style={{ color: 'var(--status-error)' }} />
        </div>
      )}
      {status === 'not-evaluated' && (
        <Circle
          className="flex-shrink-0 w-5 h-5"
          style={{ color: 'var(--text-tertiary)' }}
          strokeDasharray="4 2"
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold uppercase tracking-[0.04em]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Gate {gateNumber}
          </span>
          <span
            className="text-sm font-medium"
            style={{
              color: status === 'failed'
                ? 'var(--status-error)'
                : status === 'not-evaluated'
                  ? 'var(--text-tertiary)'
                  : 'var(--text-primary)',
            }}
          >
            {gateName}
          </span>
        </div>

        {detail && status === 'passed' && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{detail}</p>
        )}

        {status === 'failed' && failureReason && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--status-error)' }}>{failureReason}</p>
        )}

        {status === 'failed' && failureLink && (
          <Link
            href={failureLink}
            className="inline-flex items-center gap-1 text-xs font-medium mt-1"
            style={{ color: 'var(--text-link)' }}
          >
            Fix &rarr;
          </Link>
        )}

        {status === 'not-evaluated' && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Not yet evaluated</p>
        )}

        {progress && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {progress.current} of {progress.total} complete
          </p>
        )}
      </div>
    </div>
  );
}
