/**
 * Invoice-in → books: capture, agentic coding, approval, post to GL.
 */

import { Router, Request, Response } from 'express';
import {
  createInvoice,
  getInvoice,
  listInvoices,
  suggestCodingAgentic,
  approveCoding,
  postToGL,
  updateInvoiceStatus,
} from '../services/invoice_to_books_service.js';

const router = Router();

const getTenantId = (req: Request): string => (req as Request & { tenantId?: string }).tenantId ?? 'default';

router.post('/invoices', (req: Request, res: Response) => {
  const tenantId = getTenantId(req) ?? 'default';
  const body = req.body ?? {};
  const { vendor, vendorId, invoiceNumber, invoiceDate, dueDate, totalAmount, taxAmount, currency, lines, sourceDocId } = body;
  if (!invoiceNumber || !invoiceDate || totalAmount == null || !currency || !Array.isArray(lines)) {
    return res.status(400).json({ error: 'invoiceNumber, invoiceDate, totalAmount, currency, lines required' });
  }
  const inv = createInvoice(tenantId, {
    vendor,
    vendorId,
    invoiceNumber,
    invoiceDate,
    dueDate,
    totalAmount: Number(totalAmount),
    taxAmount: taxAmount != null ? Number(taxAmount) : undefined,
    currency,
    lines: lines.map((l: { description?: string; amount: number; quantity?: number; unitPrice?: number }) => ({
      description: l.description,
      amount: Number(l.amount),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
    sourceDocId,
  });
  res.status(201).json(inv);
});

router.get('/invoices', (req: Request, res: Response) => {
  const tenantId = getTenantId(req) ?? 'default';
  const status = req.query.status as string | undefined;
  res.json(listInvoices(tenantId, status as 'draft' | 'pending_coding' | 'pending_approval' | 'approved' | 'posted' | 'rejected'));
});

router.get('/invoices/:id', (req: Request, res: Response) => {
  const inv = getInvoice(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

router.post('/invoices/:id/suggest-coding', async (req: Request, res: Response) => {
  try {
    const coding = await suggestCodingAgentic(req.params.id);
    if (!coding) return res.status(404).json({ error: 'Invoice not found or coding failed' });
    res.json({ suggestedCoding: coding, invoice: getInvoice(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post('/invoices/:id/approve-coding', (req: Request, res: Response) => {
  const { coding, approvedBy } = req.body ?? {};
  if (!coding?.lines || !approvedBy) return res.status(400).json({ error: 'coding and approvedBy required' });
  const inv = approveCoding(req.params.id, coding, approvedBy);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

router.post('/invoices/:id/post', (req: Request, res: Response) => {
  const result = postToGL(req.params.id);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

router.patch('/invoices/:id/status', (req: Request, res: Response) => {
  const { status, approvedBy } = req.body ?? {};
  if (!status) return res.status(400).json({ error: 'status required' });
  const inv = updateInvoiceStatus(req.params.id, status, approvedBy);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

export default router;
