'use client';

import { cn } from '@/lib/utils';
import { PipelineStepper } from '@/components/shared/PipelineStepper';
import type { PipelineStep } from '@/components/shared/PipelineStepper';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { RefreshCw } from 'lucide-react';

/* ── Progress ring ────────────────────────────────────────────────────────── */

function ProgressRing({
  value,
  max,
  size = 48,
  strokeWidth = 4,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? value / max : 0;
  const offset = circumference * (1 - pct);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="flex-shrink-0"
      aria-label={`Day ${value} of ${max}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border-default)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--interactive-primary)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        style={{
          fill: 'var(--text-primary)',
          fontSize: size * 0.22,
          fontWeight: 600,
          fontFamily: 'inherit',
        }}
      >
        {value}
      </text>
    </svg>
  );
}

/* ── State badge helper ───────────────────────────────────────────────────── */

function sessionStateToBadge(state: string | undefined) {
  switch (state) {
    case 'OPEN':
      return { status: 'not-started' as const, label: 'OPEN' };
    case 'IN_PROGRESS':
      return { status: 'in-progress' as const, label: 'IN PROGRESS' };
    case 'UNDER_REVIEW':
      return { status: 'pending' as const, label: 'UNDER REVIEW' };
    case 'CERTIFIED':
      return { status: 'certified' as const, label: 'CERTIFIED' };
    case 'LOCKED':
      return { status: 'locked' as const, label: 'LOCKED' };
    default:
      return { status: 'not-started' as const, label: state ?? '' };
  }
}

/* ── Pipeline steps const ─────────────────────────────────────────────────── */

export const PIPELINE_STEPS = [
  { id: 'upload', label: 'Upload', path: 'trial-balance' },
  { id: 'map', label: 'Map', path: 'mapping' },
  { id: 'recon', label: 'Recon', path: 'reconciliation' },
  { id: 'adjust', label: 'Adjust', path: 'adjustments' },
  { id: 'generate', label: 'Prepare', path: 'statements' },
  { id: 'variance', label: 'Variance', path: 'variance' },
  { id: 'review', label: 'Review', path: 'review' },
  { id: 'certify', label: 'Certify', path: 'review' },
] as const;

/* ── PipelineCard ─────────────────────────────────────────────────────────── */

export interface PipelineCardProps {
  periodLabel: string;
  entityName: string;
  sessionState: string | undefined;
  dayElapsed: number;
  targetDays: number;
  stepperSteps: PipelineStep[];
  sessionId: string;
  canReplaceGL: boolean;
  isInProgress: boolean;
  onReplaceGL: () => void;
}

export function PipelineCard({
  periodLabel,
  entityName,
  sessionState,
  dayElapsed,
  targetDays,
  stepperSteps,
  sessionId,
  canReplaceGL: showReplaceGL,
  isInProgress,
  onReplaceGL,
}: PipelineCardProps) {
  return (
    <section
      className="grid grid-cols-12 gap-6 items-center"
      style={{ minHeight: 72 }}
    >
      {/* Left: Period name + entity + status badge */}
      <div className="col-span-12 lg:col-span-5 flex items-center gap-4">
        <div>
          <h1
            className="font-semibold leading-tight text-2xl"
            style={{ color: 'var(--text-primary)' }}
          >
            {periodLabel} Close
          </h1>
          <p
            className="mt-0.5 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {entityName}
          </p>
        </div>
        <StatusBadge {...sessionStateToBadge(sessionState)} />
      </div>

      {/* Right: Day progress ring + Pipeline stepper */}
      <div className="col-span-12 lg:col-span-7 flex items-center gap-5 justify-end flex-wrap">
        <div className="flex items-center gap-2">
          <ProgressRing value={dayElapsed} max={targetDays} size={48} strokeWidth={4} />
          <span
            className="text-sm whitespace-nowrap"
            style={{ color: 'var(--text-secondary)' }}
          >
            Day {dayElapsed} of {targetDays}
          </span>
        </div>
        <PipelineStepper
          steps={stepperSteps}
          compact={false}
          interactive
          sessionId={sessionId}
          onStepClick={(stepId) => {
            const step = PIPELINE_STEPS.find((s) => s.id === stepId);
            if (step) {
              window.location.href = `/close/${sessionId}/${step.path}`;
            }
          }}
        />
        {showReplaceGL && isInProgress && (
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium',
              'rounded-[var(--radius-md)] border border-[var(--border-default)]',
              'bg-[var(--bg-surface)] text-[var(--text-secondary)]',
              'hover:bg-[var(--interactive-ghost-hover)] transition-colors',
            )}
            onClick={onReplaceGL}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Replace GL
          </button>
        )}
      </div>
    </section>
  );
}
