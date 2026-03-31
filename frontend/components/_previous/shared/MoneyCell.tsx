'use client';

import { cn } from '@/lib/utils';
import { fmtMoney, isMoneyZero, isMoneyNegative } from '@/lib/money';

export type MoneyCellVariant = 'line-item' | 'subtotal' | 'total' | 'grand-total';

export interface MoneyCellProps {
  /** Money value as string from backend, or legacy number. Never compute with this. */
  value: string | number | null | undefined;
  variant?: MoneyCellVariant;
  /** @deprecated Use showCurrency instead */
  showDollar?: boolean;
  showCurrency?: boolean;
  comparisonValue?: string | number;
  showVariance?: boolean;
  zeroDisplay?: 'dash' | 'zero';
  locked?: boolean;
  className?: string;
}

function computeVariance(current: string | number | null | undefined, prior: string | number | null | undefined): { amount: string; pct: string; favorable: boolean } | null {
  if (current == null || prior == null) return null;
  const cRaw = String(current);
  const pRaw = String(prior);
  const cStr = cRaw.replace(/[$,()]/g, '').replace('-', '');
  const pStr = pRaw.replace(/[$,()]/g, '').replace('-', '');
  const cNeg = isMoneyNegative(cRaw);
  const pNeg = isMoneyNegative(pRaw);
  // Use parseFloat only for variance display — not financial computation
  const c = parseFloat(cStr) * (cNeg ? -1 : 1);
  const p = parseFloat(pStr) * (pNeg ? -1 : 1);
  if (!isFinite(c) || !isFinite(p)) return null;
  const diff = c - p;
  const pct = p !== 0 ? ((diff / Math.abs(p)) * 100) : 0;
  return {
    amount: diff.toFixed(2),
    pct: pct.toFixed(1),
    favorable: diff >= 0,
  };
}

export function MoneyCell(p: MoneyCellProps) {
  const variant = p.variant ?? 'line-item';
  const showCurrency = p.showCurrency ?? p.showDollar ?? false;
  const zeroDisplay = p.zeroDisplay ?? 'dash';

  const isDash = zeroDisplay === 'dash';
  const text = fmtMoney(p.value, { dollar: showCurrency, dash: isDash });
  const valStr = p.value == null ? undefined : String(p.value);
  const isZero = isMoneyZero(valStr);
  const isNeg = isMoneyNegative(valStr);
  const isNull = p.value == null || String(p.value) === '' || String(p.value) === 'null' || String(p.value) === 'undefined';
  const showAsDash = isNull || (isZero && isDash);

  const variance = p.showVariance && p.comparisonValue != null
    ? computeVariance(p.value, p.comparisonValue)
    : null;

  return (
    <span
      className={cn(
        'text-right block',
        'tabular-nums',
        // Variant styles
        variant === 'line-item' && 'text-[0.8125rem] font-normal leading-[1.385]',
        variant === 'subtotal' && 'text-[0.8125rem] font-semibold leading-[1.385]',
        variant === 'total' && 'text-[0.875rem] font-bold leading-[1.385]',
        variant === 'grand-total' && 'text-[0.875rem] font-bold leading-[1.385]',
        // Color
        showAsDash && 'text-[var(--text-tertiary)]',
        !showAsDash && isNeg && 'text-[var(--text-number-negative)]',
        !showAsDash && !isNeg && variant === 'total' && 'text-[var(--text-number-total)]',
        !showAsDash && !isNeg && variant === 'grand-total' && 'text-[var(--text-number-total)]',
        // Locked
        p.locked && 'bg-[var(--bg-certified)]',
        p.className
      )}
      style={{
        fontVariantNumeric: 'tabular-nums lining-nums',
        letterSpacing: '0.01em',
      }}
      data-currency
    >
      <span
        className={cn(
          variant === 'grand-total' && 'border-total-double pb-[3px]'
        )}
      >
        {text}
      </span>
      {variance && (
        <span
          className={cn(
            'block text-[0.6875rem] leading-[1.3] mt-0.5',
            variance.favorable ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'
          )}
        >
          {fmtMoney(variance.amount, { dollar: false, dash: false })} ({variance.pct}%)
        </span>
      )}
    </span>
  );
}
