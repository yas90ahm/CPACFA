/**
 * Parser utilities — standardize column names for messy CSV/XLSX (ported from backend/parser/column_cleaner.py).
 * Maps variants like "Balance", "Amt", "Dr", "Cr" to canonical: Date, Vendor, Amount, Description, AccountName, AccountCode, Debit, Credit.
 * Handles "pathetic" bank/export formats for trial balance and transaction lists.
 */

export const CANONICAL_DATE = 'Date';
export const CANONICAL_VENDOR = 'Vendor';
export const CANONICAL_PRICE = 'Price';
export const CANONICAL_AMOUNT = 'Amount';
export const CANONICAL_DESCRIPTION = 'Description';
export const CANONICAL_ACCOUNT_NAME = 'AccountName';
export const CANONICAL_ACCOUNT_CODE = 'AccountCode';
export const CANONICAL_DEBIT = 'Debit';
export const CANONICAL_CREDIT = 'Credit';

const DATE_VARIANTS = [
  'date', 'transaction_date', 'trans_date', 'posting_date', 'value_date',
  'transaction date', 'posting date', 'doc_date', 'document_date',
  'booking_date', 'clearing_date', 'effective_date',
];
const VENDOR_VARIANTS = [
  'vendor', 'payee', 'payer', 'counterparty', 'counter_party', 'name',
  'party', 'beneficiary', 'from', 'to', 'merchant', 'description_of_payment',
  'payee_name', 'payer_name', 'company', 'recipient',
];
const PRICE_AMOUNT_VARIANTS = [
  'price', 'amount', 'amt', 'value', 'sum', 'total', 'transaction_amount',
  'debit_amount', 'credit_amount', 'balance', 'bal', 'running_balance',
  'gross', 'net', 'fee', 'tax',
];
const DESCRIPTION_VARIANTS = [
  'description', 'desc', 'narrative', 'memo', 'details', 'particulars',
  'transaction_details', 'remarks', 'notes', 'reference', 'payment_details',
];
const ACCOUNT_NAME_VARIANTS = [
  'accountname', 'account_name', 'account name', 'account', 'name',
  'description', 'gl_account', 'ledger_account', 'account_description',
];
const ACCOUNT_CODE_VARIANTS = [
  'accountcode', 'account_code', 'account code', 'code', 'gl_code',
  'ledger_code', 'account_number', 'acct_no',
];
const DEBIT_VARIANTS = ['debit', 'debits', 'dr', 'debit_amount', 'debit_balance'];
const CREDIT_VARIANTS = ['credit', 'credits', 'cr', 'credit_amount', 'credit_balance'];

// Order matters: trial-balance columns (AccountName, Debit, Credit) before Vendor/Amount so "AccountName" matches ACCOUNT_NAME not VENDOR (name).
const CANONICAL_MAP: Record<string, readonly string[]> = {
  [CANONICAL_DATE]: DATE_VARIANTS,
  [CANONICAL_ACCOUNT_NAME]: ACCOUNT_NAME_VARIANTS,
  [CANONICAL_ACCOUNT_CODE]: ACCOUNT_CODE_VARIANTS,
  [CANONICAL_DEBIT]: DEBIT_VARIANTS,
  [CANONICAL_CREDIT]: CREDIT_VARIANTS,
  [CANONICAL_VENDOR]: VENDOR_VARIANTS,
  [CANONICAL_PRICE]: PRICE_AMOUNT_VARIANTS,
  [CANONICAL_AMOUNT]: PRICE_AMOUNT_VARIANTS,
  [CANONICAL_DESCRIPTION]: DESCRIPTION_VARIANTS,
};

function normalizeHeader(h: string): string {
  return String(h ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function matchKey(normalized: string, variants: readonly string[]): boolean {
  const n = normalizeHeader(normalized);
  for (const v of variants) {
    const vn = normalizeHeader(v);
    if (vn.includes(n) || n.includes(vn)) return true;
  }
  return false;
}

export type StandardizedRow = Record<string, unknown>;

/**
 * Map each row's keys to canonical column names (Date, Vendor, Debit, Credit, etc.).
 * Handles messy headers (e.g. "Balance", "Amt", "Dr", "Cr") so downstream code can rely on canonical keys.
 */
export function standardizeColumns(rows: Record<string, unknown>[]): StandardizedRow[] {
  if (rows.length === 0) return [];

  const rawHeaders = Object.keys(rows[0]!);
  const headerToCanonical: Record<string, string> = {};
  const usedCanonical = new Set<string>();

  for (const raw of rawHeaders) {
    const n = normalizeHeader(raw);
    for (const [canonical, variants] of Object.entries(CANONICAL_MAP)) {
      if (usedCanonical.has(canonical)) continue;
      for (const v of variants) {
        const vn = normalizeHeader(v);
        if (n.includes(vn) || vn.includes(n)) {
          headerToCanonical[raw] = canonical;
          usedCanonical.add(canonical);
          break;
        }
      }
      if (headerToCanonical[raw]) break;
    }
    if (!headerToCanonical[raw]) {
      headerToCanonical[raw] = raw.trim().replace(/\s+/g, ' ');
      if (!/^[A-Z]/.test(headerToCanonical[raw])) {
        headerToCanonical[raw] = headerToCanonical[raw].charAt(0).toUpperCase() + headerToCanonical[raw].slice(1);
      }
    }
  }

  const out: StandardizedRow[] = [];
  for (const row of rows) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      const canon = headerToCanonical[k] ?? k;
      if (
        (canon === CANONICAL_AMOUNT || canon === CANONICAL_PRICE || canon === CANONICAL_DEBIT || canon === CANONICAL_CREDIT) &&
        clean[canon] != null &&
        v != null &&
        String(v).trim() !== '' &&
        (clean[canon] == null || String(clean[canon]).trim() === '')
      ) {
        clean[canon] = v;
      } else if (!(canon in clean)) {
        clean[canon] = v;
      }
    }
    out.push(clean);
  }
  return out;
}

