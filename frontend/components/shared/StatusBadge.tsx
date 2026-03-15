'use client';

import { cn } from '@/lib/utils';
import { Check, X, Clock, Loader2, Lock, Circle, Minus } from 'lucide-react';

export type StatusType = 'complete' | 'in-progress' | 'pending' | 'failed' | 'not-started' | 'certified' | 'locked';
/** Legacy variant names for backward compat */
type LegacyVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusBadgeProps {
  /** New spec-compliant status prop */
  status?: StatusType;
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

interface StatusConfig {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  label: string;
}

const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  'complete': {
    icon: Check,
    color: 'var(--status-success)',
    bg: 'var(--status-success-bg)',
    label: 'COMPLETE',
  },
  'in-progress': {
    icon: Loader2,
    color: 'var(--interactive-primary)',
    bg: 'var(--status-info-bg)',
    label: 'IN PROGRESS',
  },
  'pending': {
    icon: Clock,
    color: 'var(--status-warning)',
    bg: 'var(--status-warning-bg)',
    label: 'PENDING',
  },
  'failed': {
    icon: X,
    color: 'var(--status-error)',
    bg: 'var(--status-error-bg)',
    label: 'FAILED',
  },
  'not-started': {
    icon: Minus,
    color: 'var(--text-tertiary)',
    bg: 'var(--status-neutral-bg)',
    label: 'NOT STARTED',
  },
  'certified': {
    icon: Lock,
    color: 'var(--cert-primary)',
    bg: 'var(--bg-certified)',
    label: 'CERTIFIED',
  },
  'locked': {
    icon: Lock,
    color: 'var(--cert-primary)',
    bg: 'var(--bg-certified)',
    label: 'LOCKED',
  },
};

/** Map legacy variants to StatusType */
const LEGACY_MAP: Record<LegacyVariant, StatusType> = {
  success: 'complete',
  warning: 'pending',
  error: 'failed',
  info: 'in-progress',
  neutral: 'not-started',
};

export function StatusBadge(p: StatusBadgeProps) {
  // Resolve status: prefer `status`, fall back to mapped `variant`
  const resolvedStatus: StatusType = p.status ?? (p.variant ? LEGACY_MAP[p.variant] : 'not-started');
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
      }}
    >
      {showIcon && (
        <Icon
          className={cn(
            size === 'sm' ? 'w-3 h-3' : 'w-[18px] h-[18px]',
            resolvedStatus === 'in-progress' && 'animate-spin'
          )}
        />
      )}
      {showLabel && label}
    </span>
  );
}
