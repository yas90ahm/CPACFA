'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { BalanceSheetData, EliminationEntryData } from './types';

export interface EliminationToggleProps {
  withEliminations: BalanceSheetData;
  withoutEliminations?: BalanceSheetData;
  eliminationsApplied: EliminationEntryData[];
  reportingCurrency: string;
  className?: string;
}

function formatAmount(value: number | string): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, '')) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function BalanceSheetTable({ data, reportingCurrency }: { data: BalanceSheetData; reportingCurrency: string }) {
  return (
    <div className="text-sm">
      <p className="text-muted-foreground mb-2">Report date: {data.report_date}</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 font-medium">Account</th>
            <th className="text-right py-2 font-medium">Amount ({reportingCurrency})</th>
          </tr>
        </thead>
        <tbody>
          {data.assets?.length > 0 && (
            <>
              <tr className="bg-muted/30">
                <td colSpan={2} className="py-1.5 px-2 font-medium text-muted-foreground">Assets</td>
              </tr>
              {data.assets.map((line, i) => (
                <tr key={`a-${i}`} className="border-b border-border/50">
                  <td className="py-1.5 px-2">{line.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatAmount(line.amount)}</td>
                </tr>
              ))}
              <tr className="font-medium border-b border-border">
                <td className="py-1.5 px-2">Total Assets</td>
                <td className="py-1.5 text-right tabular-nums">{formatAmount(data.total_assets)}</td>
              </tr>
            </>
          )}
          {data.liabilities?.length > 0 && (
            <>
              <tr className="bg-muted/30">
                <td colSpan={2} className="py-1.5 px-2 font-medium text-muted-foreground">Liabilities</td>
              </tr>
              {data.liabilities.map((line, i) => (
                <tr key={`l-${i}`} className="border-b border-border/50">
                  <td className="py-1.5 px-2">{line.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatAmount(line.amount)}</td>
                </tr>
              ))}
              <tr className="font-medium border-b border-border">
                <td className="py-1.5 px-2">Total Liabilities</td>
                <td className="py-1.5 text-right tabular-nums">{formatAmount(data.total_liabilities)}</td>
              </tr>
            </>
          )}
          {data.equity?.length > 0 && (
            <>
              <tr className="bg-muted/30">
                <td colSpan={2} className="py-1.5 px-2 font-medium text-muted-foreground">Equity</td>
              </tr>
              {data.equity.map((line, i) => (
                <tr key={`e-${i}`} className="border-b border-border/50">
                  <td className="py-1.5 px-2">{line.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatAmount(line.amount)}</td>
                </tr>
              ))}
              <tr className="font-medium border-b border-border">
                <td className="py-1.5 px-2">Total Equity</td>
                <td className="py-1.5 text-right tabular-nums">{formatAmount(data.total_equity)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function EliminationToggle(props: EliminationToggleProps) {
  const {
    withEliminations,
    withoutEliminations,
    eliminationsApplied,
    reportingCurrency,
    className,
  } = props;
  const [showAfter, setShowAfter] = React.useState(true);
  const displayData = showAfter ? withEliminations : (withoutEliminations ?? withEliminations);

  return (
    <div className={cn('rounded-lg border border-border bg-card text-card-foreground overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium">Financial statements</span>
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAfter(false)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              !showAfter ? 'bg-muted text-foreground' : 'bg-background text-muted-foreground hover:text-foreground'
            )}
          >
            Before eliminations
          </button>
          <button
            type="button"
            onClick={() => setShowAfter(true)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              showAfter ? 'bg-muted text-foreground' : 'bg-background text-muted-foreground hover:text-foreground'
            )}
          >
            After eliminations
          </button>
        </div>
      </div>
      <ScrollArea className="h-[320px]">
        <div className="p-4">
          <BalanceSheetTable data={displayData} reportingCurrency={reportingCurrency} />
          {showAfter && eliminationsApplied.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Intercompany eliminations applied ({eliminationsApplied.length})
              </p>
              <ul className="space-y-1 text-xs rounded-md bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 p-2">
                {eliminationsApplied.slice(0, 8).map((e, i) => (
                  <li key={i} className="text-amber-900 dark:text-amber-200">
                    {e.entity_debit} / {e.entity_credit}: {e.description} — {formatAmount(e.amount)}
                  </li>
                ))}
                {eliminationsApplied.length > 8 && (
                  <li className="text-muted-foreground">+{eliminationsApplied.length - 8} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
