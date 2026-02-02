'use client';

import * as React from 'react';
import { AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EntityVariance } from './types';

export interface VarianceHighlightsProps {
  variances: EntityVariance[];
  /** Threshold in percent (default 15) */
  thresholdPct?: number;
  className?: string;
}

/**
 * Calm design: neutral tones with subtle highlights for +/- 15% off-budget.
 * No bright red/green; use soft amber/slate and light backgrounds.
 */
export function VarianceHighlights({
  variances,
  thresholdPct = 15,
  className,
}: VarianceHighlightsProps) {
  const overThreshold = variances.filter((v) => v.is_over_15);
  const onBudget = variances.filter((v) => !v.is_over_15);

  return (
    <div className={cn('rounded-lg border border-border bg-card text-card-foreground overflow-hidden', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Variance vs. budget</span>
        <span className="text-xs text-muted-foreground">(±{thresholdPct}% highlight)</span>
      </div>
      <div className="p-4 space-y-3">
        {overThreshold.length === 0 && variances.length === 0 && (
          <p className="text-sm text-muted-foreground">No budget variance data. Add actual vs. budget by entity to see highlights.</p>
        )}
        {overThreshold.length === 0 && variances.length > 0 && (
          <p className="text-sm text-muted-foreground">All entities within budget (±{thresholdPct}%).</p>
        )}
        {overThreshold.map((v) => (
          <div
            key={`${v.entity_id}-${v.metric_label}`}
            className={cn(
              'rounded-md border-l-4 py-2 px-3 text-sm',
              v.variance_pct >= thresholdPct
                ? 'bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200'
                : 'bg-slate-50/70 border-slate-300 text-slate-700 dark:bg-slate-900/40 dark:border-slate-600 dark:text-slate-300'
            )}
          >
            <div className="flex items-center gap-2">
              {v.variance_pct >= thresholdPct ? (
                <TrendingUp className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : (
                <TrendingDown className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
              )}
              <span className="font-medium">{v.entity_name}</span>
              <span className="text-muted-foreground">— {v.metric_label}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2 text-xs">
              <span className="tabular-nums">Actual: {formatNum(v.actual)}</span>
              <span className="text-muted-foreground">Budget: {formatNum(v.budget)}</span>
              <span
                className={cn(
                  'tabular-nums font-medium',
                  v.variance_pct >= thresholdPct ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400'
                )}
              >
                {v.variance_pct >= 0 ? '+' : ''}{v.variance_pct.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
        {onBudget.length > 0 && overThreshold.length > 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            {onBudget.length} entity/entities within budget.
          </p>
        )}
      </div>
    </div>
  );
}

function formatNum(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}
