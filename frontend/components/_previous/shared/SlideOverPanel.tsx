'use client';

import { useEffect, useRef, useCallback } from 'react';
import FocusTrap from 'focus-trap-react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SlideOverPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string | number;
}

export function SlideOverPanel({ open, onClose, title, children, footer, width = '600px' }: SlideOverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleEscape]);

  useEffect(() => {
    if (open && panelRef.current) {
      const focusable = panelRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const first = focusable[0] as HTMLElement | undefined;
      if (first) first.focus();
    }
  }, [open]);

  if (!open) return null;

  const widthStyle = typeof width === 'number' ? `${width}px` : width;

  return (
    <FocusTrap active={open} focusTrapOptions={{ allowOutsideClick: true, escapeDeactivates: true }}>
      <div className="fixed inset-0 z-50 flex">
        <div className="fixed inset-0 bg-black/50" aria-hidden onClick={onClose} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="slide-over-title"
          className={cn('relative flex flex-col h-full bg-surface border-l border-border shadow-xl')}
          style={{ width: widthStyle }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h2 id="slide-over-title" className="font-display text-lg text-primary">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="p-2 rounded-input text-text-secondary hover:text-primary hover:bg-hover" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer != null && (
            <div className="shrink-0 px-6 py-4 border-t border-border bg-elevated flex items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </FocusTrap>
  );
}
