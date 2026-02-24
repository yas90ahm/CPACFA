/**
 * Statement drill-down: accounts per line item, GL entries per account.
 */

import type { Pool } from 'pg';
import * as statementPackageRepo from '../db/repositories/statement_package_repository.js';
import { getAdjustedTrialBalance } from './adjusted_trial_balance_service.js';
import { getSession } from './close_session_service.js';
import * as glRepository from '../db/repositories/general_ledger_repository.js';
import * as jeRepository from '../db/repositories/journal_entry_repository.js';
import * as coaRepository from '../db/repositories/coa_repository.js';
import { normalizeMoney, minus } from '../utils/decimal.js';

function periodLabelFromSession(session: { periodEnd: string }): string {
  return session.periodEnd.slice(0, 7);
}

/** Accounts that roll up to a statement line item. */
export interface AccountForLineItem {
  accountCode: string;
  accountName: string;
  balance: string;
  entryCount?: number;
}

/** Response for GET .../lines/:lineId/accounts */
export interface AccountsForLineItemResult {
  lineItemId: string;
  lineItemName: string;
  statement: string;
  totalAmount: string;
  accounts: AccountForLineItem[];
}

/**
 * Get accounts that compose a statement line item.
 * Uses accountCode(s) from statement line metadata (populated during generation).
 */
export async function getAccountsForLineItem(
  pool: Pool,
  tenantId: string,
  sessionId: string,
  pkgId: string,
  lineId: string
): Promise<AccountsForLineItemResult | null> {
  const pkg = await statementPackageRepo.getStatementPackageById(pool, tenantId, pkgId);
  if (!pkg || pkg.closeSessionId !== sessionId) return null;

  const line = await statementPackageRepo.getStatementLineByFsLineId(pool, pkgId, lineId);
  if (!line) return null;

  const accountCodes: string[] = [];
  if (line.metadata) {
    const meta = line.metadata as { accountCode?: string; accountCodes?: string[] };
    if (meta.accountCode) accountCodes.push(meta.accountCode);
    if (Array.isArray(meta.accountCodes)) accountCodes.push(...meta.accountCodes);
  }

  const session = await getSession(pool, tenantId, sessionId);
  if (!session) return null;

  const periodLabel = periodLabelFromSession(session);
  let entries: Array<{ accountCode?: string; accountName: string; debit: number; credit: number }> = [];
  try {
    entries = await getAdjustedTrialBalance(tenantId, periodLabel, pool, sessionId);
  } catch {
    /* no TB */
  }

  const tbByCode = new Map<string, { accountName: string; debit: number; credit: number }>();
  for (const e of entries) {
    const code = (e.accountCode ?? e.accountName ?? '').trim();
    if (code) tbByCode.set(code, { accountName: e.accountName, debit: e.debit ?? 0, credit: e.credit ?? 0 });
  }

  const accounts: AccountForLineItem[] = [];
  const seen = new Set<string>();
  for (const code of accountCodes) {
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const tbRow = tbByCode.get(code);
    const netBalance = tbRow ? minus(tbRow.debit, tbRow.credit) : 0;
    const balanceStr = normalizeMoney(netBalance);
    accounts.push({
      accountCode: code,
      accountName: tbRow?.accountName ?? code,
      balance: balanceStr,
    });
  }
  if (accountCodes.length === 0) {
    return {
      lineItemId: lineId,
      lineItemName: ((line.metadata as { label?: string })?.label) ?? line.fsLineId,
      statement: line.statement,
      totalAmount: normalizeMoney(line.amount),
      accounts: [],
    };
  }

  const label = ((line.metadata as { label?: string })?.label) ?? line.fsLineId;
  return {
    lineItemId: lineId,
    lineItemName: label,
    statement: line.statement,
    totalAmount: normalizeMoney(line.amount),
    accounts,
  };
}

/** Single GL or JE entry for drill-down. */
export interface EntryForAccount {
  id: string;
  date: string;
  description: string | null;
  debit: string;
  credit: string;
  source: 'gl_import' | 'adjusting_entry';
  jeId: string | null;
  jeNumber: string | null;
}

/** Response for GET .../trial-balance/:accountCode/entries */
export interface EntriesForAccountResult {
  accountCode: string;
  accountName: string;
  entries: EntryForAccount[];
}

/**
 * Get GL entries and posted AJE lines for an account in a close session's period.
 */
export async function getEntriesForAccount(
  pool: Pool,
  tenantId: string,
  sessionId: string,
  accountCode: string
): Promise<EntriesForAccountResult | null> {
  const session = await getSession(pool, tenantId, sessionId);
  if (!session) return null;

  const periodLabel = periodLabelFromSession(session);

  const glLines = await glRepository.getGLForPeriod(pool, tenantId, periodLabel);
  const glForAccount = glLines.filter((l) => l.account_code === accountCode);

  const postedJEs = await jeRepository.listJournalEntries(pool, tenantId, {
    closeSessionId: sessionId,
    status: 'posted',
  });
  const ajeLines: Array<{ id: string; date: string; description: string | null; debit: number; credit: number; jeId: string; jeNumber: string }> = [];
  for (const je of postedJEs) {
    const lines = await jeRepository.listJournalEntryLines(pool, je.id);
    for (const jel of lines) {
      if (jel.accountRef === accountCode) {
        ajeLines.push({
          id: `${je.id}-${jel.lineIndex}`,
          date: je.postedAt ?? je.createdAt ?? '',
          description: jel.description ?? je.memo ?? null,
          debit: jel.debit ?? 0,
          credit: jel.credit ?? 0,
          jeId: je.id,
          jeNumber: je.id,
        });
      }
    }
  }

  const entries: EntryForAccount[] = [
    ...glForAccount.map((r) => ({
      id: r.id ?? `${r.entry_id}-${r.line_number}`,
      date: typeof r.entry_date === 'string' ? r.entry_date : (r.entry_date as Date).toISOString().slice(0, 10),
      description: r.description ?? null,
      debit: String(r.debit ?? 0),
      credit: String(r.credit ?? 0),
      source: 'gl_import' as const,
      jeId: null as string | null,
      jeNumber: null as string | null,
    })),
    ...ajeLines.map((r) => ({
      id: r.id,
      date: typeof r.date === 'string' ? r.date : (r.date as Date).toISOString().slice(0, 10),
      description: r.description,
      debit: String(r.debit),
      credit: String(r.credit),
      source: 'adjusting_entry' as const,
      jeId: r.jeId,
      jeNumber: r.jeNumber,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const coaAccount = await coaRepository.getAccountByCode(pool, tenantId, accountCode);
  const accountName = coaAccount?.account_name ?? accountCode;

  return {
    accountCode,
    accountName,
    entries,
  };
}
