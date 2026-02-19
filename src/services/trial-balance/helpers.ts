/**
 * Trial balance helpers for formatting ledger data for agent context (e.g. self-correction loop).
 * No hardcoded account names or amounts — works on any CSV/session data.
 * Money values use Decimal.js for precision.
 */

import type { SessionSnapshot } from '../persistence_service.js';
import { round2, from } from '../../utils/decimal.js';

/** Minimal trial balance row for context formatting. */
export interface TrialBalanceEntryForContext {
  accountName?: string;
  debit?: number;
  credit?: number;
  accountCode?: string;
}

const MAX_ENTRIES_FOR_CONTEXT = 40;

/**
 * Format a ledger for injection into agent context (e.g. recovery observation).
 * Returns a string: "Account Name | Debit | Credit | Description".
 * Smart truncation: if more than 40 entries, sort by absolute value (largest first) and include
 * a '...' indicator for omitted rows to keep the context window efficient.
 */
export function formatLedgerForContext(entries: TrialBalanceEntryForContext[]): string {
  if (!entries || entries.length === 0) {
    return '(No ledger entries)';
  }

  const header = 'Account Name | Debit | Credit | Description';
  const rows = entries.map((e) => {
    const debit = round2(e.debit ?? 0);
    const credit = round2(e.credit ?? 0);
    const absValue = from(debit).greaterThan(credit) ? debit : credit;
    return {
      accountName: String(e.accountName ?? '').trim() || '—',
      debit,
      credit,
      description: String(e.accountCode ?? '').trim() || '—',
      absValue,
    };
  });

  let toShow = rows;
  let omitted = 0;
  if (rows.length > MAX_ENTRIES_FOR_CONTEXT) {
    const sorted = [...rows].sort((a, b) => b.absValue - a.absValue);
    toShow = sorted.slice(0, MAX_ENTRIES_FOR_CONTEXT);
    omitted = rows.length - MAX_ENTRIES_FOR_CONTEXT;
  }

  const lines = [
    header,
    ...toShow.map(
      (r) =>
        `${r.accountName} | ${r.debit.toLocaleString()} | ${r.credit.toLocaleString()} | ${r.description}`
    ),
  ];
  if (omitted > 0) {
    lines.push(`... (${omitted} more row(s) omitted for context)`);
  }
  return lines.join('\n');
}

/**
 * Extract trial balance entries from a session snapshot (raw_rows or statements output).
 * Used by the self-correction loop to inject current ledger state into the agent context.
 */
export function getEntriesFromSessionSnapshot(snapshot: SessionSnapshot | undefined): TrialBalanceEntryForContext[] {
  if (!snapshot || typeof snapshot !== 'object' || !('type' in snapshot)) {
    return [];
  }
  if (snapshot.type === 'raw_rows' && Array.isArray(snapshot.rawRows)) {
    return snapshot.rawRows.map((r) => ({
      accountName: r.accountName,
      debit: r.debit,
      credit: r.credit,
      accountCode: r.accountCode,
    }));
  }
  if (
    snapshot.type === 'statements' &&
    snapshot.output?.trialBalance?.entries &&
    Array.isArray(snapshot.output.trialBalance.entries)
  ) {
    return snapshot.output.trialBalance.entries.map((r) => ({
      accountName: r.accountName,
      debit: r.debit,
      credit: r.credit,
      accountCode: r.accountCode,
    }));
  }
  return [];
}
