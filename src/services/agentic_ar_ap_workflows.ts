/**
 * Agentic AR/AP workflows: collections prioritization, payment run suggestions, cash application.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import type { CanonicalArItem, CanonicalApItem } from '../types/canonical_ap_ar_payroll.js';
import type { ApAgingReport, ArAgingReport } from './ap_ar_aging_service.js';

export interface CollectionsRecommendation {
  customerId?: string;
  customer?: string;
  invoiceNumber?: string;
  amount: number;
  daysOverdue: number;
  priority: 'high' | 'medium' | 'low';
  suggestedAction: string;
  reasoning?: string;
}

export interface PaymentRunRecommendation {
  vendorId?: string;
  vendor?: string;
  invoiceNumber?: string;
  amount: number;
  dueDate?: string;
  include: boolean;
  reason?: string;
}

export interface CashApplicationMatch {
  paymentId: string;
  paymentAmount: number;
  paymentDate: string;
  suggestedInvoices: { invoiceNumber: string; customer?: string; amount: number; applyAmount: number }[];
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
}

/** Agentic: prioritize AR for collections (who to chase first) */
export async function recommendCollectionsAgentic(
  arAging: ArAgingReport,
  options?: { limit?: number }
): Promise<CollectionsRecommendation[]> {
  const limit = options?.limit ?? 10;
  const items = arAging.items.slice(0, 20).map((i) => ({
    customer: i.customer,
    invoiceNumber: i.invoiceNumber,
    amount: i.amount ?? i.totalAmount ?? 0,
    dueDate: i.dueDate,
  }));
  const prompt = `AR aging as of ${arAging.asOfDate}. Total open: ${arAging.totalOpen}. Overdue: ${arAging.totalOverdue}.
Items (sample): ${JSON.stringify(items)}
Return a JSON array of up to ${limit} collection recommendations. Each object: customer, invoiceNumber, amount, daysOverdue (number), priority ("high"|"medium"|"low"), suggestedAction (string), reasoning (optional). Prioritize largest overdue amounts and oldest first.`;
  const fallback: CollectionsRecommendation[] = arAging.items.slice(0, limit).map((i) => {
    const amt = i.amount ?? i.totalAmount ?? 0;
    const due = i.dueDate ? Math.floor((Date.now() - new Date(i.dueDate).getTime()) / (24 * 60 * 60 * 1000)) : 0;
    return {
      customer: i.customer,
      customerId: i.customerId,
      invoiceNumber: i.invoiceNumber,
      amount: amt,
      daysOverdue: due,
      priority: due > 60 ? 'high' : due > 30 ? 'medium' : 'low',
      suggestedAction: due > 60 ? 'Call and send reminder' : 'Send statement',
    };
  });
  try {
    const result = await callLLMWithFallback({
      system: 'You are a treasury/collections analyst. Output only valid JSON array of collection recommendations.',
      prompt,
      maxTokens: 800,
      parse: (raw) => parseCollections(raw, limit),
      fallback,
    });
    assertNoNumericAmountsInAgentOutput(result, 'agentic_ar_ap_workflows.recommendCollectionsAgentic');
    return result;
  } catch {
    return fallback;
  }
}

function parseCollections(raw: string, limit: number): CollectionsRecommendation[] {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const arr = JSON.parse(slice) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, limit).map((o: unknown) => {
      const row = o as Record<string, unknown>;
      return {
        customer: String(row.customer ?? ''),
        customerId: row.customerId != null ? String(row.customerId) : undefined,
        invoiceNumber: String(row.invoiceNumber ?? ''),
        amount: Number(row.amount) || 0,
        daysOverdue: Number(row.daysOverdue) || 0,
        priority: ['high', 'medium', 'low'].includes(String(row.priority)) ? (row.priority as 'high' | 'medium' | 'low') : 'medium',
        suggestedAction: String(row.suggestedAction ?? 'Follow up'),
        reasoning: row.reasoning != null ? String(row.reasoning) : undefined,
      };
    });
  } catch {
    return [];
  }
}

