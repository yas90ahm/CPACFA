'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  status?: 'default' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
  children: React.ReactNode;
}

const statusBorder: Record<string, string> = {
  default: '',
  success: 'border-l-[3px] border-l-[var(--status-success)]',
  warning: 'border-l-[3px] border-l-[var(--status-warning)]',
  error: 'border-l-[3px] border-l-[var(--status-error)]',
  info: 'border-l-[3px] border-l-[var(--status-info)]',
};

function Card({ title, subtitle, action, status = 'default', className, children }: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)]',
        'shadow-card transition-shadow duration-[var(--transition-normal)]',
        statusBorder[status],
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-start justify-between px-[var(--space-6)] pt-[var(--space-5)] pb-[var(--space-3)]">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{subtitle}</p>
            )}
          </div>
          {action && <div className="ml-4 shrink-0">{action}</div>}
        </div>
      )}
      <div className="px-[var(--space-6)] pb-[var(--space-5)]">{children}</div>
    </div>
  );
}

export { Card, type CardProps };
