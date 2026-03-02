/**
 * Money values are STRINGS throughout the frontend.
 * They arrive from the API as strings (Decimal.js serialized).
 * They display as strings. They NEVER become JavaScript Numbers
 * for financial computation.
 *
 * All arithmetic happens on the backend using Decimal.js + PostgreSQL NUMERIC(20,2).
 * The frontend only formats and displays.
 */

/**
 * Format a money string for GAAP display: "1234567.89" → "1,234,567.89"
 * Negative amounts shown in parentheses: "-1234.56" → "(1,234.56)"
 * Optionally prefix with "$".
 */
export function fmtMoney(
  value: string | number | null | undefined,
  opts: { dollar?: boolean; dash?: boolean } = {}
): string {
  const { dollar = false, dash = true } = opts;

  // Normalize to string
  const raw = value == null ? '' : String(value);
  if (raw === '' || raw === 'null' || raw === 'undefined') {
    return dash ? '—' : dollar ? '$0.00' : '0.00';
  }

  // Strip any existing formatting ($, commas, parens)
  let clean = raw.replace(/[$,]/g, '');
  const isParens = clean.startsWith('(') && clean.endsWith(')');
  if (isParens) clean = '-' + clean.slice(1, -1);

  // Split into integer and decimal parts — pure string manipulation, no Number()
  const isNegative = clean.startsWith('-');
  const abs = isNegative ? clean.slice(1) : clean;

  const dotIdx = abs.indexOf('.');
  const intPart = dotIdx >= 0 ? abs.slice(0, dotIdx) : abs;
  const rawDec = dotIdx >= 0 ? abs.slice(dotIdx + 1) : '';
  const decPart = (rawDec + '00').slice(0, 2); // Always 2 decimal places

  // Zero check (for the dash display)
  if (dash && intPart.replace(/^0+/, '') === '' && decPart === '00') {
    return '—';
  }

  // Add commas to integer part
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const formatted = `${withCommas}.${decPart}`;

  if (isNegative) {
    return dollar ? `$(${formatted})` : `(${formatted})`;
  }
  return dollar ? `$${formatted}` : formatted;
}

/**
 * Compare two money strings for UI sorting only.
 * Uses parseFloat — acceptable for ordering, NOT for financial computation.
 */
export function cmpMoney(a: string | null | undefined, b: string | null | undefined): number {
  const aNum = parseFloat(String(a ?? '0').replace(/[$,()]/g, '') || '0');
  const bNum = parseFloat(String(b ?? '0').replace(/[$,()]/g, '') || '0');
  return aNum - bNum;
}

/**
 * Check if a money string represents zero. For UI display decisions only.
 */
export function isMoneyZero(value: string | null | undefined): boolean {
  if (!value) return true;
  const clean = String(value).replace(/[$,()]/g, '').trim();
  return clean === '' || clean === '0' || clean === '0.00' || clean === '-0' || clean === '-0.00';
}

/**
 * Check if money string is negative. For UI display decisions only.
 */
export function isMoneyNegative(value: string | null | undefined): boolean {
  if (!value) return false;
  const clean = String(value).replace(/[$,]/g, '').trim();
  return clean.startsWith('-') || (clean.startsWith('(') && clean.endsWith(')'));
}

/**
 * Get absolute value of a money string (for comparisons). Returns float.
 * ONLY for UI comparison/sorting — NOT for financial arithmetic.
 */
export function moneyAbs(value: string | null | undefined): number {
  if (!value) return 0;
  const clean = String(value).replace(/[$,()]/g, '').replace('-', '').trim();
  return parseFloat(clean) || 0;
}

/**
 * Sum an array of money strings for DISPLAY ONLY.
 * Uses parseFloat internally — acceptable because this is visual-only,
 * never compared against backend values for financial decisions.
 * Returns a string with 2 decimal places.
 */
export function sumMoneyStrings(values: (string | null | undefined)[]): string {
  let total = 0;
  for (const v of values) {
    if (v) {
      const clean = String(v).replace(/[$,()]/g, '').trim();
      const n = parseFloat(clean);
      if (isFinite(n)) total += n;
    }
  }
  return total.toFixed(2);
}

/**
 * Coerce value from API to money string.
 * If already a string, pass through. If number (legacy), convert to string with 2 decimals.
 */
export function toMoneyString(value: unknown): string {
  if (value == null) return '0.00';
  if (typeof value === 'string') {
    const clean = value.replace(/[$,]/g, '').trim();
    if (clean === '' || clean === 'null' || clean === 'undefined') return '0.00';
    return clean;
  }
  if (typeof value === 'number') {
    if (!isFinite(value)) return '0.00';
    return value.toFixed(2);
  }
  return String(value);
}
