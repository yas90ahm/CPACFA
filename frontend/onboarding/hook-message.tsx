'use client';

import * as React from 'react';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const HOOK_TEXT =
  "I'm your CPA/CFA team. Drop any financial file—a bank statement, a tax return, or a spreadsheet—and I'll give you a health check in 60 seconds.";

export interface HookMessageProps {
  className?: string;
  onDismiss?: () => void;
}

/**
 * First-run hook: bot message welcoming the user and explaining the value prop.
 */
export function HookMessage({ className, onDismiss }: HookMessageProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm',
        'flex gap-3 items-start',
        className
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Bot className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-relaxed">
          {HOOK_TEXT}
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground rounded p-1"
          aria-label="Dismiss"
        >
          <span className="text-lg leading-none">&times;</span>
        </button>
      )}
    </div>
  );
}