/**
 * Infer format from cleaned row keys: 'trial_balance' | 'transaction_list' | 'mixed'.
 */
export function inferFormat(cleanedRows: StandardizedRow[]): 'trial_balance' | 'transaction_list' | 'mixed' {
  if (cleanedRows.length === 0) return 'mixed';
  const keys = new Set(Object.keys(cleanedRows[0]!));
  const hasTb =
    (keys.has(CANONICAL_ACCOUNT_NAME) || keys.has('AccountName')) &&
    (keys.has(CANONICAL_DEBIT) || keys.has(CANONICAL_CREDIT));
  const hasTx =
    keys.has(CANONICAL_DATE) ||
    keys.has(CANONICAL_DESCRIPTION) ||
    keys.has(CANONICAL_AMOUNT) ||
    keys.has(CANONICAL_VENDOR) ||
    keys.has(CANONICAL_PRICE);
  if (hasTb && hasTx) return 'mixed';
  if (hasTb) return 'trial_balance';
  if (hasTx) return 'transaction_list';
  return 'mixed';
}

/** Parse numeric value from cell (commas, parentheses for negative). */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (s === '' || s === '-') return 0;
  if (s.startsWith('(') && s.endsWith(')')) return -parseFloat(s.slice(1, -1)) || 0;
  return parseFloat(s) || 0;
}

/**
 * True when standardized rows have canonical Debit+Credit columns or Amount/Price (so we can derive debit/credit).
 * Use to decide whether to trigger agentic column mapping (when false).
 */
export function hasCanonicalDebitCredit(standardizedRows: StandardizedRow[]): boolean {
  if (standardizedRows.length === 0) return false;
  const keys = Object.keys(standardizedRows[0] ?? {});
  const hasDebit = keys.some((k) => k === CANONICAL_DEBIT);
  const hasCredit = keys.some((k) => k === CANONICAL_CREDIT);
  const hasAmount = keys.some((k) => k === CANONICAL_AMOUNT || k === CANONICAL_PRICE);
  return (hasDebit && hasCredit) || !!hasAmount;
}

/**
 * Convert standardized rows to trial-balance-like rows with canonical Debit/Credit.
 * If only Amount is present (no Debit/Credit), treats positive as debit and negative as credit (one row per line).
 */
export function standardizedRowsToTrialBalanceRows(
  rows: StandardizedRow[]
): Array<{ accountName: string; accountCode?: string; debit: number; credit: number }> {
  const out: Array<{ accountName: string; accountCode?: string; debit: number; credit: number }> = [];
  const hasDebit = rows.length > 0 && (CANONICAL_DEBIT in (rows[0] ?? {}));
  const hasCredit = rows.length > 0 && (CANONICAL_CREDIT in (rows[0] ?? {}));
  const hasAmount = rows.length > 0 && (CANONICAL_AMOUNT in (rows[0] ?? {}) || CANONICAL_PRICE in (rows[0] ?? {}));
  const nameKey = rows.length > 0 && CANONICAL_ACCOUNT_NAME in (rows[0] ?? {}) ? CANONICAL_ACCOUNT_NAME : 'AccountName';
  const codeKey = rows.length > 0 && CANONICAL_ACCOUNT_CODE in (rows[0] ?? {}) ? CANONICAL_ACCOUNT_CODE : undefined;

  for (const row of rows) {
    const accountName = String(row[nameKey] ?? row['AccountName'] ?? row[CANONICAL_DESCRIPTION] ?? '').trim();
    if (!accountName) continue;

    const accountCode = codeKey ? String(row[codeKey] ?? '').trim() || undefined : undefined;
    let debit = 0;
    let credit = 0;

    if (hasDebit && hasCredit) {
      debit = parseAmount(row[CANONICAL_DEBIT]);
      credit = parseAmount(row[CANONICAL_CREDIT]);
    } else if (hasAmount) {
      const amt = parseAmount(row[CANONICAL_AMOUNT] ?? row[CANONICAL_PRICE]);
      if (amt >= 0) debit = amt;
      else credit = Math.abs(amt);
    }

    out.push({ accountName, accountCode, debit, credit });
  }
  return out;
}
