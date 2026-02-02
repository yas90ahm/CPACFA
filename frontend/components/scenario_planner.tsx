'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  runScenarioAnalysis,
  type CFOFinancialSnapshot,
  type ScenarioKPIs,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { Beaker } from 'lucide-react';

export interface ScenarioParams {
  revenueChangePercent: number;
  newEmployeeCount: number;
  newEmployeeSalary: number;
}

const DEFAULT_PARAMS: ScenarioParams = {
  revenueChangePercent: 0,
  newEmployeeCount: 0,
  newEmployeeSalary: 70_000,
};

const DEFAULT_SNAPSHOT: CFOFinancialSnapshot = {
  revenue: 4_500_000,
  costOfGoodsSold: 1_350_000,
  operatingExpenses: 2_250_000,
  operatingIncome: 900_000,
  netIncome: 675_000,
  totalAssets: 8_000_000,
  totalLiabilities: 3_000_000,
  totalEquity: 5_000_000,
  cash: 1_200_000,
  currentAssets: 2_500_000,
  currentLiabilities: 1_200_000,
  inventory: 400_000,
  accountsReceivable: 600_000,
  accountsPayable: 350_000,
  priorRevenue: 4_100_000,
  priorNetIncome: 580_000,
  periodLabel: 'Q4 FY25',
};

export function StrategicSandbox({
  snapshot: snapshotProp,
  onScenarioUpdate,
  className,
}: {
  snapshot?: CFOFinancialSnapshot | null;
  onScenarioUpdate: (kpis: ScenarioKPIs | null) => void;
  className?: string;
}) {
  const snapshot = snapshotProp ?? DEFAULT_SNAPSHOT;
  const [params, setParams] = React.useState<ScenarioParams>(DEFAULT_PARAMS);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const runAnalysis = React.useCallback(
    async (next: ScenarioParams) => {
      setLoading(true);
      setError(null);
      try {
        const { kpis } = await runScenarioAnalysis(snapshot, {
          revenueChangePercent: next.revenueChangePercent,
          newEmployeeCount: next.newEmployeeCount,
          newEmployeeSalary: next.newEmployeeSalary,
        });
        onScenarioUpdate(kpis);
      } catch (e) {
        onScenarioUpdate(null);
        setError(e instanceof Error ? e.message : 'Scenario analysis failed');
      } finally {
        setLoading(false);
      }
    },
    [snapshot, onScenarioUpdate]
  );

  const applyParams = React.useCallback(
    (next: Partial<ScenarioParams>) => {
      const nextParams = { ...params, ...next };
      setParams(nextParams);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const isBase =
        nextParams.revenueChangePercent === 0 && nextParams.newEmployeeCount === 0;
      if (isBase) {
        onScenarioUpdate(null);
        return;
      }
      debounceRef.current = setTimeout(() => runAnalysis(nextParams), 280);
    },
    [params, runAnalysis, onScenarioUpdate]
  );

  React.useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const revenueLabel =
    params.revenueChangePercent === 0
      ? 'No change'
      : params.revenueChangePercent > 0
        ? `+${params.revenueChangePercent}%`
        : `${params.revenueChangePercent}%`;

  return (
    <Card className={cn('overflow-hidden rounded-md border border-border shadow-calm', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Beaker className="h-4 w-4" />
          </div>
          What if?
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal mt-1">
          Runway &amp; break-even with revenue and headcount changes.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            What if my revenue drops by 20%?
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={-40}
              max={20}
              step={5}
              value={params.revenueChangePercent}
              onChange={(e) =>
                applyParams({ revenueChangePercent: Number(e.target.value) })
              }
              className="flex-1 h-2 rounded-full appearance-none bg-muted accent-primary"
            />
            <span className="text-xs tabular-nums w-10 text-right">{revenueLabel}</span>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            What if I hire new employees?
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={5}
              step={1}
              value={params.newEmployeeCount}
              onChange={(e) =>
                applyParams({ newEmployeeCount: Number(e.target.value) })
              }
              className="flex-1 h-2 rounded-full appearance-none bg-muted accent-primary"
            />
            <span className="text-xs tabular-nums w-6 text-right">{params.newEmployeeCount}</span>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Salary per employee ($k)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={40}
              max={120}
              step={5}
              value={params.newEmployeeSalary / 1000}
              onChange={(e) =>
                applyParams({
                  newEmployeeSalary: Number(e.target.value) * 1000,
                })
              }
              className="flex-1 h-2 rounded-full appearance-none bg-muted accent-primary"
            />
            <span className="text-xs tabular-nums w-10 text-right">
              ${(params.newEmployeeSalary / 1000).toFixed(0)}k
            </span>
          </div>
        </div>

        {loading && (
          <p className="text-xs text-muted-foreground">Recalculating…</p>
        )}
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        {(params.revenueChangePercent !== 0 || params.newEmployeeCount > 0) && !loading && !error && (
          <p className="text-xs text-muted-foreground">
            Dashboard shows scenario Runway &amp; Break-even.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
