'use client';

import { useEffect, useCallback, useRef, useState, type ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import { cn } from '@/lib/utils';

export type ConfirmSeverity = 'standard' | 'critical' | 'ceremony';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | ReactNode;
  /** @deprecated Use message instead */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** @deprecated Use severity='critical' instead */
  destructive?: boolean;
  severity?: ConfirmSeverity;
  requiresTextInput?: boolean;
  requiredText?: string;
  showImpactSummary?: { label: string; value: string }[];
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
  severity: severityProp,
  requiresTextInput = false,
  requiredText = '',
  showImpactSummary,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve severity: explicit prop > destructive legacy > standard
  const severity: ConfirmSeverity = severityProp ?? (destructive ? 'critical' : 'standard');

  const canConfirm = !requiresTextInput || inputValue === requiredText;

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  // Focus trap
  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    // Focus the input or dialog when opening
    setTimeout(() => {
      if (requiresTextInput && inputRef.current) {
        inputRef.current.focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 50);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleEscape, requiresTextInput]);

  // Reset input on close
  useEffect(() => {
    if (!open) setInputValue('');
  }, [open]);

  if (!open) return null;

  const confirmBg = severity === 'critical'
    ? 'var(--interactive-destructive)'
    : severity === 'ceremony'
      ? 'var(--cert-primary)'
      : 'var(--interactive-primary)';

  return (
    <FocusTrap active={open} focusTrapOptions={{ allowOutsideClick: true, escapeDeactivates: true }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Overlay */}
        <div
          className="fixed inset-0"
          style={{ backgroundColor: 'var(--bg-overlay)' }}
          aria-hidden
          onClick={onClose}
        />
        {/* Dialog */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          tabIndex={-1}
          className="relative max-w-md w-full outline-none"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4"
          style={{
            borderBottom: '1px solid var(--border-subtle)',
            ...(severity === 'critical' ? { backgroundColor: 'var(--status-error-bg)' } : {}),
            borderRadius: severity === 'critical' ? 'var(--radius-lg) var(--radius-lg) 0 0' : undefined,
          }}
        >
          <h3
            id="confirm-dialog-title"
            className={cn(
              'text-lg font-semibold',
              severity === 'ceremony' && 'font-sans'
            )}
            style={{
              color: severity === 'critical'
                ? 'var(--status-error)'
                : severity === 'ceremony'
                  ? 'var(--cert-primary)'
                  : 'var(--text-primary)',
              fontFamily: undefined,
            }}
          >
            {title}
          </h3>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3">
          {typeof message === 'string' ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</div>
          )}

          {detail && (
            <p className="text-sm whitespace-pre-line" style={{ color: 'var(--text-tertiary)' }}>{detail}</p>
          )}

          {severity === 'ceremony' && (
            <p
              className="text-sm italic"
              style={{
                fontFamily: undefined,
                color: 'var(--text-secondary)',
                lineHeight: 1.65,
              }}
            >
              This action is final and will produce an immutable certification record.
            </p>
          )}

          {/* Impact summary */}
          {showImpactSummary && showImpactSummary.length > 0 && (
            <div
              className="rounded-md p-3 space-y-1"
              style={{
                backgroundColor: 'var(--bg-surface-sunken)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {showImpactSummary.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Text confirmation input */}
          {requiresTextInput && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Type &ldquo;{requiredText}&rdquo; to confirm
              </label>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full text-sm"
                style={{
                  backgroundColor: 'var(--bg-surface-sunken)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                }}
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex justify-end gap-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-md transition-colors"
            style={{
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: confirmBg,
              borderRadius: 'var(--radius-md)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
    </FocusTrap>
  );
}
