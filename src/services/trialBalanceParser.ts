/**
 * Trial Balance parser — normalizes raw rows to TrialBalanceEntry[]
 * Zero tolerance for balancing errors (CPA mode).
 */

import type { TrialBalanceEntry, TrialBalanceResult } from '../types/financial.js';

export interface RawTrialBalanceRow {
  accountCode?: string;
  accountName: string;
  debit: number;
  credit: number;
}

/** Normalize number from string (handles commas, parentheses for negatives) */
function parseAmount(value: unknown): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (s === '' || s === '-') return 0;
  // Parentheses = negative (accounting convention)
  if (s.startsWith('(') && s.endsWith(')')) {
    return -parseFloat(s.slice(1, -1)) || 0;
  }
  return parseFloat(s) || 0;
}

/** Parse raw rows into TrialBalanceEntry[] and validate balance */
export function parseTrialBalance(rows: RawTrialBalanceRow[]): TrialBalanceResult {
  const entries: TrialBalanceEntry[] = [];
  let totalDebits = 0;
  let totalCredits = 0;
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

    totalDebits += debit;
    totalCredits += credit;

    entries.push({
      accountCode: row?.accountCode != null ? String(row.accountCode).trim() : undefined,
      accountName,
      debit,
      credit,
      sourceRowIndex: i,
    });
  }

  const tolerance = 0.01;
  const balances = Math.abs(totalDebits - totalCredits) < tolerance;
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
