/**
 * Format financial amounts for display.
 * Zero = "—", negative = parentheses, comma + 2 decimals, optional $.
 */
export function formatMoney(value: number, options: { showDollar?: boolean } = {}): string {
  const { showDollar = false } = options;
  if (value === 0) return '—';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const withSign = value < 0 ? `(${formatted})` : formatted;
  if (showDollar) return value < 0 ? `$(${formatted})` : `$${formatted}`;
  return withSign;
}

/** Parse string to number (for money input). Strips commas and optional minus. */
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

/** Format number to display string (commas, 2 decimals). For money input on blur. */
export function formatMoneyString(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `(${formatted})` : formatted;
}
