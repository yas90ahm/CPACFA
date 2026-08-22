/** Presentation helpers for governed-close UI. These never transform accounting values. */
export function humanizeCloseValue(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatCloseDateTime(value?: string): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function shortCloseId(value?: string): string {
  return value ? `${value.slice(0, 8)}…` : '—';
}
