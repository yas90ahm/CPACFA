'use client';

import * as React from 'react';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const ONBOARDING_SELECTORS = {
  uploadZone: '[data-onboarding="upload-zone"]',
  agentReasoning: '[data-onboarding="agent-reasoning"]',
  exportButton: '[data-onboarding="export-button"]',
} as const;

const STEPS: { key: keyof typeof ONBOARDING_SELECTORS; label: string }[] = [
  { key: 'uploadZone', label: 'Upload zone' },
  { key: 'agentReasoning', label: 'Agent Reasoning sidebar' },
  { key: 'exportButton', label: 'Export button' },
];

export interface SpotlightTourProps {
  open: boolean;
  onClose: () => void;
  currentStep: number;
  onStepChange: (step: number) => void;
  className?: string;
}

/**
 * Spotlight overlay that highlights one target at a time (Upload → Agent Reasoning → Export).
 */
export function SpotlightTour({
  open,
  onClose,
  currentStep,
  onStepChange,
  className,
}: SpotlightTourProps) {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const stepKey = STEPS[currentStep]?.key;

  React.useEffect(() => {
    if (!open || stepKey === undefined) {
      setRect(null);
      return;
    }
    const selector = ONBOARDING_SELECTORS[stepKey];
    const el = document.querySelector(selector);
    if (!el) {
      setRect(null);
      return;
    }
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('scroll', update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
    };
  }, [open, stepKey]);

  if (!open) return null;

  const step = STEPS[currentStep];
  const isFirst = currentStep <= 0;
  const isLast = currentStep >= STEPS.length - 1;

  return (
    <div
      className={cn('fixed inset-0 z-[100] pointer-events-auto', className)}
      role="dialog"
      aria-modal="true"
      aria-label="Guided tour"
    >
      {/* Backdrop with spotlight cutout */}
      <div className="absolute inset-0">
        {/* Full dim */}
        <div className="absolute inset-0 bg-black/55" aria-hidden />
        {/* Cutout: transparent hole with box-shadow to create spotlight */}
        {rect && (
          <div
            className="absolute rounded-lg pointer-events-none"
            style={{
              left: rect.left - 8,
              top: rect.top - 8,
              width: rect.width + 16,
              height: rect.height + 16,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            }}
            aria-hidden
          />
        )}
      </div>

      {/* Tooltip card below or beside spotlight */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-8 w-full max-w-sm px-4">
        <div className="rounded-lg border bg-card p-4 shadow-lg">
          <p className="text-sm font-medium text-card-foreground mb-1">
            {step?.label ?? 'Tour'}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {stepKey === 'uploadZone' &&
              'Drop CSV, Excel, or PDF here to get a 60-second health check.'}
            {stepKey === 'agentReasoning' &&
              'Ask the agent for justifications and see the reasoning behind every number.'}
            {stepKey === 'exportButton' &&
              'Download your audit-ready report as PDF or CSV when you\'re done.'}
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStepChange(currentStep - 1)}
                disabled={isFirst}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStepChange(currentStep + 1)}
                disabled={isLast}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Skip tour
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Step {currentStep + 1} of {STEPS.length}
          </p>
        </div>
      </div>

      {/* Skip X in corner */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/30 text-white hover:bg-black/50"
        aria-label="Close tour"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
