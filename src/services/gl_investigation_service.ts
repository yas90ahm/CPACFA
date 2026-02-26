/**
 * GL Investigation Engine (Layer 1) — deterministic, Decimal.js only, zero AI.
 *
 * Answers: "For a given FS line item and two periods, what accounts drove the change?"
 * All arithmetic uses Decimal.js. No AI imports. No financial table writes.
 */

import type { Pool } from 'pg';
import { from, minus, plus, div, round2 } from '../utils/decimal.js';
import type { CoaMappingRule } from '../types/coa_mapping.js';
import type { AccountType } from '../types/financial.js';
import * as rulesRepo from '../db/repositories/coa_mapping_rules_repository.js';
import * as taxonomyRepo from '../db/repositories/fs_taxonomy_repository.js';
import { classifyAccount } from './accountClassifier.js';
import type {
  InvestigationParams,
  InvestigationResult,
  ContributingAccount,
  AccountDrilldownParams,
  AccountDrilldownResult,
  GLEntryDetail,
} from '../types/investigation.js';

/* ── Helpers ──────────────────────────────────────────────────── */

const DEFAULT_FS_LINE_BY_TYPE: Record<AccountType, string> = {
  ASSET: 'fs_asset',
  LIABILITY: 'fs_liability',
  EQUITY: 'fs_equity',
  REVENUE: 'fs_revenue',
  EXPENSE: 'fs_expense',
};

/** Convert SQL LIKE pattern (% = any) to RegExp. Deterministic. */
function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Check if account matches a mapping rule (name and optional number pattern). */
function ruleMatches(rule: CoaMappingRule, accountName: string, accountCode?: string): boolean {
  const nameRe = patternToRegExp(rule.sourceAccountNamePattern);
  if (!nameRe.test(accountName.trim())) return false;
  if (rule.sourceAccountNumberPattern != null && rule.sourceAccountNumberPattern !== '') {
    const numRe = patternToRegExp(rule.sourceAccountNumberPattern);
    if (!numRe.test((accountCode ?? '').trim())) return false;
  }
  return true;
}

/** Resolve fsLineId for an account: rules first, then classifier fallback. */
function resolveAccountFsLineId(
  rules: CoaMappingRule[],
  accountName: string,
  accountCode: string,
): string {
  for (const rule of rules) {
    if (ruleMatches(rule, accountName, accountCode)) {
      return rule.mappedFsLineId;
    }
  }
  const { accountType } = classifyAccount(accountName);
  return DEFAULT_FS_LINE_BY_TYPE[accountType];
}

