/**
 * Canonical Ingestion Schema — the single structured format ALL ERP data normalizes into.
 *
 * Every money field is a DecimalString (never a JavaScript number).
 * Every entry passes through the validation pipeline before reaching the GL.
 */

/** Decimal string representing NUMERIC(20,2). Never use JavaScript number for money. */
export type DecimalString = string;

export type CanonicalAccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
export type NormalBalance = 'debit' | 'credit';

/* ── Trial Balance ─────────────────────────────────────────────── */

export interface CanonicalTrialBalanceEntry {
  /** Account identifier (unique within sync batch). NOT NULL. */
  accountCode: string;
  /** Human-readable account name. NOT NULL. */
  accountName: string;
  /** Debit balance as Decimal string ("0.00" format). NOT NULL, >= 0. */
  debit: DecimalString;
  /** Credit balance as Decimal string ("0.00" format). NOT NULL, >= 0. */
  credit: DecimalString;
  /** ISO 4217 currency code. Default 'USD'. NOT NULL. */
  currency: string;
  /** Multi-entity identifier. Null for single-entity tenants. */
  entityId: string | null;
  /** Enriched by COA lookup or ERP metadata. */
  accountType: CanonicalAccountType | null;
  /** Segment/department (QB Class, Xero Tracking Category, Intacct Department). */
  department: string | null;
  /** Classification segment (QB Class, NetSuite Class). */
  class: string | null;
  /** Location segment (NetSuite Location, Intacct Location). */
  location: string | null;
  /** Inferred from accountType: Asset/Expense=debit, Liability/Equity/Revenue=credit. */
  normalBalance: NormalBalance | null;
}

/* ── Journal Entry ─────────────────────────────────────────────── */

export interface CanonicalJournalEntryLine {
  /** Groups lines into a single JE. NOT NULL. */
  entryId: string;
  /** 1-indexed within entry. NOT NULL. */
  lineNumber: number;
  /** ISO 8601 YYYY-MM-DD. NOT NULL. */
  date: string;
  /** Account identifier. NOT NULL. */
  accountCode: string;
  /** Human-readable account name. NOT NULL. */
  accountName: string;
  /** Debit as Decimal string. */
  debit: DecimalString;
  /** Credit as Decimal string. */
  credit: DecimalString;
  /** Line-level memo/description. */
  memo: string | null;
  /** External reference (JE number, invoice number). */
  reference: string | null;
  /** ISO 4217 currency code. Default 'USD'. */
  currency: string;
  entityId: string | null;
  department: string | null;
  class: string | null;
  location: string | null;
}

/* ── Chart of Accounts ─────────────────────────────────────────── */

export interface CanonicalChartOfAccountsEntry {
  /** Account identifier, unique per tenant. NOT NULL. */
  accountCode: string;
  /** Human-readable name. NOT NULL. */
  accountName: string;
  /** NOT NULL. */
  accountType: CanonicalAccountType;
  /** For hierarchy (parent account code). */
  parentCode: string | null;
  /** Default true. */
  isActive: boolean;
  /** Derived from accountType: Asset/Expense=debit, Liability/Equity/Revenue=credit. */
  normalBalance: NormalBalance;
  /** Account-level currency (for multi-currency accounts). */
  currency: string | null;
  /** Optional description from ERP. */
  description: string | null;
}

/* ── Validation ────────────────────────────────────────────────── */

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  /** Machine-readable code: 'MISSING_ACCOUNT_CODE', 'DECIMAL_OVERFLOW', etc. */
  code: string;
  /** Which field: 'debit', 'accountCode', etc. */
  field: string;
  /** Which entry (0-indexed). */
  lineIndex: number;
  /** For identification. */
  accountCode?: string;
  /** Human-readable message. */
  message: string;
  /** The offending value. */
  value?: string;
}

export interface ValidationResult {
  /** True if zero errors (warnings are OK). */
  valid: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}
