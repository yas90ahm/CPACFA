'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { StatusBadge, type StatusType } from './StatusBadge';

export interface Period {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  daysToClose?: number;
}

export interface PeriodSelectorProps {
  currentPeriod: Period;
  availablePeriods: Period[];
  onPeriodChange: (periodId: string) => void;
  showStatus?: boolean;
  compactMode?: boolean;
  className?: string;
}

function statusToType(s: string): StatusType {
  const map: Record<string, StatusType> = {
    OPEN: 'not-started',
    IN_PROGRESS: 'in-progress',
    UNDER_REVIEW: 'pending',
    CERTIFIED: 'certified',
    LOCKED: 'locked',
  };
  return map[s] ?? 'not-started';
}

function compactLabel(label: string): string {
  // "February 2026" → "Feb 2026"
  const parts = label.split(' ');
  if (parts.length === 2 && parts[0].length > 3) {
    return parts[0].slice(0, 3) + ' ' + parts[1];
  }
  return label;
}

export function PeriodSelector({
  currentPeriod,
  availablePeriods,
  onPeriodChange,
  showStatus = true,
  compactMode = false,
  className,
}: PeriodSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
        style={{
          border: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <span>{compactMode ? compactLabel(currentPeriod.label) : currentPeriod.label}</span>
        {showStatus && !compactMode && (
          <StatusBadge status={statusToType(currentPeriod.status)} size="sm" showLabel={false} />
        )}
        {showStatus && compactMode && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: currentPeriod.status === 'CERTIFIED' || currentPeriod.status === 'LOCKED'
                ? 'var(--status-success)'
                : currentPeriod.status === 'IN_PROGRESS'
                  ? 'var(--interactive-primary)'
                  : currentPeriod.status === 'UNDER_REVIEW'
                    ? 'var(--status-warning)'
                    : 'var(--text-tertiary)',
            }}
          />
        )}
        <ChevronDown
          className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')}
          style={{ color: 'var(--text-tertiary)' }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 right-0 min-w-[220px] py-1 z-50"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {availablePeriods.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPeriodChange(p.id); setOpen(false); }}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-sm transition-colors',
                p.id === currentPeriod.id && 'font-medium'
              )}
              style={{
                color: p.id === currentPeriod.id ? 'var(--interactive-primary)' : 'var(--text-primary)',
                backgroundColor: p.id === currentPeriod.id ? 'var(--bg-table-row-selected)' : undefined,
              }}
              onMouseEnter={(e) => {
                if (p.id !== currentPeriod.id) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-table-row-hover)';
              }}
              onMouseLeave={(e) => {
                if (p.id !== currentPeriod.id) (e.currentTarget as HTMLElement).style.backgroundColor = '';
              }}
            >
              <span>{p.label}</span>
              <div className="flex items-center gap-2">
                {showStatus && <StatusBadge status={statusToType(p.status)} size="sm" />}
                {p.daysToClose != null && (
                  <span className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                    {p.daysToClose}d
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
