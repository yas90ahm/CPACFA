'use client';

import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info };
const styles: Record<string, string> = {
  success: 'bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success)]',
  error: 'bg-[var(--status-error-bg)] border-[var(--status-error-border)] text-[var(--status-error)]',
  warning: 'bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning)]',
  info: 'bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info)]',
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const Icon = icons[toast.type];
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(onRemove, toast.duration ?? 5000);
    return () => clearTimeout(timerRef.current);
  }, [toast.duration, onRemove]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-[var(--radius-lg)] border shadow-lg',
        'animate-[slideIn_0.25s_ease-out]',
        styles[toast.type],
      )}
      role="alert"
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <p className="text-sm text-[var(--text-primary)] flex-1">{toast.message}</p>
      <button onClick={onRemove} className="shrink-0 p-0.5 rounded hover:bg-black/5" aria-label="Dismiss">
        <X className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
      </button>
    </div>
  );
}

let counter = 0;

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    setToasts((prev) => [...prev, { ...t, id: `toast-${++counter}` }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 flex flex-col gap-2 w-80"
        style={{ zIndex: 'var(--z-toast)' }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export { ToastProvider, useToast, type Toast };
