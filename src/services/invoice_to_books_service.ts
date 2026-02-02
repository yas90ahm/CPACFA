/**
 * Invoice-in → books: capture, agentic coding, approval, post to GL.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { createInMemoryStore } from '../lib/inMemoryStore.js';
import type {
  InvoiceCapture,
  InvoiceCaptureStatus,
  InvoiceLine,
  InvoiceCoding,
} from '../types/invoice_to_books.js';

const store = createInMemoryStore<InvoiceCapture>({ idPrefix: 'inv', timestamps: true });

export function createInvoice(tenantId: string, input: {
  vendor?: string;
  vendorId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  totalAmount: number;
  taxAmount?: number;
  currency: string;
  lines: Omit<InvoiceLine, 'lineId'>[];
  sourceDocId?: string;
}): InvoiceCapture {
  const lines: InvoiceLine[] = input.lines.map((l, i) => ({
    ...l,
    lineId: `L${i + 1}`,
  }));
  return store.create({
    tenantId,
    vendor: input.vendor,
    vendorId: input.vendorId,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate,
    totalAmount: input.totalAmount,
    taxAmount: input.taxAmount,
    currency: input.currency,
    lines,
    status: 'pending_coding',
    sourceDocId: input.sourceDocId,
  });
}

export function getInvoice(id: string): InvoiceCapture | undefined {
  return store.get(id);
}

export function listInvoices(tenantId: string, status?: InvoiceCaptureStatus): InvoiceCapture[] {
  const list = store.list().filter((i) => i.tenantId === tenantId);
  if (status) return list.filter((i) => i.status === status);
  return list;
}

export function updateInvoiceStatus(id: string, status: InvoiceCaptureStatus, approvedBy?: string): InvoiceCapture | undefined {
  const patch: Partial<InvoiceCapture> = { status };
  if (status === 'approved' && approvedBy) {
    patch.approvedBy = approvedBy;
    patch.approvedAt = new Date().toISOString();
  }
  return store.update(id, patch);
}

/** Agentic: suggest account coding for invoice lines */
export async function suggestCodingAgentic(invoiceId: string): Promise<InvoiceCoding | null> {
  const inv = store.get(invoiceId);
  if (!inv) return null;
  const linesText = inv.lines.map((l) => `${l.lineId}: ${l.description ?? 'N/A'} | ${l.amount} ${inv.currency}`).join('\n');
  const prompt = `Vendor: ${inv.vendor ?? 'N/A'}. Invoice #${inv.invoiceNumber}. Total: ${inv.totalAmount} ${inv.currency}.
Lines:
${linesText}
Return JSON: { headerAccountCode?: string, headerAccountName?: string, lines: [ { lineId, accountCode, accountName } ] }. Suggest GL account codes and names for each line (e.g. 6100 Office Supplies).`;
  const fallback: InvoiceCoding = {
    lines: inv.lines.map((l) => ({ lineId: l.lineId, accountCode: '6000', accountName: 'Expenses' })),
  };
  const result = await callLLMWithFallback({
    system: 'You are a staff accountant. Suggest GL account coding for invoice lines. Output only valid JSON.',
    prompt,
    maxTokens: 600,
    parse: (raw) => parseCoding(raw, inv.lines),
    fallback,
  });
  if (result) {
    const updated = store.update(invoiceId, { suggestedCoding: result, status: 'pending_approval' });
    if (updated) {
      updated.lines.forEach((l, i) => {
        const line = result.lines[i];
        if (line) {
          (l as InvoiceLine).suggestedAccountCode = line.accountCode;
          (l as InvoiceLine).suggestedAccountName = line.accountName;
        }
      });
      store.set(invoiceId, updated);
    }
  }
  return result;
}

function parseCoding(raw: string, lines: InvoiceLine[]): InvoiceCoding | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const o = JSON.parse(slice) as Record<string, unknown>;
    const arr = (o.lines as Record<string, unknown>[]) ?? [];
    return {
      headerAccountCode: o.headerAccountCode != null ? String(o.headerAccountCode) : undefined,
      headerAccountName: o.headerAccountName != null ? String(o.headerAccountName) : undefined,
      lines: lines.map((l) => {
        const found = arr.find((x: Record<string, unknown>) => String(x.lineId) === l.lineId);
        return {
          lineId: l.lineId,
          accountCode: found && found.accountCode != null ? String(found.accountCode) : '6000',
          accountName: found && found.accountName != null ? String(found.accountName) : 'Expenses',
        };
      }),
    };
  } catch {
    return null;
  }
}

export function approveCoding(invoiceId: string, coding: InvoiceCoding, approvedBy: string): InvoiceCapture | undefined {
  const inv = store.get(invoiceId);
  if (!inv) return undefined;
  inv.approvedCoding = coding;
  inv.approvedBy = approvedBy;
  inv.approvedAt = new Date().toISOString();
  inv.status = 'approved';
  inv.lines.forEach((l) => {
    const line = coding.lines.find((c) => c.lineId === l.lineId);
    if (line) {
      (l as InvoiceLine).accountCode = line.accountCode;
      (l as InvoiceLine).accountName = line.accountName;
    }
  });
  store.set(invoiceId, inv);
  return store.get(invoiceId);
}

/** Post to GL: returns a synthetic journal ID (real implementation would call GL API) */
export function postToGL(invoiceId: string): { success: boolean; journalId?: string; error?: string } {
  const inv = store.get(invoiceId);
  if (!inv || inv.status !== 'approved') {
    return { success: false, error: 'Invoice not approved or not found' };
  }
  const journalId = `JE-INV-${invoiceId}-${Date.now()}`;
  store.update(invoiceId, { status: 'posted', postedJournalId: journalId, postedAt: new Date().toISOString() });
  return { success: true, journalId };
}
