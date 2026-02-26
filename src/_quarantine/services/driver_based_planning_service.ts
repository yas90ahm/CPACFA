/**
 * Driver-based planning: revenue/expense from drivers (headcount, price, volume).
 */

import type { DriverInput, DriverBasedPlanInput, DriverBasedPlanResult } from '../types/budget_forecast.js';

/**
 * Evaluate a simple formula string with driver values: e.g. "headcount * 120000", "volume * price".
 */
function evalFormula(formula: string, driverValues: Record<string, number>): number {
  let expr = formula;
  for (const [name, val] of Object.entries(driverValues)) {
    expr = expr.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), String(val));
  }
  try {
    return Function(`"use strict"; return (${expr})`)();
  } catch {
    return 0;
  }
}

export function buildDriverBasedPlan(input: DriverBasedPlanInput): DriverBasedPlanResult {
  const driverValues: Record<string, number> = {};
  for (const d of input.drivers) {
    driverValues[d.id] = d.value;
    driverValues[d.name] = d.value;
  }
  const periodLabel = input.periodLabel ?? 'Current';
  const lines: { label: string; amount: number; source: string }[] = [];
  for (const [label, formula] of Object.entries(input.formulas)) {
    const amount = evalFormula(formula, driverValues);
    lines.push({ label, amount, source: formula });
  }
  return {
    periodLabel,
    lines,
    driverValues: Object.fromEntries(input.drivers.map((d) => [d.id, d.value])),
  };
}
