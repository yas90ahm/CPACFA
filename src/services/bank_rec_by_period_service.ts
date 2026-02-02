/**
 * FW3: Period-based bank rec — store bank rec result by period; list by period.
 */

import type { BankRecResult } from './bank_reconciliation_service.js';

export interface BankRecByPeriod {
  id: string;
  periodLabel: string;
  result: BankRecResult;
  createdAt: string;
  /** Optional: opening rec from prior period (reference) */
  priorPeriodRecId?: string;
}

const store = new Map<string, BankRecByPeriod>();

function nextId(): string {
  return `bankrec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function storeBankRecByPeriod(params: {
  periodLabel: string;
  result: BankRecResult;
  priorPeriodRecId?: string;
}): BankRecByPeriod {
  const id = nextId();
  const now = new Date().toISOString();
  const entry: BankRecByPeriod = {
    id,
    periodLabel: params.periodLabel,
    result: params.result,
    createdAt: now,
    priorPeriodRecId: params.priorPeriodRecId,
  };
  store.set(id, entry);
  return { ...entry };
}

export function listBankRecByPeriod(params?: { periodLabel?: string; limit?: number }): BankRecByPeriod[] {
  let list = Array.from(store.values());
  if (params?.periodLabel) list = list.filter((r) => r.periodLabel === params.periodLabel);
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = params?.limit ?? 50;
  return list.slice(0, limit).map((r) => ({ ...r }));
}

export function getBankRecByPeriod(id: string): BankRecByPeriod | undefined {
  const r = store.get(id);
  return r ? { ...r } : undefined;
}
