/**
 * Shared period semantics utilities.
 *
 * Convention:
 * - `periodLabel` = "YYYY-MM" string used for GL/TB queries and human display
 * - `periodStart` = "YYYY-MM-01" ISO date string (first day of month)
 * - `periodEnd` = "YYYY-MM-DD" ISO date string (last day of month)
 *
 * All functions are pure, deterministic, and work with strings only.
 */

const PERIOD_LABEL_REGEX = /^(\d{4})-(\d{2})$/;

/**
 * Extract a period label (YYYY-MM) from any date-like string.
 * Handles: "2026-01", "2026-01-31", "2026-01-31T00:00:00Z", ISO dates, etc.
 * Returns null if input is empty/invalid.
 */
export function toPeriodLabel(input: string | null | undefined): string | null {
  const s = (input ?? '').trim();
  if (s.length === 0) return null;
  // Already YYYY-MM
  if (PERIOD_LABEL_REGEX.test(s)) return s;
  // YYYY-MM-DD or longer ISO string
  if (s.length >= 7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  return null;
}

/**
 * Convert a period label (YYYY-MM) to the first day of the month: "YYYY-MM-01".
 * Returns null if input is not a valid YYYY-MM.
 */
export function toPeriodStart(periodLabel: string): string | null {
  const m = (periodLabel ?? '').trim().match(PERIOD_LABEL_REGEX);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

/**
 * Convert a period label (YYYY-MM) to the last day of the month: "YYYY-MM-DD".
 * Returns null if input is not a valid YYYY-MM.
 */
export function toPeriodEnd(periodLabel: string): string | null {
  const m = (periodLabel ?? '').trim().match(PERIOD_LABEL_REGEX);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  return `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Convert a period label (YYYY-MM) to both periodStart and periodEnd.
 * Returns null if input is not a valid YYYY-MM.
 */
export function toPeriodBounds(periodLabel: string): { periodStart: string; periodEnd: string } | null {
  const start = toPeriodStart(periodLabel);
  const end = toPeriodEnd(periodLabel);
  if (!start || !end) return null;
  return { periodStart: start, periodEnd: end };
}

/**
 * Get the prior month's period label. "2026-01" → "2025-12", "2026-03" → "2026-02".
 */
export function priorPeriodLabel(periodLabel: string): string | null {
  const m = (periodLabel ?? '').trim().match(PERIOD_LABEL_REGEX);
  if (!m) return null;
  let year = parseInt(m[1], 10);
  let month = parseInt(m[2], 10);
  month -= 1;
  if (month < 1) { month = 12; year -= 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Check if a date string falls within a period label's month.
 * Works with ISO dates, YYYY-MM-DD, or full timestamps.
 */
export function isDateInPeriod(dateStr: string, periodLabel: string): boolean {
  const label = toPeriodLabel(dateStr);
  return label === periodLabel;
}
