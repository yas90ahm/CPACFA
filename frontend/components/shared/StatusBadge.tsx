'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, AlertCircle, MinusCircle, Lock, Circle } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Canonical status types and their semantic groups                    */
/* ------------------------------------------------------------------ */

/** All recognized status strings (hyphenated canonical form) */
export type StatusType =
  /* Green — success */
  | 'complete' | 'passing' | 'approved' | 'current' | 'certified'
  /* Blue — active / in-flight */
  | 'active' | 'in-progress' | 'proposed' | 'generating'
  /* Amber — needs attention */
  | 'pending' | 'needs-attention' | 'at-risk' | 'under-review'
  /* Red — blocked / failure */
  | 'blocked' | 'failing' | 'overdue' | 'rejected' | 'error'
  /* Grey — neutral */
  | 'not-started' | 'locked' | 'inactive' | 'neutral';

/** Legacy variant names for backward compat */
type LegacyVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusBadgeProps {
  /** New spec-compliant status prop */
  status?: StatusType | string;
  /** @deprecated Legacy variant prop — use status instead */
  variant?: LegacyVariant;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  showLabel?: boolean;
  label?: string;
  /** @deprecated Use showIcon instead */
  dot?: boolean;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Status config: icon, color, bg, border, label                      */
/* ------------------------------------------------------------------ */

interface StatusConfig {
  icon: React.ComponentType<{ className?: string; fill?: string }>;
  color: string;
  bg: string;
  border: string;
  label: string;
}

const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  /* ── Green: success ── */
  'complete': {
    icon: CheckCircle2,
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg)',
    border: 'var(--status-success-border)',
    label: 'COMPLETE',
  },
  'passing': {
    icon: CheckCircle2,
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg)',
    border: 'var(--status-success-border)',
    label: 'PASSING',
  },
  'approved': {
    icon: CheckCircle2,
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg)',
    border: 'var(--status-success-border)',
    label: 'APPROVED',
  },
  'current': {
    icon: CheckCircle2,
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg)',
    border: 'var(--status-success-border)',
    label: 'CURRENT',
  },
  'certified': {
    icon: CheckCircle2,
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg)',
    border: 'var(--status-success-border)',
    label: 'CERTIFIED',
  },

  /* ── Blue: active / in-flight ── */
  'active': {
    icon: Circle,
    color: 'var(--status-info)',
    bg: 'var(--status-info-bg)',
    border: 'var(--status-info-border)',
    label: 'ACTIVE',
  },
  'in-progress': {
    icon: Circle,
    color: 'var(--status-info)',
    bg: 'var(--status-info-bg)',
    border: 'var(--status-info-border)',
    label: 'IN PROGRESS',
  },
  'proposed': {
    icon: Circle,
    color: 'var(--status-info)',
    bg: 'var(--status-info-bg)',
    border: 'var(--status-info-border)',
    label: 'PROPOSED',
  },
  'generating': {
    icon: Circle,
    color: 'var(--status-info)',
    bg: 'var(--status-info-bg)',
    border: 'var(--status-info-border)',
    label: 'GENERATING',
  },

  /* ── Amber: warning / needs attention ── */
  'pending': {
    icon: AlertCircle,
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-bg)',
    border: 'var(--status-warning-border)',
    label: 'PENDING',
  },
  'needs-attention': {
    icon: AlertCircle,
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-bg)',
    border: 'var(--status-warning-border)',
    label: 'NEEDS ATTENTION',
  },
  'at-risk': {
    icon: AlertCircle,
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-bg)',
    border: 'var(--status-warning-border)',
    label: 'AT RISK',
  },
  'under-review': {
    icon: AlertCircle,
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-bg)',
    border: 'var(--status-warning-border)',
    label: 'UNDER REVIEW',
  },

  /* ── Red: error / blocked ── */
  'blocked': {
    icon: XCircle,
    color: 'var(--status-error)',
    bg: 'var(--status-error-bg)',
    border: 'var(--status-error-border)',
    label: 'BLOCKED',
  },
  'failing': {
    icon: XCircle,
    color: 'var(--status-error)',
    bg: 'var(--status-error-bg)',
    border: 'var(--status-error-border)',
    label: 'FAILING',
  },
  'overdue': {
    icon: XCircle,
    color: 'var(--status-error)',
    bg: 'var(--status-error-bg)',
    border: 'var(--status-error-border)',
    label: 'OVERDUE',
  },
  'rejected': {
    icon: XCircle,
    color: 'var(--status-error)',
    bg: 'var(--status-error-bg)',
    border: 'var(--status-error-border)',
    label: 'REJECTED',
  },
  'error': {
    icon: XCircle,
    color: 'var(--status-error)',
    bg: 'var(--status-error-bg)',
    border: 'var(--status-error-border)',
    label: 'ERROR',
  },

  /* ── Grey: neutral ── */
  'not-started': {
    icon: MinusCircle,
    color: 'var(--status-neutral)',
    bg: 'var(--status-neutral-bg)',
    border: 'var(--border-default)',
    label: 'NOT STARTED',
  },
  'locked': {
    icon: Lock,
    color: 'var(--status-neutral)',
    bg: 'var(--status-neutral-bg)',
    border: 'var(--border-default)',
    label: 'LOCKED',
  },
  'inactive': {
    icon: MinusCircle,
    color: 'var(--status-neutral)',
    bg: 'var(--status-neutral-bg)',
    border: 'var(--border-default)',
    label: 'INACTIVE',
  },
  'neutral': {
    icon: MinusCircle,
    color: 'var(--status-neutral)',
    bg: 'var(--status-neutral-bg)',
    border: 'var(--border-default)',
    label: 'NEUTRAL',
  },
};

