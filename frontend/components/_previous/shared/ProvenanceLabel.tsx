'use client';

/**
 * ProvenanceLabel — Shows where a pre-filled value came from.
 *
 * Design System Principle 0 (Confirmation Model):
 *   Pre-filled fields carry a provenance label.
 *   Empty fields carry a justification for why empty.
 *
 * Design System Principle 1 (No Black Box AI):
 *   Every Accept/Reject is accompanied by the Why.
 *
 * Agency Model:
 *   ink-blue = Sabit acted autonomously
 *   forest = human confirmed
 *   amber = needs review
 *   muted = no data available (justification for empty)
 */

import { CheckCircle2, Sparkles, ArrowRightLeft, Clock, HelpCircle } from 'lucide-react';

export type ProvenanceSource =
  | 'prior_period'
  | 'bank_match'
  | 'ai_classified'
  | 'ai_proposed'
  | 'engine_calculation'
  | 'human_entered'
  | 'template_applied'
  | 'empty_no_data'
  | 'empty_first_close';

interface ProvenanceLabelProps {
  source: ProvenanceSource;
  /** Confidence score (0-1) for AI sources */
  confidence?: number;
  /** Additional context (e.g. "ASC 606", "Layer 0 pattern match") */
  detail?: string;
  /** Compact mode — icon only, tooltip on hover */
  compact?: boolean;
}

const CONFIG: Record<ProvenanceSource, {
  label: string;
  color: string;
  bgColor: string;
  icon: typeof Sparkles;
  agency: 'sabit' | 'human' | 'empty';
}> = {
  prior_period: {
    label: 'From prior period',
    color: 'var(--color-sabit-acted)',
    bgColor: 'var(--color-sabit-acted-bg)',
    icon: Clock,
    agency: 'sabit',
  },
  bank_match: {
    label: 'Matched from bank statement',
    color: 'var(--color-sabit-acted)',
    bgColor: 'var(--color-sabit-acted-bg)',
    icon: ArrowRightLeft,
    agency: 'sabit',
  },
  ai_classified: {
    label: 'AI classified',
    color: 'var(--color-sabit-acted)',
    bgColor: 'var(--color-sabit-acted-bg)',
    icon: Sparkles,
    agency: 'sabit',
  },
  ai_proposed: {
    label: 'AI proposed',
    color: 'var(--color-needs-review)',
    bgColor: 'var(--color-needs-review-bg)',
    icon: Sparkles,
    agency: 'sabit',
  },
  engine_calculation: {
    label: 'Calculated by Sabit',
    color: 'var(--color-sabit-acted)',
    bgColor: 'var(--color-sabit-acted-bg)',
    icon: Sparkles,
    agency: 'sabit',
  },
  human_entered: {
    label: 'Entered manually',
    color: 'var(--color-human-confirmed)',
    bgColor: 'var(--color-human-confirmed-bg)',
    icon: CheckCircle2,
    agency: 'human',
  },
  template_applied: {
    label: 'From recurring template',
    color: 'var(--color-sabit-acted)',
    bgColor: 'var(--color-sabit-acted-bg)',
    icon: Clock,
    agency: 'sabit',
  },
  empty_no_data: {
    label: 'No prior period data — enter manually',
    color: 'var(--text-tertiary)',
    bgColor: 'transparent',
    icon: HelpCircle,
    agency: 'empty',
  },
  empty_first_close: {
    label: 'First close — no prior data available',
    color: 'var(--text-tertiary)',
    bgColor: 'transparent',
    icon: HelpCircle,
    agency: 'empty',
  },
};

export default function ProvenanceLabel({ source, confidence, detail, compact }: ProvenanceLabelProps) {
  const cfg = CONFIG[source];
  const Icon = cfg.icon;

  const confidenceText = confidence != null
    ? ` at ${Math.round(confidence * 100)}%`
    : '';

  const fullLabel = cfg.agency === 'empty'
    ? cfg.label
    : `${cfg.label}${confidenceText}${detail ? ` · ${detail}` : ''}`;

  if (compact) {
    return (
      <span
        title={fullLabel}
        className="inline-flex items-center"
        style={{ color: cfg.color }}
      >
        <Icon size={12} />
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 type-badge"
      style={{
        color: cfg.color,
        backgroundColor: cfg.bgColor,
      }}
    >
      <Icon size={11} strokeWidth={2} />
      <span>{fullLabel}</span>
    </span>
  );
}
