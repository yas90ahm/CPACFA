'use client';

import Link from 'next/link';
import { Check, X, Circle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReadinessGate } from '@/lib/types/readiness';

export interface CertificationChecklistProps {
  gates: ReadinessGate[];
  sessionId: string;
}

export function CertificationChecklist({ gates, sessionId }: CertificationChecklistProps) {
  const passingCount = gates.filter((g) => g.passing).length;
  const totalCount = gates.length;
  const allPassing = passingCount === totalCount;
  const progressPct = totalCount > 0 ? (passingCount / totalCount) * 100 : 0;

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

      <div className="w-full bg-elevated rounded-full h-2 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', allPassing ? 'bg-status-green' : 'bg-accent')}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="space-y-2">
        {gates.map((gate) => {
          const href = (gate.navigateTo ?? '').replace('[sessionId]', sessionId);
          const isPending = gate.id === 'ties' && !gate.passing;

          return (
            <Link
              key={gate.id}
              href={href}
              className={cn(
                'flex items-center gap-4 px-5 py-4 rounded-card border transition-colors group',
                gate.passing
                  ? 'border-border-light bg-surface hover:bg-hover'
                  : isPending
                    ? 'border-border-light bg-surface hover:bg-hover'
                    : 'border-status-red/20 bg-status-red-dim/30 hover:bg-status-red-dim/50'
              )}
            >
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                gate.passing
                  ? 'bg-status-green-dim'
                  : isPending
                    ? 'bg-elevated'
                    : 'bg-status-red-dim'
              )}>
                {gate.passing ? (
                  <Check className="w-4 h-4 text-status-green" />
                ) : isPending ? (
                  <Circle className="w-4 h-4 text-text-muted" />
                ) : (
                  <X className="w-4 h-4 text-status-red" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-primary text-sm">{gate.name}</div>
                <div className="text-xs text-text-secondary mt-0.5">
                  {gate.passing ? gate.detail : isPending ? 'Will be validated when certifying' : gate.detail}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-primary shrink-0 transition-colors" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
