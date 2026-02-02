'use client';

import * as React from 'react';
import { ChevronRight, ChevronDown, Building2, Globe, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SubsidiaryEntity, EntityVariance } from './types';

export interface EntityMapProps {
  /** Parent (reporting) entity — optional; shown at top */
  parentName?: string;
  reportingCurrency: string;
  subsidiaries: SubsidiaryEntity[];
  /** Optional: highlight entity by id */
  highlightedEntityId?: string;
  /** Optional: variances for +/- 15% off-budget; show Risk Red pulse next to entity */
  variances?: EntityVariance[];
  /** Optional: click entity to open side-drawer (quick-view) */
  onEntityClick?: (entity: SubsidiaryEntity) => void;
  className?: string;
}

function formatCurrencyCode(code: string): string {
  return (code || 'USD').toUpperCase();
}

export function EntityMap({
  parentName,
  reportingCurrency,
  subsidiaries,
  highlightedEntityId,
  variances = [],
  onEntityClick,
  className,
}: EntityMapProps) {
  const [expanded, setExpanded] = React.useState(true);
  const hasParent = Boolean(parentName);

  const byParent = React.useMemo(() => {
    const map = new Map<string | undefined, SubsidiaryEntity[]>();
    for (const s of subsidiaries) {
      const key = s.parent_id ?? undefined;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [subsidiaries]);

  const varianceByEntity = React.useMemo(() => {
    const set = new Set<string>();
    variances.filter((v) => v.is_over_15).forEach((v) => set.add(v.entity_id));
    return set;
  }, [variances]);

  const rootSubs = byParent.get(undefined) ?? subsidiaries;

  return (
    <div className={cn('rounded-lg border border-border bg-card text-card-foreground overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1">Entity Map</span>
        <span className="text-xs text-muted-foreground font-normal">
          {formatCurrencyCode(reportingCurrency)} reporting
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-1">
          {hasParent && (
            <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/40 text-sm font-medium">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{parentName}</span>
              <span className="text-xs text-muted-foreground">(Consolidated — {formatCurrencyCode(reportingCurrency)})</span>
            </div>
          )}
          <ul className="space-y-0.5">
            {rootSubs.map((sub) => {
              const hasVarianceFlag = varianceByEntity.has(sub.entity_id);
              const isClickable = Boolean(onEntityClick);
              return (
                <li key={sub.entity_id} className="flex items-center gap-2 py-2 px-3 rounded-md">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <button
                    type="button"
                    onClick={() => onEntityClick?.(sub)}
                    className={cn(
                      'flex items-center gap-2 flex-1 text-left min-w-0',
                      isClickable && 'hover:bg-muted/50 rounded cursor-pointer'
                    )}
                    disabled={!isClickable}
                  >
                    <span
                      className={cn(
                        'text-sm truncate',
                        highlightedEntityId === sub.entity_id && 'font-medium text-foreground'
                      )}
                    >
                      {sub.entity_name}
                    </span>
                    {hasVarianceFlag && (
                      <span
                        className="h-2 w-2 rounded-full bg-risk-red shrink-0 animate-pulse"
                        title="±15% off-budget"
                        aria-hidden
                      />
                    )}
                  </button>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded font-mono shrink-0',
                      sub.functional_currency !== reportingCurrency
                        ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {formatCurrencyCode(sub.functional_currency)}
                  </span>
                </li>
              );
            })}
          </ul>
          {subsidiaries.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No subsidiaries loaded.</p>
          )}
        </div>
      )}
    </div>
  );
}