/** Format period dates as readable label: "Jan 2025 vs Dec 2024". */
function buildPeriodLabel(currentStart: string, priorStart: string): string {
  const fmt = (d: string) => {
    const dt = new Date(d + 'T00:00:00Z');
    return dt.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  return `${fmt(currentStart)} vs ${fmt(priorStart)}`;
}

/** Decimal string with 2dp. */
function ds(value: number | string): string {
  return from(value).toDecimalPlaces(2).toFixed(2);
}

/* ── DB row interfaces ────────────────────────────────────────── */

interface AccountBalanceRow {
  account_code: string;
  account_name: string;
  account_type: string;
  current_debit: string;
  current_credit: string;
  prior_debit: string;
  prior_credit: string;
  current_tx_count: string;
  prior_tx_count: string;
}

interface MemoRow {
  account_code: string;
  description: string;
  cnt: string;
}

interface GLDetailRow {
  entry_date: string | Date;
  entry_id: string;
  description: string | null;
  debit: string;
  credit: string;
  source: string;
}

/* ── Main investigation ───────────────────────────────────────── */

export async function investigateVariance(
  pool: Pool,
  params: InvestigationParams,
): Promise<InvestigationResult> {
  const {
    tenantId,
    entityId,
    fsLineId,
    currentPeriodStart,
    currentPeriodEnd,
    priorPeriodStart,
    priorPeriodEnd,
  } = params;

  // 1. Load FS taxonomy line for label and normal_balance
  const fsLine = await taxonomyRepo.getFsTaxonomyLineById(pool, fsLineId);
  const fsLineLabel = fsLine?.name ?? fsLineId;
  const isCreditNormal = fsLine?.normalBalance === 'credit';

  // 2. Load mapping rules for entity
  const rules = await rulesRepo.listCoaMappingRules(pool, tenantId, entityId);

  // 3. Query all accounts with balances for both periods (single GROUP BY)
  const balanceResult = await pool.query<AccountBalanceRow>(
    `SELECT
       gl.account_code,
       COALESCE(coa.account_name, gl.account_code) AS account_name,
       COALESCE(coa.account_type, '') AS account_type,
       SUM(CASE WHEN gl.entry_date >= $2 AND gl.entry_date <= $3
                THEN gl.debit ELSE 0 END)::text AS current_debit,
       SUM(CASE WHEN gl.entry_date >= $2 AND gl.entry_date <= $3
                THEN gl.credit ELSE 0 END)::text AS current_credit,
       SUM(CASE WHEN gl.entry_date >= $4 AND gl.entry_date <= $5
                THEN gl.debit ELSE 0 END)::text AS prior_debit,
       SUM(CASE WHEN gl.entry_date >= $4 AND gl.entry_date <= $5
                THEN gl.credit ELSE 0 END)::text AS prior_credit,
       COUNT(CASE WHEN gl.entry_date >= $2 AND gl.entry_date <= $3
                  THEN 1 END)::text AS current_tx_count,
       COUNT(CASE WHEN gl.entry_date >= $4 AND gl.entry_date <= $5
                  THEN 1 END)::text AS prior_tx_count
     FROM core.general_ledger gl
     LEFT JOIN core.tenant_chart_of_accounts coa
       ON gl.tenant_id = coa.tenant_id AND gl.account_code = coa.account_code
     WHERE gl.tenant_id = $1
       AND (
         (gl.entry_date >= $2 AND gl.entry_date <= $3)
         OR (gl.entry_date >= $4 AND gl.entry_date <= $5)
       )
     GROUP BY gl.account_code, coa.account_name, coa.account_type
     ORDER BY gl.account_code`,
    [tenantId, currentPeriodStart, currentPeriodEnd, priorPeriodStart, priorPeriodEnd],
  );

  // 4. Filter to accounts mapped to the target fsLineId
  const matchedRows: AccountBalanceRow[] = [];
  for (const row of balanceResult.rows) {
    const resolvedFsLine = resolveAccountFsLineId(rules, row.account_name, row.account_code);
    if (resolvedFsLine === fsLineId) {
      matchedRows.push(row);
    }
  }

  // 5. Compute balances and deltas using Decimal.js
  const accountCodes: string[] = [];
  const accountData: Array<{
    accountCode: string;
    accountName: string;
    currentBalance: number;
    priorBalance: number;
    changeAmount: number;
    txCount: number;
    priorTxCount: number;
  }> = [];

  for (const row of matchedRows) {
    const curDebit = round2(row.current_debit);
    const curCredit = round2(row.current_credit);
    const prDebit = round2(row.prior_debit);
    const prCredit = round2(row.prior_credit);

    // Net balance depends on normal_balance direction of the FS line
    const currentBalance = isCreditNormal
      ? minus(curCredit, curDebit)
      : minus(curDebit, curCredit);
    const priorBalance = isCreditNormal
      ? minus(prCredit, prDebit)
      : minus(prDebit, prCredit);
    const change = minus(currentBalance, priorBalance);

    accountCodes.push(row.account_code);
    accountData.push({
      accountCode: row.account_code,
      accountName: row.account_name,
      currentBalance,
      priorBalance,
      changeAmount: change,
      txCount: parseInt(row.current_tx_count, 10) || 0,
      priorTxCount: parseInt(row.prior_tx_count, 10) || 0,
    });
  }

  // 6. Compute line-level totals
  let currentTotalNum = 0;
  let priorTotalNum = 0;
  for (const a of accountData) {
    currentTotalNum = plus(currentTotalNum, a.currentBalance);
    priorTotalNum = plus(priorTotalNum, a.priorBalance);
  }
  const totalChange = minus(currentTotalNum, priorTotalNum);
  const totalChangeAbs = Math.abs(totalChange);

  // 7. Get top memos for matched accounts (current period only)
  const memoMap = new Map<string, string[]>();
  if (accountCodes.length > 0) {
    const memoResult = await pool.query<MemoRow>(
      `SELECT account_code, description, cnt FROM (
         SELECT
           gl.account_code,
           COALESCE(gl.description, '') AS description,
           COUNT(*)::text AS cnt,
           ROW_NUMBER() OVER (
             PARTITION BY gl.account_code ORDER BY COUNT(*) DESC
           ) AS rn
         FROM core.general_ledger gl
         WHERE gl.tenant_id = $1
           AND gl.entry_date >= $2 AND gl.entry_date <= $3
           AND gl.account_code = ANY($4)
           AND gl.description IS NOT NULL AND gl.description != ''
         GROUP BY gl.account_code, gl.description
       ) sub WHERE rn <= 3
       ORDER BY account_code, cnt DESC`,
      [tenantId, currentPeriodStart, currentPeriodEnd, accountCodes],
    );
    for (const row of memoResult.rows) {
      const memos = memoMap.get(row.account_code) ?? [];
      memos.push(row.description);
      memoMap.set(row.account_code, memos);
    }
  }

  // 8. Build contributing accounts, ranked by absolute change
  const sorted = [...accountData].sort(
    (a, b) => Math.abs(b.changeAmount) - Math.abs(a.changeAmount),
  );

  const contributingAccounts: ContributingAccount[] = sorted.map((a) => {
    const pctChange = a.priorBalance !== 0
      ? round2(div(a.changeAmount * 100, a.priorBalance))
      : 0;
    const pctOfTotal = totalChangeAbs > 0
      ? round2(div(a.changeAmount * 100, totalChange))
      : 0;

    let direction: ContributingAccount['direction'];
    if (a.priorBalance === 0 && a.currentBalance !== 0) direction = 'new';
    else if (a.currentBalance === 0 && a.priorBalance !== 0) direction = 'eliminated';
    else if (a.changeAmount >= 0) direction = 'increase';
    else direction = 'decrease';

    return {
      accountCode: a.accountCode,
      accountName: a.accountName,
      currentBalance: ds(a.currentBalance),
      priorBalance: ds(a.priorBalance),
      changeAmount: ds(a.changeAmount),
      changePercent: ds(pctChange),
      percentOfTotalChange: ds(pctOfTotal),
      direction,
      transactionCount: a.txCount,
      isRecurring: a.priorTxCount > 0,
      topMemos: memoMap.get(a.accountCode) ?? [],
    };
  });

  // 9. Compute line-level change percent
  const lineChangePercent = priorTotalNum !== 0
    ? round2(div(totalChange * 100, priorTotalNum))
    : 0;

  return {
    fsLineId,
    fsLineLabel,
    currentTotal: ds(currentTotalNum),
    priorTotal: ds(priorTotalNum),
    changeAmount: ds(totalChange),
    changePercent: ds(lineChangePercent),
    contributingAccounts,
    metadata: {
      accountsAnalyzed: balanceResult.rows.length,
      periodLabel: buildPeriodLabel(currentPeriodStart, priorPeriodStart),
      generatedAt: new Date().toISOString(),
      computationMethod: 'gl_detail',
    },
  };
}

/* ── Account drilldown ────────────────────────────────────────── */

export async function investigateAccount(
  pool: Pool,
  params: AccountDrilldownParams,
): Promise<AccountDrilldownResult> {
  const {
    tenantId,
    accountCode,
    currentPeriodStart,
    currentPeriodEnd,
    priorPeriodStart,
    priorPeriodEnd,
  } = params;

  // 1. Get account name from COA
  const coaResult = await pool.query<{ account_name: string }>(
    `SELECT account_name FROM core.tenant_chart_of_accounts
     WHERE tenant_id = $1 AND account_code = $2 LIMIT 1`,
    [tenantId, accountCode],
  );
  const accountName = coaResult.rows[0]?.account_name ?? accountCode;

  // 2. Get balances for both periods
  const balResult = await pool.query<{
    current_debit: string; current_credit: string;
    prior_debit: string; prior_credit: string;
  }>(
    `SELECT
       SUM(CASE WHEN entry_date >= $2 AND entry_date <= $3 THEN debit ELSE 0 END)::text AS current_debit,
       SUM(CASE WHEN entry_date >= $2 AND entry_date <= $3 THEN credit ELSE 0 END)::text AS current_credit,
       SUM(CASE WHEN entry_date >= $4 AND entry_date <= $5 THEN debit ELSE 0 END)::text AS prior_debit,
       SUM(CASE WHEN entry_date >= $4 AND entry_date <= $5 THEN credit ELSE 0 END)::text AS prior_credit
     FROM core.general_ledger
     WHERE tenant_id = $1 AND account_code = $6
       AND (
         (entry_date >= $2 AND entry_date <= $3)
         OR (entry_date >= $4 AND entry_date <= $5)
       )`,
    [tenantId, currentPeriodStart, currentPeriodEnd, priorPeriodStart, priorPeriodEnd, accountCode],
  );

  const bal = balResult.rows[0];
  const curDebit = round2(bal?.current_debit ?? '0');
  const curCredit = round2(bal?.current_credit ?? '0');
  const prDebit = round2(bal?.prior_debit ?? '0');
  const prCredit = round2(bal?.prior_credit ?? '0');

  // Use debit - credit for drilldown (raw net); consumer applies sign convention
  const currentBalance = minus(curDebit, curCredit);
  const priorBalance = minus(prDebit, prCredit);
  const changeAmount = minus(currentBalance, priorBalance);

  // 3. Get all GL entries for this account in current period
  const entriesResult = await pool.query<GLDetailRow>(
    `SELECT
       entry_date,
       entry_id,
       description,
       debit::text AS debit,
       credit::text AS credit,
       source
     FROM core.general_ledger
     WHERE tenant_id = $1
       AND account_code = $2
       AND entry_date >= $3 AND entry_date <= $4
     ORDER BY entry_date, entry_id, line_number`,
    [tenantId, accountCode, currentPeriodStart, currentPeriodEnd],
  );

  const entries: GLEntryDetail[] = entriesResult.rows.map((r) => ({
    date: typeof r.entry_date === 'string'
      ? r.entry_date.slice(0, 10)
      : (r.entry_date as Date).toISOString().slice(0, 10),
    journalEntryId: r.entry_id,
    memo: r.description ?? '',
    debit: ds(r.debit),
    credit: ds(r.credit),
    source: r.source,
  }));

  // 4. Build summary
  let totalDebits = 0;
  let totalCredits = 0;
  const jeIds = new Set<string>();
  let earliest = '';
  let latest = '';

  for (const e of entries) {
    totalDebits = plus(totalDebits, e.debit);
    totalCredits = plus(totalCredits, e.credit);
    if (e.journalEntryId) jeIds.add(e.journalEntryId);
    if (!earliest || e.date < earliest) earliest = e.date;
    if (!latest || e.date > latest) latest = e.date;
  }

  return {
    accountCode,
    accountName,
    currentBalance: ds(currentBalance),
    priorBalance: ds(priorBalance),
    changeAmount: ds(changeAmount),
    entries,
    summary: {
      totalEntries: entries.length,
      totalDebits: ds(totalDebits),
      totalCredits: ds(totalCredits),
      uniqueJournalEntries: jeIds.size,
      dateRange: { earliest, latest },
    },
  };
}
