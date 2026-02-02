'use client';

import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CelebrationToastProps {
  open: boolean;
  onClose?: () => void;
  message?: string;
  duration?: number;
  className?: string;
}

/**
 * Celebration toast when analysis is 100% complete: "Your Audit-Ready Report is Prepared."
 */
export function CelebrationToast({
  open,
  onClose,
  message = 'Your Audit-Ready Report is Prepared.',
  duration = 5000,
  className,
}: CelebrationToastProps) {
  React.useEffect(() => {
    if (!open || !onClose || duration <= 0) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [open, onClose, duration]);

  if (!open) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-lg shadow-lg border',
        'bg-emerald-50 border-emerald-200 text-emerald-900',
        'transition-all duration-300 ease-out',
        className
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-sm font-medium">{message}</p>
      {/* Subtle celebration: small dots that could be confetti-like */}
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
