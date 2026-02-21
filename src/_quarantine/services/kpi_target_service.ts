/**
 * FW2: KPI targets (e.g. runway 18 months, DSO 45 days) for variance-to-target in KPI response.
 */

import type { CFOKPIs, KPITarget } from '../types/cfo-dashboard.js';

const store = new Map<string, KPITarget>();

function nextId(): string {
  return `kpit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface SetKPITargetInput {
  metric: KPITarget['metric'];
  targetValue: number;
  unit?: string;
  label?: string;
}

export function setKPITarget(input: SetKPITargetInput): KPITarget {
  const id = nextId();
  const now = new Date().toISOString();
  const target: KPITarget = {
    id,
    metric: input.metric,
    targetValue: input.targetValue,
    unit: input.unit,
    label: input.label,
    createdAt: now,
  };
  store.set(id, target);
  return { ...target };
}

export function listKPITargets(): KPITarget[] {
  return Array.from(store.values()).map((t) => ({ ...t }));
}

export function getKPITarget(id: string): KPITarget | undefined {
  const t = store.get(id);
  return t ? { ...t } : undefined;
}

/** Variance to target for each metric that has a target. */
export interface KPIVarianceToTarget {
  metric: string;
  actual: number;
  target: number;
  variance: number; // actual - target
  variancePercent?: number;
  unit?: string;
}

export function computeVarianceToTarget(kpis: CFOKPIs, targets: KPITarget[]): KPIVarianceToTarget[] {
  const result: KPIVarianceToTarget[] = [];
  for (const t of targets) {
    let actual: number | undefined;
    switch (t.metric) {
      case 'runwayMonths':
        actual = kpis.runwayMonths;
        break;
      case 'daysSalesOutstanding':
        actual = kpis.daysSalesOutstanding;
        break;
      case 'daysPayablesOutstanding':
        actual = kpis.daysPayablesOutstanding;
        break;
      case 'ruleOf40':
        actual = kpis.ruleOf40;
        break;
      case 'netMarginPercent':
        actual = kpis.netMarginPercent;
        break;
      default:
        continue;
    }
    if (actual == null) continue;
    const variance = actual - t.targetValue;
    const variancePercent = t.targetValue !== 0 ? (variance / Math.abs(t.targetValue)) * 100 : undefined;
    result.push({
      metric: t.metric,
      actual,
      target: t.targetValue,
      variance,
      variancePercent,
      unit: t.unit,
    });
  }
  return result;
}
