'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

export interface SearchableSelectOption {
  value: string;
  label: string;
  group?: string;
  subLabel?: string;
}

export interface SearchableSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  getOptionLabel?: (opt: SearchableSelectOption) => string;
  groupOrder?: string[];
}

const DEFAULT_GROUP_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  getOptionLabel,
  groupOrder = DEFAULT_GROUP_ORDER,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const displayLabel = getOptionLabel ? (selected ? getOptionLabel(selected) : null) : (selected?.label ?? null);

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.value.toLowerCase().includes(query.toLowerCase()) ||
          o.label.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const grouped = groupOrder.length
    ? groupOrder.map((group) => ({ group, opts: filtered.filter((o) => o.group === group) })).filter((g) => g.opts.length > 0)
    : [{ group: '', opts: filtered }];

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback(
    (opt: SearchableSelectOption) => {
      onChange(opt.value);
      setOpen(false);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key === 'Enter' && open && filtered.length === 1) {
        handleSelect(filtered[0]);
        e.preventDefault();
      }
    },
    [open, filtered, handleSelect]
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 rounded-input border bg-input text-left text-sm',
          'border-border focus:outline-none focus:border-border-focus',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
      >
        <span className={displayLabel ? 'text-primary' : 'text-text-muted'}>{displayLabel ?? placeholder}</span>
        <ChevronDown className={cn('w-4 h-4 text-text-tertiary shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-input border border-border bg-surface shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2 border-b border-border-light">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code or name…"
              className="w-full px-3 py-2 rounded-input border border-border bg-input text-sm focus:outline-none focus:border-border-focus"
              autoFocus
            />
          </div>
          <div className="py-1">
            {grouped.map(({ group, opts }) => (
              <div key={group || 'default'}>
                {group && (
                  <div className="px-3 py-1.5 text-xs font-medium text-text-tertiary bg-elevated sticky top-0">
                    {group}
                  </div>
                )}
                {opts.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-hover flex items-center justify-between',
                      opt.value === value && 'bg-accent-dim text-accent'
                    )}
                  >
                    <span>{opt.label}</span>
                    {opt.subLabel != null && <span className="text-text-muted font-mono text-xs">{opt.subLabel}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
          {filtered.length === 0 && <div className="px-3 py-4 text-sm text-text-muted">No matches</div>}
        </div>
      )}
    </div>
  );
}
