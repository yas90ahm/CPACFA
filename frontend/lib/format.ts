import { fmtMoney } from './money';

/**
 * Format financial amounts for display.
 * Accepts string (preferred) or number (legacy compatibility).
 */
export function formatMoney(value: string | number | null | undefined, options: { showDollar?: boolean } = {}): string {
  return fmtMoney(value, { dollar: options.showDollar ?? false });
}

/**
 * Parse user-typed money input string to a clean numeric string.
 * Used ONLY for user-input handling (MoneyInput blur formatting).
 * NOT for API response processing — those are already Decimal strings.
 */
export function parseMoney(s: string | null): number {
  if (s == null || s.trim() === '') return 0;
  const stripped = s.replace(/,/g, '').replace(/\(\)/g, '').trim();
  if (stripped === '' || stripped === '-') return 0;
  const negative = stripped.startsWith('(') || stripped.startsWith('-');
  const digits = stripped.replace(/^[(\-]/, '').replace(/[)]$/, '');
  const n = parseFloat(digits);
  if (Number.isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

/**
 * Parse user-typed money input to a clean Decimal string.
 * Returns "0.00" for empty/invalid input.
 */
export function parseMoneyStr(s: string | null): string {
  if (s == null || s.trim() === '') return '0.00';
  const stripped = s.replace(/[$,]/g, '').trim();
  const negative = stripped.startsWith('(') || stripped.startsWith('-');
  const digits = stripped.replace(/^[(\-$]/, '').replace(/[)]$/, '');
  const n = parseFloat(digits);
  if (Number.isNaN(n)) return '0.00';
  const abs = Math.abs(n).toFixed(2);
  return negative ? `-${abs}` : abs;
}

/** Format number to display string (commas, 2 decimals). For money input on blur. */
export function formatMoneyString(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `(${formatted})` : formatted;
}
