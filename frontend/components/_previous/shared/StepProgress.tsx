'use client';

import { Check, Loader2, Circle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepStatus = 'complete' | 'active' | 'pending' | 'error';

export interface StepProgressProps {
  steps: { label: string; status: StepStatus }[];
}

export function StepProgress({ steps }: StepProgressProps) {
  return (
    <ul className="space-y-2">
      {steps.map((step, i) => (
        <li key={i} className="flex items-center gap-3">
          {step.status === 'complete' && <Check className="w-5 h-5 text-status-green shrink-0" />}
          {step.status === 'active' && <Loader2 className="w-5 h-5 text-accent shrink-0 animate-spin" />}
          {step.status === 'pending' && <Circle className="w-5 h-5 text-text-muted shrink-0" />}
          {step.status === 'error' && <X className="w-5 h-5 text-status-red shrink-0" />}
          <span
            className={cn(
              'text-sm',
              step.status === 'complete' && 'text-status-green',
              step.status === 'active' && 'text-accent font-medium',
              step.status === 'pending' && 'text-text-muted',
              step.status === 'error' && 'text-status-red'
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
