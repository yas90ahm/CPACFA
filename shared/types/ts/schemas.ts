/**
 * Core financial TypeScript schemas.
 * - LedgerEntry: UUID, timestamp, account_code, debit_amount, credit_amount, meta_justification.
 * - FinancialStatement: Balance Sheet, P&L, Cash Flow — nested for drill-down.
 * - All currency as decimal strings (no floats) for strictness.
 * - Validation: sum(debits) === sum(credits) for every transaction batch.
 */

/** Decimal representation for currency: string to avoid float rounding. Parse with parseDecimal, format with formatDecimal. */
export type DecimalString = string;

/** Parse a decimal string to number for arithmetic (use only when necessary; prefer string for storage). */
export function parseDecimal(s: DecimalString): number {
  const n = parseFloat(s);
  if (Number.isNaN(n)) throw new Error(`Invalid decimal: ${s}`);
  return n;
}

/** Format a number as decimal string (e.g. for API). */
export function formatDecimal(n: number): DecimalString {
  return String(n);
}

// --- Ledger ---

export interface LedgerEntry {
  /** Unique identifier (UUID v4) */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Chart of accounts code */
  account_code: string;
  /** Debit amount (decimal string, >= 0) */
  debit_amount: DecimalString;
  /** Credit amount (decimal string, >= 0) */
  credit_amount: DecimalString;
  /** Accounting justification / reference (e.g. ASC citation) */
  meta_justification: string;
}

/** Ensures sum of debits equals sum of credits for a batch. Throws if not balanced. */
export function validateLedgerEntryBatch(entries: LedgerEntry[]): void {
  let totalDebits = 0;
  let totalCredits = 0;
  for (const e of entries) {
    totalDebits += parseDecimal(e.debit_amount);
    totalCredits += parseDecimal(e.credit_amount);
  }
  const tolerance = 1e-9;
  if (Math.abs(totalDebits - totalCredits) > tolerance) {
    throw new Error(
      `Transaction batch must balance: sum(debits)=${totalDebits} != sum(credits)=${totalCredits}`
    );
  }
}

export interface LedgerEntryBatch {
  entries: LedgerEntry[];
}

/** Create a validated batch; throws if debits != credits. */
export function createLedgerEntryBatch(entries: LedgerEntry[]): LedgerEntryBatch {
  validateLedgerEntryBatch(entries);
  return { entries };
}

// --- Statement line (nested drill-down) ---

export interface StatementLine {
  label: string;
  amount: DecimalString;
  account_code?: string | null;
  /** Drill-down sublines */
  children?: StatementLine[];
}

// --- Balance Sheet (nested) ---

export interface BalanceSheetSection {
  title: string;
  lines: StatementLine[];
  subtotal: DecimalString;
}

export interface BalanceSheet {
  report_date?: string | null;
  assets: BalanceSheetSection[];
  liabilities: BalanceSheetSection[];
  equity: BalanceSheetSection[];
  total_assets: DecimalString;
  total_liabilities: DecimalString;
  total_equity: DecimalString;
}

// --- P&L (nested) ---

export interface ProfitAndLossSection {
  title: string;
  lines: StatementLine[];
  subtotal: DecimalString;
}

export interface ProfitAndLoss {
  report_date?: string | null;
  revenue: ProfitAndLossSection[];
  expenses: ProfitAndLossSection[];
  total_revenue: DecimalString;
  total_expenses: DecimalString;
  net_income: DecimalString;
}

// --- Cash Flow (nested) ---

export interface CashFlowSection {
  title: string;
  lines: StatementLine[];
  subtotal: DecimalString;
}

export interface CashFlowStatement {
  report_date?: string | null;
  operating: CashFlowSection[];
  investing: CashFlowSection[];
  financing: CashFlowSection[];
  net_cash_operating: DecimalString;
  net_cash_investing: DecimalString;
  net_cash_financing: DecimalString;
  beginning_cash: DecimalString;
  ending_cash: DecimalString;
}

// --- Combined financial statement ---

export interface FinancialStatement {
  balance_sheet: BalanceSheet;
  profit_and_loss: ProfitAndLoss;
  cash_flow: CashFlowStatement;
}
