'use client';

import { cn } from '@/lib/utils';

const STYLES: Record<string, string> = {
  success: 'bg-status-green-dim text-status-green border-status-green/30',
  warning: 'bg-status-amber-dim text-status-amber border-status-amber/30',
  error: 'bg-status-red-dim text-status-red border-status-red/30',
  info: 'bg-status-blue-dim text-status-blue border-status-blue/30',
  neutral: 'bg-transparent text-text-secondary border-border-light',
};

export function StatusBadge(p: { variant: keyof typeof STYLES; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium border', STYLES[p.variant], p.className)}>
      {p.label}
    </span>
  );
}
