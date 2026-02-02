/**
 * AP/AR aging and open-item pipelines: bucket by due date (0-30, 31-60, 61-90, 90+).
 */

import type { CanonicalApItem, CanonicalArItem } from '../types/canonical_ap_ar_payroll.js';

export interface AgingBucket {
  bucket: '0-30' | '31-60' | '61-90' | '90+';
  daysMin: number;
  daysMax: number;
  amount: number;
  count: number;
  items: (CanonicalApItem | CanonicalArItem)[];
}

export interface ApAgingReport {
  asOfDate: string; // ISO
  totalOpen: number;
  totalOverdue: number;
  buckets: AgingBucket[];
  items: CanonicalApItem[];
  errors: string[];
}

export interface ArAgingReport {
  asOfDate: string;
  totalOpen: number;
  totalOverdue: number;
  buckets: AgingBucket[];
  items: CanonicalArItem[];
  errors: string[];
}

function parseDate(s: string | undefined): number | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

function bucketFromDays(days: number): AgingBucket['bucket'] {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/**
 * Build AP aging report from canonical AP items. Uses dueDate vs asOfDate for bucket.
 */
export function buildApAgingReport(
  items: CanonicalApItem[],
  options: { asOfDate?: string } = {}
): ApAgingReport {
  const asOf = options.asOfDate ? new Date(options.asOfDate).getTime() : Date.now();
  const asOfStr = new Date(asOf).toISOString().slice(0, 10);
  const open = items.filter((i) => i.status === 'open' || i.status === 'overdue' || !i.status);
  const buckets: AgingBucket[] = [
    { bucket: '0-30', daysMin: 0, daysMax: 30, amount: 0, count: 0, items: [] },
    { bucket: '31-60', daysMin: 31, daysMax: 60, amount: 0, count: 0, items: [] },
    { bucket: '61-90', daysMin: 61, daysMax: 90, amount: 0, count: 0, items: [] },
    { bucket: '90+', daysMin: 91, daysMax: 9999, amount: 0, count: 0, items: [] },
  ];
  const bucketMap = new Map(buckets.map((b) => [b.bucket, b]));
  let totalOpen = 0;
  let totalOverdue = 0;

  for (const item of open) {
    const amt = item.amount ?? item.totalAmount ?? 0;
    if (amt <= 0) continue;
    totalOpen += amt;
    const dueMs = parseDate(item.dueDate);
    const days = dueMs != null ? daysBetween(asOf, dueMs) : 0;
    if (days < 0) totalOverdue += amt;
    const b = bucketFromDays(Math.abs(days));
    const bucket = bucketMap.get(b)!;
    bucket.amount += amt;
    bucket.count += 1;
    bucket.items.push(item);
  }

  return {
    asOfDate: asOfStr,
    totalOpen,
    totalOverdue,
    buckets,
    items: open,
    errors: [],
  };
}

/**
 * Build AR aging report from canonical AR items.
 */
export function buildArAgingReport(
  items: CanonicalArItem[],
  options: { asOfDate?: string } = {}
): ArAgingReport {
  const asOf = options.asOfDate ? new Date(options.asOfDate).getTime() : Date.now();
  const asOfStr = new Date(asOf).toISOString().slice(0, 10);
  const open = items.filter((i) => i.status === 'open' || i.status === 'overdue' || !i.status);
  const buckets: AgingBucket[] = [
    { bucket: '0-30', daysMin: 0, daysMax: 30, amount: 0, count: 0, items: [] },
    { bucket: '31-60', daysMin: 31, daysMax: 60, amount: 0, count: 0, items: [] },
    { bucket: '61-90', daysMin: 61, daysMax: 90, amount: 0, count: 0, items: [] },
    { bucket: '90+', daysMin: 91, daysMax: 9999, amount: 0, count: 0, items: [] },
  ];
  const bucketMap = new Map(buckets.map((b) => [b.bucket, b]));
  let totalOpen = 0;
  let totalOverdue = 0;

  for (const item of open) {
    const amt = item.amount ?? item.totalAmount ?? 0;
    if (amt <= 0) continue;
    totalOpen += amt;
    const dueMs = parseDate(item.dueDate);
    const days = dueMs != null ? daysBetween(asOf, dueMs) : 0;
    if (days < 0) totalOverdue += amt;
    const b = bucketFromDays(Math.abs(days));
    const bucket = bucketMap.get(b)!;
    bucket.amount += amt;
    bucket.count += 1;
    bucket.items.push(item);
  }

  return {
    asOfDate: asOfStr,
    totalOpen,
    totalOverdue,
    buckets,
    items: open,
    errors: [],
  };
}
