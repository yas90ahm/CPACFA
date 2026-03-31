'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PillItem {
  id: string;
  label: string;
  active: boolean;
  toggle: () => void;
}

export interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchDebounceMs?: number;
  pills?: PillItem[];
  children?: React.ReactNode;
  className?: string;
}

export function FilterBar(props: FilterBarProps) {
  const [local, setLocal] = useState(props.searchValue);
  const ms = props.searchDebounceMs ?? 200;

  useEffect(() => {
    setLocal(props.searchValue);
  }, [props.searchValue]);

  const debounced = useCallback(
    (value: string) => {
      const t = setTimeout(() => props.onSearchChange(value), ms);
      return () => clearTimeout(t);
    },
    [props.onSearchChange, ms]
  );

  useEffect(() => {
    if (local === props.searchValue) return;
    const cancel = debounced(local);
    return cancel;
  }, [local, props.searchValue, debounced]);

  return (
    <div className={cn('flex flex-wrap items-center gap-3', props.className)}>
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <input
          type="text"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={props.searchPlaceholder ?? 'Search…'}
          className="w-full pl-9 pr-3 py-2 rounded-input bg-input border border-border text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
      </div>
      {props.pills?.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={p.toggle}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            p.active ? 'bg-accent-dim text-accent border-accent/30' : 'bg-elevated text-text-secondary border-border-light hover:bg-hover'
          )}
        >
          {p.label}
        </button>
      ))}
      {props.children}
    </div>
  );
}
