/**
 * Financial Memory — Tier 2 (Firm): Chart of Accounts, historical policies, invoice treatments.
 */

import type {
  ChartOfAccountsLine,
  HistoricalPolicy,
  InvoiceTreatment,
  MemoryEntry,
} from '../types.js';

const coaStore: ChartOfAccountsLine[] = [];
const policyStore: HistoricalPolicy[] = [];
const invoiceTreatmentStore: InvoiceTreatment[] = [];

/** Add or replace Chart of Accounts (e.g. bulk load). */
export function setChartOfAccounts(lines: ChartOfAccountsLine[]): void {
  coaStore.length = 0;
  coaStore.push(...lines);
}

/** Get full Chart of Accounts. */
export function getChartOfAccounts(): ChartOfAccountsLine[] {
  return [...coaStore];
}

/** Add a historical policy. */
export function addHistoricalPolicy(policy: HistoricalPolicy): void {
  policyStore.push(policy);
}

/** Get all historical policies. */
export function getHistoricalPolicies(): HistoricalPolicy[] {
  return [...policyStore];
}

/** Record how an invoice was treated (for consistency of reporting). */
export function recordInvoiceTreatment(treatment: Omit<InvoiceTreatment, 'id' | 'storedAt'>): InvoiceTreatment {
  const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const storedAt = new Date().toISOString();
  const record: InvoiceTreatment = { ...treatment, id, storedAt };
  invoiceTreatmentStore.push(record);
  return record;
}

/** Get all recorded invoice treatments (e.g. for hybrid search). */
export function getInvoiceTreatments(): InvoiceTreatment[] {
  return [...invoiceTreatmentStore];
}

/** Convert Tier 2 data to MemoryEntry[] for hybrid search. */
export function getFirmEntries(): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  for (const line of coaStore) {
    entries.push({
      id: `coa-${line.code}`,
      tier: 'firm',
      source: 'chart_of_accounts',
      text: `${line.code} ${line.name} ${line.type} ${line.description ?? ''}`.trim(),
      payload: { code: line.code, name: line.name, type: line.type, parentCode: line.parentCode },
      storedAt: new Date().toISOString(),
    });
  }
  for (const p of policyStore) {
    entries.push({
      id: `policy-${p.id}`,
      tier: 'firm',
      source: 'policy',
      text: `${p.topic} ${p.policy} ${p.citation ?? ''}`.trim(),
      payload: { id: p.id, topic: p.topic, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo },
      storedAt: new Date().toISOString(),
    });
  }
  for (const t of invoiceTreatmentStore) {
    entries.push({
      id: t.id,
      tier: 'firm',
      source: 'invoice_treatment',
      text: `${t.vendor} ${t.description} ${t.accountCode} ${t.period} ${t.citation ?? ''} ${t.reasoning ?? ''}`.trim(),
      payload: {
        vendor: t.vendor,
        description: t.description,
        amount: t.amount,
        accountCode: t.accountCode,
        period: t.period,
        citation: t.citation,
      },
      storedAt: t.storedAt,
    });
  }
  return entries;
}

/** Find similar invoice treatments by vendor/description/account (for consistency). */
export function findSimilarTreatments(params: {
  vendor?: string;
  description?: string;
  accountCode?: string;
  topK?: number;
}): InvoiceTreatment[] {
  const { vendor, description, accountCode, topK = 10 } = params;
  const descLower = (description ?? '').toLowerCase();
  const vendorLower = (vendor ?? '').toLowerCase();
  const scored = invoiceTreatmentStore.map((t) => {
    let score = 0;
    if (vendorLower && t.vendor.toLowerCase().includes(vendorLower)) score += 3;
    if (descLower) {
      const words = descLower.split(/\s+/).filter((w) => w.length > 1);
      for (const w of words) {
        if (t.description.toLowerCase().includes(w)) score += 1;
      }
    }
    if (accountCode && t.accountCode === accountCode) score += 2;
    return { treatment: t, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.treatment);
}
