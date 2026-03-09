'use client';

import { cn } from '@/lib/utils';

const STYLES: Record<string, string> = {
  success: 'bg-status-green-dim text-status-green',
  warning: 'bg-status-amber-dim text-status-amber',
  error: 'bg-status-red-dim text-status-red',
  info: 'bg-status-blue-dim text-status-blue',
  neutral: 'bg-elevated text-text-secondary',
};

const DOTS: Record<string, string> = {
  success: 'bg-status-green',
  warning: 'bg-status-amber',
  error: 'bg-status-red',
  info: 'bg-status-blue',
  neutral: 'bg-text-tertiary',
};

export function StatusBadge(p: { variant: keyof typeof STYLES; label: string; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium tracking-wide', STYLES[p.variant], p.className)}>
      {p.dot !== false && <span className={cn('w-1.5 h-1.5 rounded-full', DOTS[p.variant])} />}
      {p.label}
    </span>
  );
}
