/**
 * Closing entries: from adjusted TB, suggest JEs to close revenue and expense to retained earnings.
 * User adds suggestion as adjustment and posts like any other close adjustment.
 */

import type { TrialBalanceEntry } from '../types/financial.js';
import type { JournalEntrySuggestion } from '../types/close_and_controls.js';
import { classifyTrialBalanceDeterministic } from './accountClassifier.js';
import { from, plus, minus, round2, sumRound2 } from '../utils/decimal.js';

const RETAINED_EARNINGS_LABEL = 'Retained Earnings';

/**
 * Compute suggested closing entry (one JE) that closes all revenue and expense to Retained Earnings.
 * - Revenue accounts (credit balance): Debit each to zero → Credit Retained Earnings (total revenue).
 * - Expense accounts (debit balance): Credit each to zero → Debit Retained Earnings (total expense).
 * Net income = total revenue - total expense; we Credit Retained Earnings for net income (or Debit for net loss).
 * Returns one JournalEntrySuggestion, or empty if no revenue/expense to close.
 */
export function buildClosingEntrySuggestion(
  entries: TrialBalanceEntry[],
  options?: { retainedEarningsLabel?: string }
): JournalEntrySuggestion | null {
  const classified = classifyTrialBalanceDeterministic(entries);
  const revenueLabel = options?.retainedEarningsLabel ?? RETAINED_EARNINGS_LABEL;

  const revenueEntries = classified.filter((e) => e.accountType === 'REVENUE');
  const expenseEntries = classified.filter((e) => e.accountType === 'EXPENSE');

  const debits: { account: string; amount: number }[] = [];
  const credits: { account: string; amount: number }[] = [];

  let totalRevenue = 0;
  for (const e of revenueEntries) {
    const balance = round2(minus(e.credit ?? 0, e.debit ?? 0));
    if (from(balance).abs().lessThan(0.01)) continue;
    totalRevenue = plus(totalRevenue, balance);
    debits.push({ account: e.accountName ?? e.accountCode ?? 'Revenue', amount: balance });
  }

  let totalExpense = 0;
  for (const e of expenseEntries) {
    const balance = round2(minus(e.debit ?? 0, e.credit ?? 0));
    if (from(balance).abs().lessThan(0.01)) continue;
    totalExpense = plus(totalExpense, balance);
    credits.push({ account: e.accountName ?? e.accountCode ?? 'Expense', amount: balance });
  }

  const netIncome = minus(totalRevenue, totalExpense);
  if (from(netIncome).abs().lessThan(0.01) && debits.length === 0 && credits.length === 0) {
    return null;
  }

  if (netIncome > 0) {
    credits.push({ account: revenueLabel, amount: netIncome });
  } else if (netIncome < 0) {
    debits.push({ account: revenueLabel, amount: round2(-netIncome) });
  }

  const totalDebit = sumRound2(debits.map((d) => d.amount));
  const totalCredit = sumRound2(credits.map((c) => c.amount));
  if (from(totalDebit).minus(totalCredit).abs().greaterThan(0.02)) {
    return null;
  }

  return {
    id: `closing-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    description: 'Period closing entry (revenue and expense to retained earnings)',
    debits,
    credits,
    source: 'manual',
    sourceDetail: 'Closing entries from adjusted trial balance',
    confidence: 1,
  };
}