/* ------------------------------------------------------------------ */
/*  Legacy variant → StatusType mapping                                */
/* ------------------------------------------------------------------ */

const LEGACY_MAP: Record<LegacyVariant, StatusType> = {
  success: 'complete',
  warning: 'pending',
  error: 'error',
  info: 'in-progress',
  neutral: 'not-started',
};

/* ------------------------------------------------------------------ */
/*  Normalizer: accepts hyphenated, underscored, or UPPER_CASE input   */
/* ------------------------------------------------------------------ */

/** Common aliases that map to canonical status names */
const STATUS_ALIASES: Record<string, StatusType> = {
  'failed': 'error',
  'fail': 'error',
  'success': 'complete',
  'completed': 'complete',
  'done': 'complete',
  'open': 'active',
  'running': 'in-progress',
  'draft': 'not-started',
  'waiting': 'pending',
  'warn': 'pending',
  'warning': 'pending',
  'info': 'in-progress',
  'danger': 'error',
};

function normalizeStatus(raw: string): StatusType {
  // lowercase, replace underscores with hyphens, trim
  const normalized = raw.toLowerCase().replace(/_/g, '-').trim();
  if (normalized in STATUS_CONFIG) return normalized as StatusType;
  if (normalized in STATUS_ALIASES) return STATUS_ALIASES[normalized];
  // Fallback to not-started for unknown statuses
  return 'not-started';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StatusBadge(p: StatusBadgeProps) {
  // Resolve status: prefer `status`, fall back to mapped `variant`
  let resolvedStatus: StatusType;
  if (p.status) {
    resolvedStatus = normalizeStatus(p.status);
  } else if (p.variant) {
    resolvedStatus = LEGACY_MAP[p.variant] ?? 'not-started';
  } else {
    resolvedStatus = 'not-started';
  }

  const config = STATUS_CONFIG[resolvedStatus];
  const size = p.size ?? 'md';
  const showIcon = p.showIcon ?? (p.dot !== false);
  const showLabel = p.showLabel ?? true;
  const label = p.label ?? config.label;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold uppercase tracking-[0.04em] rounded',
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-[0.6875rem] px-2 py-1',
        p.className
      )}
      style={{
        color: config.color,
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      {showIcon && (
        <Icon
          className={cn(
            size === 'sm' ? 'w-3 h-3' : 'w-[18px] h-[18px]',
          )}
          {...(Icon === Circle ? { fill: 'currentColor' } : {})}
        />
      )}
      {showLabel && label}
    </span>
  );
}
