'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TooltipSimpleProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function TooltipSimple({ content, children, side = 'top', className }: TooltipSimpleProps) {
  const [visible, setVisible] = React.useState(false);
  const positionClass =
    side === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
      : side === 'bottom'
        ? 'top-full left-1/2 -translate-x-1/2 mt-2'
        : side === 'left'
          ? 'right-full top-1/2 -translate-y-1/2 mr-2'
          : 'left-full top-1/2 -translate-y-1/2 ml-2';

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={cn(
            'absolute z-50 px-3 py-2 text-xs font-medium text-card-foreground bg-card border border-border rounded-md shadow-md whitespace-normal max-w-xs pointer-events-none',
            positionClass
          )}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  );
}
