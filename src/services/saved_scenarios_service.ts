/**
 * FW4: Saved scenarios (Base, Upside, Downside) — store and compare side-by-side.
 */

import type { SavedScenario, CFOFinancialSnapshot, CFOKPIs } from '../types/cfo-dashboard.js';

const store = new Map<string, SavedScenario>();

function nextId(): string {
  return `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function saveScenario(params: {
  name: string;
  periodLabel: string;
  snapshot: CFOFinancialSnapshot;
  kpis?: CFOKPIs;
  sensitivityResult?: unknown;
}): SavedScenario {
  const id = nextId();
  const now = new Date().toISOString();
  const scenario: SavedScenario = {
    id,
    name: params.name,
    periodLabel: params.periodLabel,
    snapshot: params.snapshot,
    kpis: params.kpis,
    sensitivityResult: params.sensitivityResult,
    createdAt: now,
  };
  store.set(id, scenario);
  return { ...scenario };
}

export function listScenarios(params?: { periodLabel?: string; limit?: number }): SavedScenario[] {
  let list = Array.from(store.values());
  if (params?.periodLabel) list = list.filter((s) => s.periodLabel === params.periodLabel);
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = params?.limit ?? 50;
  return list.slice(0, limit).map((s) => ({ ...s }));
}

export function getScenario(id: string): SavedScenario | undefined {
  const s = store.get(id);
  return s ? { ...s } : undefined;
}

/** Compare multiple scenarios side-by-side (by ids) */
export function compareScenarios(ids: string[]): SavedScenario[] {
  const result: SavedScenario[] = [];
  for (const id of ids) {
    const s = store.get(id);
    if (s) result.push({ ...s });
  }
  return result;
}
