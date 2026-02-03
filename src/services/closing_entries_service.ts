/**
 * Closing entries: from adjusted TB, suggest JEs to close revenue and expense to retained earnings.
 * User adds suggestion as adjustment and posts like any other close adjustment.
 */

import type { TrialBalanceEntry } from '../types/financial.js';
import type { JournalEntrySuggestion } from '../types/close_and_controls.js';
import { classifyTrialBalanceDeterministic } from './accountClassifier.js';

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
    const balance = (e.credit ?? 0) - (e.debit ?? 0);
    if (Math.abs(balance) < 0.01) continue;
    totalRevenue += balance;
    debits.push({ account: e.accountName ?? e.accountCode ?? 'Revenue', amount: balance });
  }

  let totalExpense = 0;
  for (const e of expenseEntries) {
    const balance = (e.debit ?? 0) - (e.credit ?? 0);
    if (Math.abs(balance) < 0.01) continue;
    totalExpense += balance;
    credits.push({ account: e.accountName ?? e.accountCode ?? 'Expense', amount: balance });
  }

  const netIncome = totalRevenue - totalExpense;
  if (Math.abs(netIncome) < 0.01 && debits.length === 0 && credits.length === 0) {
    return null;
  }

  if (netIncome > 0) {
    credits.push({ account: revenueLabel, amount: netIncome });
  } else if (netIncome < 0) {
    debits.push({ account: revenueLabel, amount: -netIncome });
  }

  const totalDebit = debits.reduce((s, d) => s + d.amount, 0);
  const totalCredit = credits.reduce((s, c) => s + c.amount, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.02) {
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
