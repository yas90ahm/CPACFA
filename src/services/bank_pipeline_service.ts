/**
 * Bank transaction-level pipeline: parse bank CSV/sheet → canonical transactions,
 * compute running balance, and derive cash balance / TB-ready line for reconciliation.
 */

import type { CanonicalBankTransaction, SourceProvenance } from '../types/canonical_ap_ar_payroll.js';
import type { TrialBalanceEntry } from '../types/financial.js';

export interface BankPipelineInput {
  /** Rows from ingestion (array of objects with date, description, debit, credit, amount, etc.) */
  rows: Record<string, unknown>[];
  /** Optional opening balance (from prior statement) */
  openingBalance?: number;
  /** Source doc id for provenance */
  sourceDocId?: string;
}

export interface BankPipelineResult {
  transactions: CanonicalBankTransaction[];
  openingBalance: number;
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  /** TB-ready cash line for reconciliation (single entry: debit or credit = |closingBalance|) */
  trialBalanceCashEntry?: TrialBalanceEntry;
  /** Suggested bank statement balance for reconciliation API */
  bankStatementBalance: number;
  errors: string[];
}

const DATE_KEYS = ['date', 'transaction date', 'posting date', 'value date', 'doc date'];
const DESC_KEYS = ['description', 'memo', 'details', 'narrative', 'reference'];
const DEBIT_KEYS = ['debit', 'debits', 'withdrawal', 'out'];
const CREDIT_KEYS = ['credit', 'credits', 'deposit', 'in'];
const AMOUNT_KEYS = ['amount', 'transaction amount', 'value'];
const BALANCE_KEYS = ['balance', 'running balance', 'closing balance'];

function pickNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/[,$]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

function findKey(row: Record<string, unknown>, keys: string[]): string | undefined {
  const lower = (o: Record<string, unknown>) =>
    Object.keys(o).map((k) => k.toLowerCase());
  const rowKeys = lower(row);
  for (const k of keys) {
    const found = rowKeys.find((rk) => rk.includes(k) || k.includes(rk));
    if (found) return Object.keys(row).find((x) => x.toLowerCase() === found);
  }
  return undefined;
}

/**
 * Normalize ingested rows into canonical bank transactions and compute running balance.
 */
export function runBankPipeline(input: BankPipelineInput): BankPipelineResult {
  const { rows, openingBalance = 0, sourceDocId } = input;
  const transactions: CanonicalBankTransaction[] = [];
  const errors: string[] = [];
  let runningBalance = openingBalance;
  let totalDebits = 0;
  let totalCredits = 0;

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      transactions: [],
      openingBalance,
      closingBalance: openingBalance,
      totalDebits: 0,
      totalCredits: 0,
      bankStatementBalance: openingBalance,
      errors: ['No rows provided'],
    };
  }

  const first = rows[0] as Record<string, unknown>;
  const dateKey = findKey(first, DATE_KEYS) ?? 'date';
  const descKey = findKey(first, DESC_KEYS) ?? 'description';
  const debitKey = findKey(first, DEBIT_KEYS) ?? 'debit';
  const creditKey = findKey(first, CREDIT_KEYS) ?? 'credit';
  const amountKey = findKey(first, AMOUNT_KEYS) ?? 'amount';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>;
    const date = pickString(row, [dateKey, 'date']);
    const description = pickString(row, [descKey, 'description']);
    let debit = pickNumber(row, [debitKey, 'debit']) ?? 0;
    let credit = pickNumber(row, [creditKey, 'credit']) ?? 0;
    const amount = pickNumber(row, [amountKey, 'amount']);

    if (amount != null && debit === 0 && credit === 0) {
      if (amount >= 0) credit = amount;
      else debit = Math.abs(amount);
    }
    if (debit > 0) totalDebits += debit;
    if (credit > 0) totalCredits += credit;
    runningBalance = runningBalance + credit - debit;

    const provenance: SourceProvenance | undefined = sourceDocId
      ? { sourceDocId, sourceRowIndex: i }
      : undefined;

    transactions.push({
      date,
      description,
      debit: debit > 0 ? debit : undefined,
      credit: credit > 0 ? credit : undefined,
      amount: credit - debit,
      balance: runningBalance,
      provenance,
    });
  }

  const closingBalance = runningBalance;
  const tbEntry: TrialBalanceEntry | undefined =
    closingBalance !== 0
      ? {
          accountName: 'Cash (from bank)',
          debit: closingBalance > 0 ? closingBalance : 0,
          credit: closingBalance < 0 ? Math.abs(closingBalance) : 0,
          sourceDocumentId: sourceDocId,
          sourceRowIndex: undefined,
        }
      : undefined;

  return {
    transactions,
    openingBalance,
    closingBalance,
    totalDebits,
    totalCredits,
    trialBalanceCashEntry: tbEntry,
    bankStatementBalance: closingBalance,
    errors,
  };
}
