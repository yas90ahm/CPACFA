'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { parseMoney, formatMoneyString } from '@/lib/format';

export interface MoneyInputProps {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  allowNegative?: boolean;
  label?: string;
  error?: string;
}

const sizeMap: Record<string, string> = { sm: 'py-1.5 text-sm', md: 'py-2 text-base', lg: 'py-2.5 text-lg' };

export function MoneyInput(props: MoneyInputProps) {
  const [focus, setFocus] = useState(false);
  const sz = props.size ?? 'md';

  const handleFocus = useCallback(() => {
    setFocus(true);
    if (props.value) {
      const n = parseMoney(props.value);
      props.onChange(n === 0 ? null : String(n));
    }
  }, [props.value, props.onChange]);

  const handleBlur = useCallback(() => {
    setFocus(false);
    if (props.value != null && props.value.trim() !== '') {
      props.onChange(formatMoneyString(parseMoney(props.value)));
    } else {
      props.onChange(null);
    }
  }, [props.value, props.onChange]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value.replace(/[^0-9.-]/g, '');
      if (props.allowNegative === false) v = v.replace(/-/g, '');
      if ((v.match(/\./g) || []).length > 1) v = v.slice(0, v.lastIndexOf('.'));
      props.onChange(v === '' || v === '-' ? (v === '' ? null : v) : v);
    },
    [props.onChange, props.allowNegative]
  );

  const val = props.value ?? '';

  return (
    <div className="space-y-1">
      {props.label && <label className="block text-xs font-medium text-text-secondary">{props.label}</label>}
      <div
        className={cn(
          'flex items-center rounded-input border bg-input font-mono text-right',
          focus && 'border-border-focus ring-1 ring-border-focus',
          !focus && 'border-border',
          props.error && 'border-status-red',
          props.disabled && 'opacity-60 cursor-not-allowed'
        )}
      >
        <span className="pl-3 text-text-secondary">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={val}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={props.disabled}
          placeholder={props.placeholder ?? '0.00'}
          className={cn('flex-1 min-w-0 pr-3 bg-transparent text-primary placeholder:text-text-muted focus:outline-none tabular-nums', sizeMap[sz])}
        />
      </div>
      {props.error && <p className="text-xs text-status-red">{props.error}</p>}
    </div>
  );
}
