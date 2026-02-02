'use client';

import * as React from 'react';
import { Globe, X, Building2, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EntityMap } from './entity-map';
import { EliminationToggle } from './elimination-toggle';
import { VarianceHighlights } from './variance-highlights';
import type {
  SubsidiaryEntity,
  ConsolidationResultData,
  BalanceSheetData,
  EntityVariance,
} from './types';

export interface GlobalControllerViewProps {
  /** Parent/consolidated entity name */
  parentName?: string;
  /** Reporting currency (e.g. USD) */
  reportingCurrency: string;
  /** Subsidiaries for Entity Map */
  subsidiaries: SubsidiaryEntity[];
  /** Consolidation result WITH eliminations (after) */
  consolidationWithEliminations: ConsolidationResultData;
  /** Optional: consolidation BEFORE eliminations for Before/After toggle */
  consolidationWithoutEliminations?: ConsolidationResultData;
  /** Optional: entity actual vs budget for variance highlights (+/- 15%) */
  variances?: EntityVariance[];
  varianceThresholdPct?: number;
  /** Optional: highlight entity in map */
  highlightedEntityId?: string;
  className?: string;
}

/**
 * Global Controller view: Entity Map, Before/After Elimination Toggle, Variance Highlights.
 * Calm design: neutral tones with subtle highlights for off-budget entities.
 */
export function GlobalControllerView({
  parentName,
  reportingCurrency,
  subsidiaries,
  consolidationWithEliminations,
  consolidationWithoutEliminations,
  variances = [],
  varianceThresholdPct = 15,
  highlightedEntityId,
  className,
}: GlobalControllerViewProps) {
  const [selectedEntity, setSelectedEntity] = React.useState<SubsidiaryEntity | null>(null);
  const bsWith = consolidationWithEliminations.consolidated_balance_sheet;
  const bsWithout = consolidationWithoutEliminations?.consolidated_balance_sheet ?? bsWith;

  return (
    <div className={cn('space-y-4 relative', className)}>
      <header className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Globe className="h-5 w-5 text-muted-foreground" />
        Global Controller
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Entity Map — tree / subsidiaries + reporting currencies */}
        <section className="lg:col-span-1">
          <EntityMap
            parentName={parentName}
            reportingCurrency={reportingCurrency}
            subsidiaries={subsidiaries}
            highlightedEntityId={highlightedEntityId ?? selectedEntity?.entity_id}
            variances={variances}
            onEntityClick={setSelectedEntity}
          />
        </section>

        {/* Elimination Toggle — Before/After financial statements */}
        <section className="lg:col-span-2">
          <EliminationToggle
            withEliminations={bsWith}
            withoutEliminations={bsWithout}
            eliminationsApplied={consolidationWithEliminations.eliminations_applied ?? []}
            reportingCurrency={reportingCurrency}
          />
        </section>
      </div>

      {/* Variance Highlights — +/- 15% off-budget, calm design */}
      {variances.length > 0 && (
        <section>
          <VarianceHighlights
            variances={variances}
            thresholdPct={varianceThresholdPct}
          />
        </section>
      )}

      {/* Quick-View side-drawer: entity P&L + Sync Status */}
      {selectedEntity && (
        <div
          className="fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-card border-l border-border shadow-calm flex flex-col"
          role="dialog"
          aria-label={`Quick-view: ${selectedEntity.entity_name}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium text-sm">{selectedEntity.entity_name}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {selectedEntity.functional_currency}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedEntity(null)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-audit-green shrink-0" />
              <span className="text-sm font-medium">Sync Status</span>
              <span className="text-xs text-muted-foreground">Synced with master ledger</span>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">P&L (sample)</p>
              <p className="text-sm text-muted-foreground">
                Load consolidation data to see this subsidiary&apos;s P&L here.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
