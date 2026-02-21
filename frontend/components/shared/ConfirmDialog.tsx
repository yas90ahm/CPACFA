'use client';

import { useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  detail,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
}: ConfirmDialogProps) {
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative bg-surface border border-border rounded-card shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="font-display text-lg text-primary mb-2">
          {title}
        </h3>
        <p className="text-text-secondary text-sm mb-4">{message}</p>
        {detail && <p className="text-text-muted text-sm whitespace-pre-line mb-4">{detail}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cn(
              'px-4 py-2 rounded-input text-sm font-medium',
              destructive ? 'bg-status-red text-white hover:opacity-90' : 'bg-accent text-white hover:bg-accent/90'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
