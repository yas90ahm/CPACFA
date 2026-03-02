import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Period end date (ISO YYYY-MM-DD) for a period label.
 * Supports YYYY-MM (last day of month), YYYY-Q1..Q4 (last day of quarter), YYYY/FYyyyy (12-31).
 * Mirrors backend getPeriodEndDate in close_context.
 */
export function getPeriodEndDate(periodLabel: string): string {
  const trimmed = periodLabel.trim();
  const qMatch = trimmed.match(/^(\d{4})[-]?Q([1-4])$/i);
  if (qMatch) {
    const y = parseInt(qMatch[1]!, 10);
    const q = parseInt(qMatch[2]!, 10);
    const lastMonth = q * 3;
    const lastDay = new Date(y, lastMonth, 0).getDate();
    return `${y}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  const mMatch = trimmed.match(/^(\d{4})[-](\d{1,2})$/);
  if (mMatch) {
    const y = parseInt(mMatch[1]!, 10);
    const m = parseInt(mMatch[2]!, 10);
    if (m >= 1 && m <= 12) {
      const lastDay = new Date(y, m, 0).getDate();
      return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }
  const yMatch = trimmed.match(/^FY?(\d{4})$/i) ?? trimmed.match(/^(\d{4})$/);
  if (yMatch) {
    const y = parseInt(yMatch[1]!, 10);
    return `${y}-12-31`;
  }
  return new Date().toISOString().slice(0, 10);
}

/** Derive display name and initials from user fields. */
export function getUserDisplay(user: { name?: string; email?: string } | null | undefined): { displayName: string; initials: string } {
  if (!user) return { displayName: 'User', initials: 'U' };
  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    const initials = parts.length >= 2
      ? (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
      : name.slice(0, 2).toUpperCase();
    return { displayName: name, initials };
  }
  const email = user.email?.trim();
  if (email) {
    const local = email.split('@')[0] ?? '';
    const formatted = local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { displayName: formatted, initials: formatted.slice(0, 2).toUpperCase() };
  }
  return { displayName: 'User', initials: 'U' };
}

/** Period type from label for filter/display. */
export function getPeriodType(periodLabel: string): 'monthly' | 'quarterly' | 'annual' {
  const t = periodLabel.trim();
  if (/^\d{4}-Q[1-4]$/i.test(t)) return 'quarterly';
  if (/^FY?\d{4}$/i.test(t) || /^\d{4}$/.test(t)) return 'annual';
  return 'monthly';
}
