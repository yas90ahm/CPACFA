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

/** Convert SQL-style pattern (% = any) to RegExp. Matches coa_mapping_service logic. */
function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Return true if account matches rule (name and optional number). */
function ruleMatches(
  rule: CoaMappingRule,
  accountName: string,
  accountNumber?: string
): boolean {
  const nameRe = patternToRegExp(rule.sourceAccountNamePattern);
  if (!nameRe.test((accountName ?? '').trim())) return false;
  if (rule.sourceAccountNumberPattern != null && rule.sourceAccountNumberPattern !== '') {
    const num = (accountNumber ?? '').trim();
    const numRe = patternToRegExp(rule.sourceAccountNumberPattern);
    if (!numRe.test(num)) return false;
  }
  return true;
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
    return {
      passes: true,
      total_accounts: 0,
      mapped_accounts: 0,
      unmapped_accounts: [],
    };
  }
  const periodLabel = session.periodEnd?.slice(0, 7);
  if (!periodLabel) {
    return {
      passes: true,
      total_accounts: 0,
      mapped_accounts: 0,
      unmapped_accounts: [],
    };
  }

  let tb;
  try {
    tb = await getTrialBalanceForCertification(pool, tenantId, periodLabel, periodId);
  } catch {
    return {
      passes: true,
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

  const unmapped: UnmappedAccount[] = [];
  for (const e of entries) {
    const accountName = (e as { accountName?: string }).accountName ?? (e as { account_name?: string }).account_name ?? '';
    const accountCode = (e as { accountCode?: string }).accountCode ?? (e as { account_code?: string }).account_code ?? '';
    const accountType = (e as { accountType?: string }).accountType ?? (e as { account_type?: string }).account_type ?? '';
    const debit = (e as { debit?: number }).debit ?? 0;
    const credit = (e as { credit?: number }).credit ?? 0;

    const code = accountCode || accountName;
    if (!code) continue;

    const matched = rules.some((r) => ruleMatches(r, accountName, accountCode || undefined));
    if (!matched) {
      unmapped.push({
        account_code: accountCode || '',
        account_name: accountName,
        account_type: String(accountType ?? ''),
        balance: formatBalance(debit, credit, accountType),
      });
    }
  }

  const mapped = entries.filter((e) => {
    const accountName = (e as { accountName?: string }).accountName ?? (e as { account_name?: string }).account_name ?? '';
    const accountCode = (e as { accountCode?: string }).accountCode ?? (e as { account_code?: string }).account_code ?? '';
    const code = accountCode || accountName;
    if (!code) return false;
    return rules.some((r) => ruleMatches(r, accountName, accountCode || undefined));
  }).length;

  return {
    passes: unmapped.length === 0,
    total_accounts: entries.length,
    mapped_accounts: mapped,
    unmapped_accounts: unmapped,
  };
}
