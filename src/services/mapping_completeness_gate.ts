/**
 * Mapping Completeness Gate
 *
 * Hard gate: all TB accounts must have a COA mapping rule before advancement to UNDER_REVIEW.
 * Without this gate, unmapped accounts silently disappear from financial statements.
 */

import type { Pool } from 'pg';
import type { CoaMappingRule } from '../types/coa_mapping.js';
import { listCoaMappingRules } from '../db/repositories/coa_mapping_rules_repository.js';
import { getTrialBalanceForCertification } from './adjusted_trial_balance_service.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { ruleMatchesAccount } from '../utils/gl_pattern_matching.js';

export interface UnmappedAccount {
  account_code: string;
  account_name: string;
  account_type: string;
  balance: string;
}

export interface MappingCompletenessResult {
  passes: boolean;
  total_accounts: number;
  mapped_accounts: number;
  unmapped_accounts: UnmappedAccount[];
}

/** @deprecated Use ruleMatchesAccount from utils/gl_pattern_matching instead. Kept as thin wrapper for call-site compat. */
function ruleMatches(rule: CoaMappingRule, accountName: string, accountNumber?: string): boolean {
  return ruleMatchesAccount(rule, accountName, accountNumber);
}

/** Format balance for display (debit - credit for assets/expenses, credit - debit otherwise). */
function formatBalance(debit: number, credit: number, accountType?: string): string {
  const d = debit ?? 0;
  const c = credit ?? 0;
  const u = (accountType ?? '').toUpperCase();
  const net =
    u === 'LIABILITY' || u === 'EQUITY' || u === 'REVENUE'
      ? c - d
      : d - c;
  return net.toFixed(2);
}

/**
 * Check that all TB accounts have COA mapping rules.
 * Returns structured result for gate and HITL issue creation.
 */
export async function checkMappingCompleteness(
  pool: Pool,
  tenantId: string,
  periodId: string,
  entityId: string
): Promise<MappingCompletenessResult> {
  const session = await getCloseSessionById(pool, tenantId, periodId);
  if (!session) {
    // Fail-closed: cannot verify completeness without session data
    return {
      passes: false,
      total_accounts: 0,
      mapped_accounts: 0,
      unmapped_accounts: [],
    };
  }
  const periodLabel = session.periodEnd?.slice(0, 7);
  if (!periodLabel) {
    return {
      passes: false,
      total_accounts: 0,
      mapped_accounts: 0,
      unmapped_accounts: [],
    };
  }

  let tb;
  try {
    tb = await getTrialBalanceForCertification(pool, tenantId, periodLabel, periodId);
  } catch (err) {
    console.warn('[mapping_completeness_gate] TB retrieval failed, gate fails closed:', (err as Error).message);
    return {
      passes: false,
      total_accounts: 0,
      mapped_accounts: 0,
      unmapped_accounts: [],
    };
  }

  const entries = tb.trialBalance ?? [];
  if (entries.length === 0) {
    return {
      passes: true,
      total_accounts: 0,
      mapped_accounts: 0,
      unmapped_accounts: [],
    };
  }

  const rules = await listCoaMappingRules(pool, tenantId, entityId, {
    asOfDate: session.periodEnd ?? undefined,
  });

  // Fetch excluded accounts from gl_account_analysis (Quality Gate)
  const excludedSet = new Set<string>();
  try {
    const { rows: excludedRows } = await pool.query(
      `SELECT account_code FROM core.gl_account_analysis
       WHERE tenant_id = $1 AND close_session_id = $2 AND action_taken = 'excluded'`,
      [tenantId, periodId],
    );
    for (const r of excludedRows) {
      excludedSet.add(r.account_code as string);
    }
  } catch {
    // Table may not exist yet; silently continue
  }

  const unmapped: UnmappedAccount[] = [];
  for (const e of entries) {
    const accountName = (e as { accountName?: string }).accountName ?? (e as { account_name?: string }).account_name ?? '';
    const accountCode = (e as { accountCode?: string }).accountCode ?? (e as { account_code?: string }).account_code ?? '';
    const accountType = (e as { accountType?: string }).accountType ?? (e as { account_type?: string }).account_type ?? '';
    const debit = (e as { debit?: number }).debit ?? 0;
    const credit = (e as { credit?: number }).credit ?? 0;

    const code = accountCode || accountName;
    if (!code) continue;

    // Skip accounts excluded via GL Quality Gate
    if (excludedSet.has(code)) continue;

    const matched = rules.some((r) => ruleMatches(r, accountName, code || undefined));
    if (!matched) {
      unmapped.push({
        account_code: code,
        account_name: accountName,
        account_type: String(accountType ?? ''),
        balance: formatBalance(debit, credit, accountType),
      });
    }
  }

  // Count mapped, excluding accounts excluded via Quality Gate
  const mapped = entries.filter((e) => {
    const accountName = (e as { accountName?: string }).accountName ?? (e as { account_name?: string }).account_name ?? '';
    const accountCode = (e as { accountCode?: string }).accountCode ?? (e as { account_code?: string }).account_code ?? '';
    const code = accountCode || accountName;
    if (!code) return false;
    if (excludedSet.has(code)) return false;
    return rules.some((r) => ruleMatches(r, accountName, code || undefined));
  }).length;

  // Total excludes accounts excluded via Quality Gate
  const totalAfterExclusions = entries.filter((e) => {
    const accountCode = (e as { accountCode?: string }).accountCode ?? (e as { account_code?: string }).account_code ?? '';
    const accountName = (e as { accountName?: string }).accountName ?? (e as { account_name?: string }).account_name ?? '';
    const code = accountCode || accountName;
    return code && !excludedSet.has(code);
  }).length;

  return {
    passes: unmapped.length === 0,
    total_accounts: totalAfterExclusions,
    mapped_accounts: mapped,
    unmapped_accounts: unmapped,
  };
}
