/**
 * Lightweight usage log: who ran what report when (adoption visibility).
 */

import type { UsageLogEntry } from '../types/access_usage.js';

const log: UsageLogEntry[] = [];
const MAX_ENTRIES = 10_000;

function uuid(): string {
  return `usage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function appendUsageLog(params: {
  userId?: string;
  tenantId?: string;
  reportKey: string;
  action?: string;
}): UsageLogEntry {
  const entry: UsageLogEntry = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    userId: params.userId,
    tenantId: params.tenantId,
    reportKey: params.reportKey,
    action: params.action ?? 'view',
  };
  log.push(entry);
  if (log.length > MAX_ENTRIES) log.shift();
  return entry;
}

export function queryUsageLog(params?: {
  userId?: string;
  tenantId?: string;
  reportKey?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): UsageLogEntry[] {
  let list = [...log];
  if (params?.userId) list = list.filter((e) => e.userId === params.userId);
  if (params?.tenantId) list = list.filter((e) => e.tenantId === params.tenantId);
  if (params?.reportKey) list = list.filter((e) => e.reportKey === params.reportKey);
  if (params?.fromDate) list = list.filter((e) => e.timestamp >= params.fromDate!);
  if (params?.toDate) list = list.filter((e) => e.timestamp <= params.toDate!);
  list.reverse();
  const limit = params?.limit ?? 100;
  return list.slice(0, limit);
}
