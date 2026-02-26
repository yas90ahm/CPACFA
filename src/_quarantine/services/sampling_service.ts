/**
 * Sampling: random or risk-based selection for audit populations.
 */

import type { SamplingInput, SamplingResult } from '../types/audit_evidence.js';

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function runSampling(input: SamplingInput): SamplingResult {
  const { population, items, method, sampleSize } = input;
  const n = Math.min(sampleSize, items.length);
  let selected: typeof items;

  if (method === 'random') {
    selected = shuffle(items).slice(0, n);
  } else if (method === 'risk_based') {
    const sorted = [...items].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    selected = sorted.slice(0, n);
  } else {
    const sorted = [...items].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    const hi = sorted.slice(0, Math.ceil(n / 2));
    const lo = sorted.slice(-Math.floor(n / 2));
    selected = [...hi, ...lo];
  }

  return {
    population,
    method,
    sampleSize: n,
    selectedIds: selected.map((i) => i.id),
    selectedItems: selected,
    periodLabel: input.periodLabel,
    materialityThreshold: input.materialityThreshold,
    populationCount: input.populationCount ?? items.length,
  };
}
