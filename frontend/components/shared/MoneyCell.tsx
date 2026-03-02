'use client';

import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/money';

export interface MoneyCellProps {
  /** Money value as string from backend, or legacy number. Never compute with this. */
  value: string | number | null | undefined;
  showDollar?: boolean;
  className?: string;
}

export function MoneyCell(p: MoneyCellProps) {
  const text = fmtMoney(p.value, { dollar: p.showDollar ?? false });
  return (
    <span className={cn('font-mono text-right tabular-nums block', p.className)} data-currency>
      {text}
    </span>
  );
}
