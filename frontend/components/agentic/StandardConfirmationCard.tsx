'use client';

import * as React from 'react';
import type { StandardInference, AccountingStandard } from '@/lib/agentic-types';

const STANDARDS: AccountingStandard[] = ['ASPE', 'IFRS', 'FRS102', 'US_GAAP'];

const LOW_CONFIDENCE_THRESHOLD = 0.8;

export function StandardConfirmationCard({
  standardInference,
  currentStandard,
  entityId,
  onConfirm,
  onDismiss,
  className,
}: {
  standardInference: StandardInference | null | undefined;
  currentStandard?: AccountingStandard | null;
  entityId: string;
  onConfirm: (payload: { entityId: string; standard: AccountingStandard }) => void;
  onDismiss?: () => void;
  className?: string;
}) {
  const [selectedStandard, setSelectedStandard] = React.useState<AccountingStandard | ''>(
    (standardInference?.standard ?? currentStandard ?? '') as AccountingStandard | ''
  );
  const [loading, setLoading] = React.useState(false);

  const needsConfirmation =
    standardInference &&
    standardInference.confidence < LOW_CONFIDENCE_THRESHOLD &&
    (standardInference.standard ?? currentStandard);

  if (!needsConfirmation) return null;

  const inferred = standardInference.standard ?? currentStandard;
  const confidencePct = Math.round((standardInference.confidence ?? 0) * 100);

  const handleConfirm = async () => {
    const standard = (selectedStandard || inferred) as AccountingStandard;
    if (!standard) return;
    setLoading(true);
    try {
      await onConfirm({ entityId, standard });
      onDismiss?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3 ${className ?? ''}`}
      role="region"
      aria-label="Confirm accounting standard"
    >
      <p className="font-semibold text-foreground">Confirm accounting standard</p>
      <p className="text-sm text-muted-foreground">
        We inferred <strong>{inferred}</strong> (confidence {confidencePct}%). Confirm or correct below.
      </p>
      {standardInference.reasoning && (
        <p className="text-xs text-muted-foreground">{standardInference.reasoning}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-foreground">Standard:</label>
        <select
          value={selectedStandard}
          onChange={(e) => setSelectedStandard(e.target.value as AccountingStandard | '')}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Select...</option>
          {STANDARDS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading || !(selectedStandard || inferred)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Confirm'}
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