/** Agentic: suggest which AP to pay in next payment run */
export async function recommendPaymentRunAgentic(
  apAging: ApAgingReport,
  options?: { maxTotal?: number; limit?: number }
): Promise<PaymentRunRecommendation[]> {
  const maxTotal = options?.maxTotal ?? 50000;
  const limit = options?.limit ?? 30;
  const items = apAging.items.slice(0, 25).map((i) => ({
    vendor: i.vendor,
    invoiceNumber: i.invoiceNumber,
    amount: i.amount ?? i.totalAmount ?? 0,
    dueDate: i.dueDate,
  }));
  const prompt = `AP aging as of ${apAging.asOfDate}. Total open: ${apAging.totalOpen}.
Sample items: ${JSON.stringify(items)}
Budget for this run: ${maxTotal}. Return JSON array of payment recommendations. Each: vendor, invoiceNumber, amount, dueDate, include (boolean), reason (optional). Prefer due soon and critical vendors. Total of included amounts should not exceed ${maxTotal}.`;
  const fallback: PaymentRunRecommendation[] = apAging.items.slice(0, limit).map((i) => ({
    vendor: i.vendor,
    vendorId: i.vendorId,
    invoiceNumber: i.invoiceNumber,
    amount: i.amount ?? i.totalAmount ?? 0,
    dueDate: i.dueDate,
    include: true,
    reason: 'Included in default run',
  }));
  try {
    const result = await callLLMWithFallback({
      system: 'You are an AP analyst. Output only valid JSON array of payment run recommendations.',
      prompt,
      maxTokens: 1000,
      parse: (raw) => parsePaymentRun(raw, limit),
      fallback,
    });
    assertNoNumericAmountsInAgentOutput(result, 'agentic_ar_ap_workflows.recommendPaymentRunAgentic');
    return result;
  } catch {
    return fallback;
  }
}

function parsePaymentRun(raw: string, limit: number): PaymentRunRecommendation[] {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const arr = JSON.parse(slice) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, limit).map((o: unknown) => {
      const row = o as Record<string, unknown>;
      return {
        vendor: row.vendor != null ? String(row.vendor) : undefined,
        vendorId: row.vendorId != null ? String(row.vendorId) : undefined,
        invoiceNumber: row.invoiceNumber != null ? String(row.invoiceNumber) : undefined,
        amount: Number(row.amount) || 0,
        dueDate: row.dueDate != null ? String(row.dueDate) : undefined,
        include: Boolean(row.include),
        reason: row.reason != null ? String(row.reason) : undefined,
      };
    });
  } catch {
    return [];
  }
}

/** Agentic: suggest cash application (payment → invoices) */
export async function suggestCashApplicationAgentic(
  payment: { id: string; amount: number; date: string; description?: string; counterparty?: string },
  openAr: CanonicalArItem[]
): Promise<CashApplicationMatch> {
  const arSummary = openAr.slice(0, 15).map((i) => ({
    customer: i.customer,
    invoiceNumber: i.invoiceNumber,
    amount: i.amount ?? i.totalAmount ?? 0,
  }));
  const prompt = `Payment: id=${payment.id}, amount=${payment.amount}, date=${payment.date}, description=${payment.description ?? ''}, counterparty=${payment.counterparty ?? ''}.
Open AR (sample): ${JSON.stringify(arSummary)}
Suggest which invoice(s) to apply this payment to. Return JSON: { suggestedInvoices: [ { invoiceNumber, customer, amount, applyAmount } ], confidence: "high"|"medium"|"low", reasoning?: string }. applyAmount can split across invoices; total applyAmount should equal payment amount if possible.`;
  const fallback: CashApplicationMatch = {
    paymentId: payment.id,
    paymentAmount: payment.amount,
    paymentDate: payment.date,
    suggestedInvoices: openAr.slice(0, 3).map((i) => ({
      invoiceNumber: i.invoiceNumber ?? '',
      customer: i.customer,
      amount: i.amount ?? i.totalAmount ?? 0,
      applyAmount: Math.min(payment.amount, i.amount ?? i.totalAmount ?? 0),
    })),
    confidence: 'low',
    reasoning: 'Fallback: first open AR items',
  };
  try {
    const result = await callLLMWithFallback({
      system: 'You are a cash application specialist. Output only valid JSON object with suggestedInvoices, confidence, and optional reasoning.',
      prompt,
      maxTokens: 500,
      parse: (raw) => parseCashApp(raw, payment),
      fallback,
    });
    assertNoNumericAmountsInAgentOutput(result, 'agentic_ar_ap_workflows.suggestCashApplicationAgentic');
    return result;
  } catch {
    return fallback;
  }
}

function parseCashApp(
  raw: string,
  payment: { id: string; amount: number; date: string }
): CashApplicationMatch {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const o = JSON.parse(slice) as Record<string, unknown>;
    const inv = (o.suggestedInvoices as Record<string, unknown>[]) ?? [];
    return {
      paymentId: payment.id,
      paymentAmount: payment.amount,
      paymentDate: payment.date,
      suggestedInvoices: inv.map((i: Record<string, unknown>) => ({
        invoiceNumber: String(i.invoiceNumber ?? ''),
        customer: i.customer != null ? String(i.customer) : undefined,
        amount: Number(i.amount) || 0,
        applyAmount: Number(i.applyAmount) || 0,
      })),
      confidence: ['high', 'medium', 'low'].includes(String(o.confidence)) ? (o.confidence as 'high' | 'medium' | 'low') : 'medium',
      reasoning: o.reasoning != null ? String(o.reasoning) : undefined,
    };
  } catch {
    return {
      paymentId: payment.id,
      paymentAmount: payment.amount,
      paymentDate: payment.date,
      suggestedInvoices: [],
      confidence: 'low',
    };
  }
}
