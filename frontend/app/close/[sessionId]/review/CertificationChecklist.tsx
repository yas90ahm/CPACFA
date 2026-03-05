'use client';

import Link from 'next/link';
import { Check, X, Circle } from 'lucide-react';
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display text-primary">Certification Requirements</h2>
        <div className="text-sm text-text-secondary">
          {passingCount} of {totalCount} requirements met
        </div>
      </div>
      <div className="w-full bg-surface-alt rounded-input h-2 overflow-hidden">
        <div
          className={cn('h-full transition-all', allPassing ? 'bg-status-green' : 'bg-status-amber')}
          style={{ width: `${totalCount > 0 ? (passingCount / totalCount) * 100 : 0}%` }}
        />
      </div>
      {allPassing ? (
        <div className="p-4 rounded-card border border-status-green bg-status-green-dim text-status-green font-medium">
          All requirements met — ready for certification ✓
        </div>
      ) : (
        <div className="p-4 rounded-card border border-status-amber bg-status-amber-dim text-status-amber font-medium">
          {totalCount - passingCount} requirements not yet met
        </div>
      )}
      <div className="space-y-2">
        {gates.map((gate) => {
          const href = (gate.navigateTo ?? '').replace('[sessionId]', sessionId);
          const Icon = gate.passing ? Check : gate.id === 'ties' ? Circle : X;
          const iconColor = gate.passing ? 'text-status-green' : gate.id === 'ties' ? 'text-text-muted' : 'text-status-red';
          const borderColor = gate.passing ? 'border-status-green' : gate.id === 'ties' ? 'border-border-light' : 'border-status-red';
          const bgColor = gate.passing ? 'bg-status-green-dim' : gate.id === 'ties' ? 'bg-surface-alt' : 'bg-status-red-dim';

          return (
            <div
              key={gate.id}
              className={cn('p-4 rounded-card border-l-4', borderColor, bgColor)}
              style={{ borderLeftWidth: '4px' }}
            >
              <div className="flex items-start gap-3">
                <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', iconColor)} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-primary">{gate.name}</div>
                  <div className={cn('text-sm mt-1', gate.passing ? 'text-text-secondary' : 'text-primary')}>
                    {gate.description}
                  </div>
                  <div className="text-sm text-text-secondary mt-1">{gate.detail}</div>
                  {!gate.passing && gate.id !== 'ties' && (
                    <div className="text-sm text-status-red font-medium mt-1">Blocking: {gate.detail}</div>
                  )}
                  {gate.id === 'ties' && (
                    <div className="text-sm text-text-tertiary mt-1">Will be validated when certifying</div>
                  )}
                </div>
                <Link
                  href={href}
                  className="text-sm text-accent hover:underline shrink-0"
                >
                  View {gate.name.includes('Trial Balance') ? 'TB' : gate.name.includes('Mapping') ? 'Mapping' : gate.name.includes('Reconciliation') ? 'Reconciliation' : gate.name.includes('AJE') ? 'Adjustments' : gate.name.includes('Statements') ? 'Statements' : gate.name.includes('Variance') ? 'Variance' : gate.name.includes('Issues') ? 'Issues' : 'Details'} →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
