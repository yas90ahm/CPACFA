'use client';

import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: { value: string; direction: 'up' | 'down' | 'flat'; favorable?: boolean };
  icon?: React.ReactNode;
  subtitle?: string;
}

const directionIcon = { up: ArrowUp, down: ArrowDown, flat: Minus };

function MetricCard({ label, value, change, icon, subtitle }: MetricCardProps) {
  const changeColor = change
    ? change.direction === 'flat'
      ? 'text-[var(--text-tertiary)]'
      : change.favorable
        ? 'text-[var(--status-success)]'
        : 'text-[var(--status-error)]'
    : '';

  const DirIcon = change ? directionIcon[change.direction] : null;

  return (
    <div
      className={cn(
        'relative bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)]',
        'px-[var(--space-5)] py-[var(--space-4)] shadow-card',
      )}
    >
      {icon && (
        <div className="absolute top-3 right-3 text-[var(--text-tertiary)] opacity-40">
          {icon}
        </div>
      )}
      <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
        {value}
      </p>
      {(change || subtitle) && (
        <div className="mt-2 flex items-center gap-2">
          {change && DirIcon && (
            <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', changeColor)}>
              <DirIcon className="h-3 w-3" />
              {change.value}
            </span>
          )}
          {subtitle && (
            <span className="text-xs text-[var(--text-tertiary)]">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  );
}

export { MetricCard, type MetricCardProps };
