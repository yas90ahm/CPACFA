'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

export interface PipelineStep {
  id: string;
  label: string;
  status: 'complete' | 'active' | 'pending' | 'error';
}

const STEP_ROUTES: Record<string, string> = {
  ingest: 'dashboard',
  map: 'mapping',
  reconcile: 'reconciliation',
  adjust: 'adjustments',
  generate: 'statements',
  analyze: 'variance',
  review: 'review',
  certify: 'review',
  // Also support id-based keys from portfolio entity pages
  open: 'dashboard',
  'in-progress': 'dashboard',
  'under-review': 'review',
  certified: 'review',
  locked: 'review',
};

export interface PipelineStepperProps {
  steps: PipelineStep[];
  compact?: boolean;
  interactive?: boolean;
  onStepClick?: (stepId: string) => void;
  sessionId?: string;
  className?: string;
}

export function PipelineStepper({
  steps,
  compact = false,
  interactive = false,
  onStepClick,
  sessionId,
  className,
}: PipelineStepperProps) {
  const circleSize = compact ? 16 : 24;

  return (
    <div className={cn('flex items-center', className)}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;

        const isClickable = step.status === 'complete' || step.status === 'active';
        const route = STEP_ROUTES[step.id];
        const href = sessionId && route ? `/close/${sessionId}/${route}` : null;
        const shouldLink = isClickable && href;

        const circleContent = (
          <div
            className={cn(
              'relative flex items-center justify-center rounded-full flex-shrink-0',
              isClickable && 'cursor-pointer',
              !isClickable && step.status === 'pending' && 'cursor-default',
            )}
            style={{
              width: circleSize,
              height: circleSize,
            }}
            onClick={interactive && !shouldLink ? () => onStepClick?.(step.id) : undefined}
            title={compact ? step.label : undefined}
          >
            {step.status === 'complete' && (
              <div
                className="w-full h-full rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--status-success)' }}
              >
                <Check className="text-white" style={{ width: circleSize * 0.6, height: circleSize * 0.6 }} />
              </div>
            )}
            {step.status === 'active' && (
              <>
                <div
                  className="w-full h-full rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--interactive-primary)' }}
                >
                  <div className="w-2 h-2 bg-white rounded-full" />
                </div>
                <div
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{
                    backgroundColor: 'var(--interactive-primary)',
                    opacity: 0.3,
                  }}
                />
              </>
            )}
            {step.status === 'pending' && (
              <div
                className="w-full h-full rounded-full"
                style={{
                  border: '2px dashed var(--text-tertiary)',
                }}
              />
            )}
            {step.status === 'error' && (
              <div
                className="w-full h-full rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--status-error)' }}
              >
                <X className="text-white" style={{ width: circleSize * 0.6, height: circleSize * 0.6 }} />
              </div>
            )}
          </div>
        );

        const labelContent = !compact ? (
          <span
            className={cn(
              'ml-2 text-xs font-semibold whitespace-nowrap',
              isClickable && 'hover:underline',
            )}
            style={{
              color: step.status === 'complete'
                ? 'var(--status-success)'
                : step.status === 'active'
                  ? 'var(--interactive-primary)'
                  : step.status === 'error'
                    ? 'var(--status-error)'
                    : 'var(--text-tertiary)',
            }}
          >
            {step.label}
          </span>
        ) : null;

        const stepElement = shouldLink ? (
          <Link href={href} className="flex items-center no-underline">
            {circleContent}
            {labelContent}
          </Link>
        ) : (
          <div className="flex items-center">
            {circleContent}
            {labelContent}
          </div>
        );

        return (
          <div key={step.id} className="flex items-center">
            {stepElement}

            {/* Connecting line */}
            {!isLast && (
              <div
                className="mx-2"
                style={{
                  width: compact ? 16 : 32,
                  height: 2,
                  backgroundColor: step.status === 'complete'
                    ? 'var(--status-success)'
                    : step.status === 'error'
                      ? 'var(--status-error)'
                      : 'var(--border-default)',
                  ...(step.status === 'pending' || (step.status !== 'complete' && step.status !== 'error')
                    ? { backgroundImage: 'repeating-linear-gradient(90deg, var(--border-default) 0, var(--border-default) 4px, transparent 4px, transparent 8px)', backgroundColor: 'transparent' }
                    : {}),
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
