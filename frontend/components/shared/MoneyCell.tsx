'use client';

import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

export interface MoneyCellProps {
  value: number;
  showDollar?: boolean;
  className?: string;
}

export function MoneyCell(p: MoneyCellProps) {
  const text = formatMoney(p.value, { showDollar: p.showDollar ?? false });
  return (
    <span className={cn('font-mono text-right tabular-nums block', p.className)} data-currency>
      {text}
    </span>
  );
}
