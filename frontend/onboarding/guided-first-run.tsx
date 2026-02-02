'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HookMessage } from './hook-message';
import { SpotlightTour } from './spotlight-tour';
import { useFirstRun } from './first-run-context';
import { SAMPLE_STATEMENT_ROWS } from './sample-data';
import type { StatementRow } from '@/components/agent-workspace';

export interface GuidedFirstRunProps {
  /** Call when user loads sample data; pass the sample rows to parent. */
  onLoadSampleData?: (rows: StatementRow[]) => void;
  /** Optional: mark analysis complete after loading sample (e.g. for export notification). */
  onSampleDataLoaded?: () => void;
  className?: string;
}

/**
 * Guided First-Run: hook message, spotlight tour, and Load Sample Data.
 * Renders when isFirstRun is true; parent must add data-onboarding attributes to targets.
 */
export function GuidedFirstRun({
  onLoadSampleData,
  onSampleDataLoaded,
  className,
}: GuidedFirstRunProps) {
  const { isFirstRun, completeFirstRun } = useFirstRun();
  const [tourOpen, setTourOpen] = React.useState(false);
  const [tourStep, setTourStep] = React.useState(0);

  const handleLoadSampleData = React.useCallback(() => {
    onLoadSampleData?.(SAMPLE_STATEMENT_ROWS);
    onSampleDataLoaded?.();
    completeFirstRun();
  }, [onLoadSampleData, onSampleDataLoaded, completeFirstRun]);

  const handleDismissHook = React.useCallback(() => {
    completeFirstRun();
  }, [completeFirstRun]);

  const handleCloseTour = React.useCallback(() => {
    setTourOpen(false);
    completeFirstRun();
  }, [completeFirstRun]);

  if (!isFirstRun) return null;

  return (
    <div className={className}>
      {/* The Hook: bot message on first login */}
      <HookMessage onDismiss={handleDismissHook} />

      {/* Actions: Start tour + Load Sample Data */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTourOpen(true)}
        >
          Show me around
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleLoadSampleData}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Load Sample Data
        </Button>
      </div>

      {/* Interactive Tour: spotlight on Upload → Agent Reasoning → Export */}
      <SpotlightTour
        open={tourOpen}
        onClose={handleCloseTour}
        currentStep={tourStep}
        onStepChange={setTourStep}
      />
    </div>
  );
}
