'use client';

import { cn } from '@/lib/utils';

interface AISuggestionCardProps {
  title?: string;
  advisoryLabel?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function AISuggestionCard({
  title = '✦ AI Suggested',
  advisoryLabel = 'Advisory only — review before applying',
  children,
  actions,
  className,
}: AISuggestionCardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-ai-purple-border bg-ai-purple-dim pl-4 border-l-4 border-l-ai-purple',
        className
      )}
      style={{ borderLeftWidth: '4px' }}
    >
      <div className="py-3 pr-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ai-purple">{title}</span>
          {advisoryLabel && (
            <span className="text-xs text-text-tertiary">{advisoryLabel}</span>
          )}
        </div>
        <div className="mt-2 text-primary text-sm">{children}</div>
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
