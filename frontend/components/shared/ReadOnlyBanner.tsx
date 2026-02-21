'use client';

import { AlertCircle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CloseState } from '@/lib/types/close-session';

export interface ReadOnlyBannerProps {
  state: CloseState;
  className?: string;
}

export function ReadOnlyBanner({ state, className }: ReadOnlyBannerProps) {
  if (state === 'IN_PROGRESS' || state === 'OPEN') return null;

  const config = {
    UNDER_REVIEW: {
      icon: AlertCircle,
      title: 'Under Review',
      message: 'This period is under review. Changes are not allowed until the reviewer approves or sends back.',
      color: 'status-amber',
    },
    CERTIFIED: {
      icon: Lock,
      title: 'Period Certified',
      message: 'This period has been certified. All workspaces are read-only.',
      color: 'status-green',
    },
    LOCKED: {
      icon: Lock,
      title: 'Period Locked',
      message: 'This period is locked and cannot be modified. This is a historical record.',
      color: 'text-muted',
    },
  }[state];

  if (!config) return null;

  const Icon = config.icon;

  return (
    <div
      className={cn(
        'p-4 rounded-card border flex items-center gap-3 mb-4',
        config.color === 'status-amber' && 'bg-status-amber-dim border-status-amber',
        config.color === 'status-green' && 'bg-status-green-dim border-status-green',
        config.color === 'text-muted' && 'bg-surface-alt border-border-light',
        className
      )}
    >
      <Icon
        className={cn(
          'w-5 h-5 shrink-0',
          config.color === 'status-amber' && 'text-status-amber',
          config.color === 'status-green' && 'text-status-green',
          config.color === 'text-muted' && 'text-text-muted'
        )}
      />
      <div className="flex-1">
        <div
          className={cn(
            'font-medium',
            config.color === 'status-amber' && 'text-status-amber',
            config.color === 'status-green' && 'text-status-green',
            config.color === 'text-muted' && 'text-text-secondary'
          )}
        >
          {config.title}
        </div>
        <div className="text-sm text-text-secondary mt-1">{config.message}</div>
      </div>
    </div>
  );
}
