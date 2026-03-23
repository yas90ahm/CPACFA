/**
 * Invoice-in → books: capture, coding, approval, post to GL.
 */

export type InvoiceCaptureStatus = 'draft' | 'pending_coding' | 'pending_approval' | 'approved' | 'posted' | 'rejected';

export interface InvoiceCapture {
  id: string;
  tenantId: string;
  /** Vendor/supplier */
  vendor?: string;
  vendorId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  totalAmount: number;
  taxAmount?: number;
  currency: string;
  /** Line items for coding */
  lines: InvoiceLine[];
  status: InvoiceCaptureStatus;
  /** Suggested or final account coding (per line or header) */
  suggestedCoding?: InvoiceCoding;
  approvedCoding?: InvoiceCoding;
  approvedBy?: string;
  approvedAt?: string;
  postedJournalId?: string;
  postedAt?: string;
  sourceDocId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  lineId: string;
  description?: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
  /** Suggested account code/name (from agentic coding) */
  suggestedAccountCode?: string;
  suggestedAccountName?: string;
  /** Approved account (user or workflow) */
  accountCode?: string;
  accountName?: string;
}

export interface InvoiceCoding {
  headerAccountCode?: string;
  headerAccountName?: string;
  lines: { lineId: string; accountCode: string; accountName: string }[];
}
