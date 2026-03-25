'use client';

import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

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

/** Format a clean numeric string for display (add commas). */
function formatForDisplay(raw: string | null): string {
  if (raw == null || raw.trim() === '') return '';
  // Strip any existing formatting
  const cleaned = raw.replace(/[$,]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return cleaned;
  // Parse to parts
  const parts = cleaned.split('.');
  const intPart = parts[0];
  const decPart = parts.length > 1 ? parts[1] : undefined;
  // Add thousand separators to integer part
  const negative = intPart.startsWith('-');
  const digits = negative ? intPart.slice(1) : intPart;
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = negative ? `-${withCommas}` : withCommas;
  return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
}

/** Strip formatting to get a clean decimal string for API calls. */
function stripToDecimal(raw: string): string {
  return raw.replace(/[$,]/g, '').trim();
}

export function MoneyInput(props: MoneyInputProps) {
  const [focused, setFocused] = useState(false);
  const sz = props.size ?? 'md';
  // Track the raw editing value separately from the prop value
  const [editValue, setEditValue] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = useCallback(() => {
    setFocused(true);
    // Show raw unformatted value for editing
    if (props.value != null) {
      setEditValue(stripToDecimal(props.value));
    }
  }, [props.value]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    if (editValue != null && editValue.trim() !== '') {
      // Commit the clean value to parent
      const clean = stripToDecimal(editValue);
      // Validate it's a reasonable number
      if (/^-?\d+(\.\d{0,2})?$/.test(clean)) {
        props.onChange(clean);
      } else if (/^-?\d+\.\d+$/.test(clean)) {
        // Truncate to 2 decimals
        const parts = clean.split('.');
        props.onChange(`${parts[0]}.${parts[1].slice(0, 2)}`);
      } else {
        props.onChange(clean || null);
      }
    } else {
      props.onChange(null);
    }
    setEditValue(null);
  }, [editValue, props]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value;
      // Only allow digits, one decimal point, and optionally a leading minus
      v = v.replace(/[^0-9.-]/g, '');
      if (props.allowNegative === false) v = v.replace(/-/g, '');
      // Only allow one decimal point
      const dots = (v.match(/\./g) || []).length;
      if (dots > 1) v = v.slice(0, v.lastIndexOf('.'));
      // Only allow minus at start
      if (v.indexOf('-') > 0) v = v.replace(/-/g, '');
      setEditValue(v === '' ? null : v);
    },
    [props.allowNegative]
  );

  // What to show in the input
  const displayValue = focused
    ? (editValue ?? '')
    : formatForDisplay(props.value);

  return (
    <div className="space-y-1">
      {props.label && <label className="block text-xs font-medium text-text-secondary">{props.label}</label>}
      <div
        className={cn(
          'flex items-center rounded-input border bg-input font-mono text-right',
          focused && 'border-border-focus ring-1 ring-border-focus',
          !focused && 'border-border',
          props.error && 'border-status-red',
          props.disabled && 'opacity-60 cursor-not-allowed'
        )}
      >
        <span className="pl-3 text-text-secondary">$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={displayValue}
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
