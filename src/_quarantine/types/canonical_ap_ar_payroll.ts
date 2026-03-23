/**
 * Canonical schema for Bank, AP, AR, and Payroll — shared data model for agentic ingestion.
 * All ingestion paths (agentic schema mapping + deterministic fallback) normalize into these types.
 * Field names here are the canonical targets for LLM schemaMapping output.
 */

/** Provenance: link to source row for audit and line-item evidence */
export interface SourceProvenance {
  sourceDocId?: string;
  sourceSheet?: string;
  sourceRowIndex?: number;
  sourceChunkId?: string;
}

/** Canonical Accounts Payable item — full field set for normalization */
export interface CanonicalApItem {
  vendor?: string;
  vendorId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  amount?: number;
  totalAmount?: number;
  taxAmount?: number;
  currency?: string;
  status?: 'open' | 'paid' | 'partial' | 'overdue';
  lineDescription?: string;
  poNumber?: string;
  /** Traceability to source document/row */
  provenance?: SourceProvenance;
}

/** Canonical Accounts Receivable item — full field set */
export interface CanonicalArItem {
  customer?: string;
  customerId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  amount?: number;
  totalAmount?: number;
  taxAmount?: number;
  currency?: string;
  status?: 'open' | 'paid' | 'partial' | 'overdue';
  lineDescription?: string;
  /** Traceability to source document/row */
  provenance?: SourceProvenance;
}

/** Canonical bank transaction — full field set for transaction-level ingestion */
export interface CanonicalBankTransaction {
  date?: string;
  valueDate?: string;
  description?: string;
  reference?: string;
  debit?: number;
  credit?: number;
  amount?: number; // signed: positive = credit, negative = debit
  balance?: number; // running balance after this transaction
  currency?: string;
  counterparty?: string;
  category?: string;
  /** Traceability to source document/row */
  provenance?: SourceProvenance;
}

/** Canonical Payroll item — full field set */
export interface CanonicalPayrollItem {
  employee?: string;
  employeeId?: string;
  payDate?: string;
  payPeriodStart?: string;
  payPeriodEnd?: string;
  grossPay?: number;
  netPay?: number;
  taxes?: number;
  benefits?: number;
  deductions?: number;
  currency?: string;
  department?: string;
  /** Traceability to source document/row */
  provenance?: SourceProvenance;
}

/** Canonical field names for Bank transactions */
export const CANONICAL_BANK_FIELDS = [
  'date',
  'valueDate',
  'description',
  'reference',
  'debit',
  'credit',
  'amount',
  'balance',
  'currency',
  'counterparty',
  'category',
] as const;

/** Canonical field names for AP — used in agentic schemaMapping (source header -> this key) */
export const CANONICAL_AP_FIELDS = [
  'vendor',
  'vendorId',
  'invoiceNumber',
  'invoiceDate',
  'dueDate',
  'amount',
  'totalAmount',
  'taxAmount',
  'currency',
  'status',
  'lineDescription',
  'poNumber',
] as const;

/** Canonical field names for AR */
export const CANONICAL_AR_FIELDS = [
  'customer',
  'customerId',
  'invoiceNumber',
  'invoiceDate',
  'dueDate',
  'amount',
  'totalAmount',
  'taxAmount',
  'currency',
  'status',
  'lineDescription',
] as const;

/** Canonical field names for Payroll */
export const CANONICAL_PAYROLL_FIELDS = [
  'employee',
  'employeeId',
  'payDate',
  'payPeriodStart',
  'payPeriodEnd',
  'grossPay',
  'netPay',
  'taxes',
  'benefits',
  'deductions',
  'currency',
  'department',
] as const;
