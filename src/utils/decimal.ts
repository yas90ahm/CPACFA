/**
 * Decimal arithmetic for round-trip checks and last-period sweeps.
 * Limits compounding rounding error; use only in reconciliation/sweep logic,
 * not a full refactor of all calculations.
 */

import Decimal from 'decimal.js';

const DP = 2; // 2 decimal places for currency

/**
 * Create a Decimal from a number or string (prefer string to avoid float loss).
 */
export function from(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

/**
 * Sum an array of numbers using decimal arithmetic, then round to 2 dp.
 */
export function sumRound2(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc.plus(v), new Decimal(0)).toDecimalPlaces(DP).toNumber();
}

/**
 * a - b with 2 decimal places.
 */
export function minus(a: number | string, b: number | string): number {
  return from(a).minus(b).toDecimalPlaces(DP).toNumber();
}

/**
 * a + b with 2 decimal places.
 */
export function plus(a: number | string, b: number | string): number {
  return from(a).plus(b).toDecimalPlaces(DP).toNumber();
}

/**
 * a * b with 2 decimal places.
 */
export function mul(a: number | string, b: number | string): number {
  return from(a).times(b).toDecimalPlaces(DP).toNumber();
}

/**
 * a / b with 2 decimal places (division for allocations).
 */
export function div(a: number | string, b: number | string): number {
  const d = from(a).dividedBy(b);
  return (Number.isFinite(d.toNumber()) ? d : from(0)).toDecimalPlaces(DP).toNumber();
}

/**
 * Round to 2 decimal places (for persistence/display).
 */
export function round2(value: number | string): number {
  return from(value).toDecimalPlaces(DP).toNumber();
}

/**
 * Round to 4 decimal places (e.g. WACC, IRR, ratios).
 */
export function round4(value: number | string): number {
  return from(value).toDecimalPlaces(4).toNumber();
}

/**
 * Compare |a - b| > tolerance using decimal arithmetic.
 */
export function absGt(a: number | string, b: number | string, tolerance: number): boolean {
  return from(a).minus(b).abs().greaterThan(tolerance);
}

/**
 * Compare |a - b| < tolerance (within tolerance).
 */
export function absLt(a: number | string, b: number | string, tolerance: number): boolean {
  return from(a).minus(b).abs().lessThanOrEqualTo(tolerance);
}
