/**
 * Trial Balance parser — normalizes raw rows to TrialBalanceEntry[]
 * Zero tolerance for balancing errors (CPA mode).
 * Assigns deterministic lineId per line (SHA-256 of accountName|debit|credit|accountCode) for audit trail.
 */

import { computeLineId } from '../utils/line_id.js';
import type { TrialBalanceEntry, TrialBalanceResult } from '../types/financial.js';
import { round2, from, sumRound2, absLt } from '../utils/decimal.js';

export interface RawTrialBalanceRow {
  accountCode?: string;
  accountName: string;
  debit: number;
  credit: number;
  /** Raw account type from CSV (e.g. "Bank", "Expense"). Used for CoA template mapping. */
  accountTypeRaw?: string;
  /** Mapped category when CoA template applied (ASSET, LIABILITY, etc.). */
  accountType?: import('../types/financial.js').AccountType;
}

/** Parse amount from string (handles commas, parentheses for negatives). Uses Decimal.js. */
function parseAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value)) return round2(value);
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (s === '' || s === '-') return 0;
  // Parentheses = negative (accounting convention)
  if (s.startsWith('(') && s.endsWith(')')) {
    const inner = from(s.slice(1, -1)).negated();
    return round2(inner.isFinite() ? inner.toNumber() : 0);
  }
  try {
    const d = from(s);
    return round2(d.isFinite() ? d.toNumber() : 0);
  } catch {
    return 0;
  }
}

/** Parse raw rows into TrialBalanceEntry[] and validate balance */
export function parseTrialBalance(rows: RawTrialBalanceRow[]): TrialBalanceResult {
  const entries: TrialBalanceEntry[] = [];
  const debitValues: number[] = [];
  const creditValues: number[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const accountName = String(row?.accountName ?? '').trim();
    if (!accountName) continue;

    const debit = parseAmount(row?.debit);
    const credit = parseAmount(row?.credit);

    if (debit < 0 || credit < 0) {
      errors.push(`Row ${i + 1}: Negative debit/credit not allowed unless using parentheses.`);
    }

    debitValues.push(debit);
    creditValues.push(credit);

    const entry: import('../types/financial.js').TrialBalanceEntry = {
      lineId: computeLineId({ accountName, debit, credit, accountCode: row?.accountCode != null ? String(row.accountCode).trim() : undefined }),
      accountCode: row?.accountCode != null ? String(row.accountCode).trim() : undefined,
      accountName,
      debit,
      credit,
      sourceRowIndex: i,
    };
    if (row?.accountType) entry.accountType = row.accountType;
    entries.push(entry);
  }

  const totalDebits = sumRound2(debitValues);
  const totalCredits = sumRound2(creditValues);
  const tolerance = 0.01;
  const balances = absLt(totalDebits, totalCredits, tolerance);
  if (!balances) {
    errors.push(
      `Trial Balance does not balance. Debits: ${totalDebits.toFixed(2)}, Credits: ${totalCredits.toFixed(2)}. (FASB/IFRS: zero tolerance.)`
    );
  }

  return {
    entries,
    totalDebits,
    totalCredits,
    balances,
    errors,
  };
}
