'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GateIndicator } from '@/components/shared/GateIndicator';
import type { ReadinessGate } from '@/lib/types/readiness';

export interface CertificationChecklistProps {
  gates: ReadinessGate[];
  sessionId: string;
}

export function CertificationChecklist({ gates, sessionId }: CertificationChecklistProps) {
  const passingCount = gates.filter((g) => g.passing).length;
  const totalCount = gates.length;
  const failingCount = totalCount - passingCount;
  const allPassing = passingCount === totalCount;
  const progressPct = totalCount > 0 ? (passingCount / totalCount) * 100 : 0;

  // FIX 3C: Sort gates so blocking (failing) gates appear first
  const sortedGates = [...gates].sort((a, b) => {
    if (!a.passing && b.passing) return -1;
    if (a.passing && !b.passing) return 1;
    return 0;
  });

  return (
    <div className="bg-surface border border-border rounded-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display text-primary">Certification Requirements</h2>
        <span className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
          allPassing ? 'bg-status-green-dim text-status-green' : 'bg-status-amber-dim text-status-amber'
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full', allPassing ? 'bg-status-green' : 'bg-status-amber')} />
          {passingCount} / {totalCount}
        </span>
      </div>

      {/* FIX 3C: Show blocking count */}
      {failingCount > 0 && (
        <div className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {failingCount} of {totalCount} gate{failingCount !== 1 ? 's' : ''} blocking certification
        </div>
      )}

      <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', allPassing ? 'bg-status-green' : 'bg-accent')}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="space-y-2">
        {sortedGates.map((gate, idx) => {
          const href = (gate.navigateTo ?? '').replace('[sessionId]', sessionId);
          const isPending = gate.id === 'ties' && !gate.passing;
          const gateStatus = gate.passing
            ? 'passed' as const
            : isPending
              ? 'not-evaluated' as const
              : 'failed' as const;

          // Find original index for gate numbering
          const originalIdx = gates.findIndex((g) => g.id === gate.id);

          return (
            <Link
              key={gate.id}
              href={href}
              className="flex items-center gap-4 p-3 rounded-r-lg transition-colors group"
              style={{
                borderLeft: `3px solid ${gate.passing ? 'var(--status-success)' : 'var(--status-error)'}`,
                background: gate.passing ? 'transparent' : 'var(--status-error-bg)',
              }}
            >
              <div className="flex-1 min-w-0">
                <GateIndicator
                  gateNumber={originalIdx + 1}
                  gateName={gate.name}
                  status={gateStatus}
                  detail={gate.passing ? gate.detail : isPending ? 'Will be validated when certifying' : undefined}
                  failureReason={!gate.passing && !isPending ? gate.detail : undefined}
                />
                {!gate.passing && !isPending && (
                  <span className="text-xs font-medium" style={{ color: 'var(--status-error)' }}>Blocks certification</span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-primary shrink-0 transition-colors" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
