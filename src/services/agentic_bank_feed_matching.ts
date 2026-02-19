/**
 * Agentic bank feed matching: suggest matches for bank transactions to GL or AR.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import type { CanonicalBankTransaction } from '../types/canonical_ap_ar_payroll.js';
import type { GLCashEntry } from './bank_reconciliation_service.js';
import type { CanonicalArItem } from '../types/canonical_ap_ar_payroll.js';

export interface BankMatchSuggestion {
  bankTxId: string;
  bankDate: string;
  bankAmount: number;
  bankDescription?: string;
  /** Match to GL entry */
  glEntryId?: string;
  glDescription?: string;
  /** Or match to AR invoice (for deposits / receipts) */
  arInvoiceNumber?: string;
  arCustomer?: string;
  arAmount?: number;
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
}

/** Suggest matches for a set of bank transactions against GL cash entries and open AR */
export async function suggestBankFeedMatchesAgentic(
  bankTransactions: (CanonicalBankTransaction & { id: string })[],
  glCashEntries: GLCashEntry[],
  openAr: CanonicalArItem[]
): Promise<BankMatchSuggestion[]> {
  const bankSummary = bankTransactions.slice(0, 15).map((t) => ({
    id: t.id,
    date: t.date,
    amount: t.amount ?? (t.credit ?? 0) - (t.debit ?? 0),
    description: t.description,
    counterparty: t.counterparty,
  }));
  const glSummary = glCashEntries.slice(0, 20).map((g) => ({ id: g.id, date: g.date, amount: g.amount, description: g.description }));
  const arSummary = openAr.slice(0, 15).map((a) => ({ customer: a.customer, invoiceNumber: a.invoiceNumber, amount: a.amount ?? a.totalAmount }));
  const prompt = `Bank transactions (from feed): ${JSON.stringify(bankSummary)}
GL cash entries (candidates): ${JSON.stringify(glSummary)}
Open AR (for deposit matching): ${JSON.stringify(arSummary)}
For each bank transaction, suggest best match: either a GL entry (by amount and date) or an AR invoice (for deposits). Return JSON array. Each: bankTxId, bankDate, bankAmount, bankDescription?, glEntryId?, glDescription?, arInvoiceNumber?, arCustomer?, arAmount?, confidence ("high"|"medium"|"low"), reasoning?.`;
  const fallback: BankMatchSuggestion[] = bankTransactions.slice(0, 10).map((t) => {
    const amt = t.amount ?? (t.credit ?? 0) - (t.debit ?? 0);
    const gl = glCashEntries.find((g) => Math.abs(g.amount - amt) < 1 && (t.date?.slice(0, 7) === g.date.slice(0, 7)));
    return {
      bankTxId: t.id,
      bankDate: t.date ?? '',
      bankAmount: amt,
      bankDescription: t.description,
      glEntryId: gl?.id,
      glDescription: gl?.description,
      confidence: gl ? 'medium' : 'low',
      reasoning: gl ? 'Amount and month match' : 'No automatic match',
    };
  });
  try {
    const result = await callLLMWithFallback({
      system: 'You are a cash reconciliation specialist. Output only valid JSON array of match suggestions.',
      prompt,
      maxTokens: 1200,
      parse: (raw) => parseMatchSuggestions(raw, bankTransactions),
      fallback,
    });
    assertNoNumericAmountsInAgentOutput(result, 'agentic_bank_feed_matching.suggestBankFeedMatchesAgentic');
    return result;
  } catch {
    return fallback;
  }
}

function parseMatchSuggestions(
  raw: string,
  bankTransactions: (CanonicalBankTransaction & { id: string })[]
): BankMatchSuggestion[] {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const arr = JSON.parse(slice) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr.map((o: unknown) => {
      const row = o as Record<string, unknown>;
      const tx = bankTransactions.find((t) => t.id === row.bankTxId);
      const amt = tx ? (tx.amount ?? (tx.credit ?? 0) - (tx.debit ?? 0)) : Number(row.bankAmount) || 0;
      return {
        bankTxId: String(row.bankTxId ?? ''),
        bankDate: String(row.bankDate ?? ''),
        bankAmount: Number(row.bankAmount) ?? amt,
        bankDescription: row.bankDescription != null ? String(row.bankDescription) : undefined,
        glEntryId: row.glEntryId != null ? String(row.glEntryId) : undefined,
        glDescription: row.glDescription != null ? String(row.glDescription) : undefined,
        arInvoiceNumber: row.arInvoiceNumber != null ? String(row.arInvoiceNumber) : undefined,
        arCustomer: row.arCustomer != null ? String(row.arCustomer) : undefined,
        arAmount: row.arAmount != null ? Number(row.arAmount) : undefined,
        confidence: ['high', 'medium', 'low'].includes(String(row.confidence)) ? (row.confidence as 'high' | 'medium' | 'low') : 'low',
        reasoning: row.reasoning != null ? String(row.reasoning) : undefined,
      };
    });
  } catch {
    return [];
  }
}
