'use client';

import * as React from 'react';
import type { HITLStatus } from '@/lib/agentic-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function HITLBanner({
  hitl,
  onDismiss,
  className,
}: {
  hitl: HITLStatus;
  onDismiss?: () => void;
  className?: string;
}) {
  const [stagingSummary, setStagingSummary] = React.useState<{ proposedAction?: string; justification?: string } | null>(null);

  React.useEffect(() => {
    if (!hitl.escalated || !hitl.stagingId) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/hitl/staging/${hitl.stagingId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setStagingSummary({ proposedAction: data.proposedAction, justification: data.justification });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hitl.escalated, hitl.stagingId]);

  if (!hitl.escalated) return null;

  return (
    <div
      className={`rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${className ?? ''}`}
      role="alert"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">Human review required</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          The agentic assessor flagged one or more items for your approval before proceeding.
        </p>
        {stagingSummary?.proposedAction && (
          <p className="text-sm mt-1">
            <span className="font-medium">Proposed action:</span> {stagingSummary.proposedAction}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a
          href={`${API_BASE}/api/hitl/staging`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open staging area
        </a>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
