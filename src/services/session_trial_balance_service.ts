/**
 * Session-scoped trial balance: adjusted or unadjusted with mapping status.
 */

import type { Pool } from 'pg';
import type { CloseSession } from '../types/close_session.js';
import { getAdjustedTrialBalance } from './adjusted_trial_balance_service.js';
import { getUnadjustedOrRollup } from './trial_balance_rollup_service.js';
import { checkMappingCompleteness } from './mapping_completeness_gate.js';
import * as coaRepository from '../db/repositories/coa_repository.js';
import { from as decimalFrom } from '../utils/decimal.js';

export interface SessionTrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalance: string;
  creditBalance: string;
  netBalance: string;
  mappingReportingLineId: string | null;
  mappingReportingLineName: string | null;
  mappingStatus: 'mapped' | 'unmapped';
}

export interface SessionTrialBalanceResult {
  periodLabel: string;
  isAdjusted: boolean;
  totalDebits: string;
  totalCredits: string;
  balanced: boolean;
  rows: SessionTrialBalanceRow[];
}

function periodLabelFromSession(session: CloseSession): string {
  return (session.periodEnd ?? '').length >= 7 ? (session.periodEnd ?? '').slice(0, 7) : '';
}

export async function getSessionTrialBalance(
  pool: Pool,
  tenantId: string,
  session: CloseSession,
  type: 'adjusted' | 'unadjusted'
): Promise<SessionTrialBalanceResult | null> {
  const periodLabel = periodLabelFromSession(session);
  const entityId = session.entityId ?? '';
  console.log(`[TB_GET] tenantId=${tenantId}, periodLabel=${periodLabel}, sessionId=${session.id}, type=${type}, periodEnd=${session.periodEnd}`);

  let entries: Array<{ accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }>;
  if (type === 'adjusted') {
    try {
      entries = await getAdjustedTrialBalance(tenantId, periodLabel, pool, session.id);
    } catch (err) {
      console.log(`[TB_GET] adjusted TB error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  } else {
    const unadj = await getUnadjustedOrRollup(tenantId, periodLabel, pool);
    console.log(`[TB_GET] unadjusted result: ${unadj ? `found ${unadj.entries.length} entries, source=${unadj.source}` : 'null'}`);
    if (!unadj) return null;
    entries = unadj.entries;
  }

  const mappingResult = await checkMappingCompleteness(pool, tenantId, session.id, entityId);
  const unmappedSet = new Set(
    mappingResult.unmapped_accounts.map((u) => (u.account_code || u.account_name || '').trim()).filter(Boolean)
  );
  const mappedByAccount = new Map<string, string>();
  // All accounts not in unmapped are mapped; we need mapped_fs_line_id per account.
  // The mapping gate doesn't return per-account mapping. We'd need to call listCoaMappingRules and match.
  const rules = await import('../db/repositories/coa_mapping_rules_repository.js').then((m) =>
    m.listCoaMappingRules(pool, tenantId, entityId, { asOfDate: session.periodEnd ?? undefined })
  );
  const patternToRegExp = (p: string) => {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
  };
  for (const rule of rules) {
    const nameRe = patternToRegExp(rule.sourceAccountNamePattern);
    for (const e of entries) {
      const name = (e.accountName ?? '').trim();
      const code = (e.accountCode ?? '').trim();
      if (nameRe.test(name)) {
        if (!rule.sourceAccountNumberPattern || rule.sourceAccountNumberPattern === '') {
          mappedByAccount.set(code || name, rule.mappedFsLineId);
        } else {
          const numRe = patternToRegExp(rule.sourceAccountNumberPattern);
          if (numRe.test(code)) mappedByAccount.set(code || name, rule.mappedFsLineId);
        }
      }
    }
  }

  const coaAccounts = await coaRepository.getAccountsByTenant(pool, tenantId);
  const coaMap = new Map(coaAccounts.map((a) => [a.account_code, a]));

  let totalDebits = decimalFrom(0);
  let totalCredits = decimalFrom(0);
  const rows: SessionTrialBalanceRow[] = [];

  for (const e of entries) {
    const code = (e.accountCode ?? e.accountName ?? '').trim();
    const name = e.accountName ?? '';
    const debit = decimalFrom(e.debit ?? 0);
    const credit = decimalFrom(e.credit ?? 0);
    totalDebits = totalDebits.plus(debit);
    totalCredits = totalCredits.plus(credit);
    const net = debit.minus(credit);
    const account = coaMap.get(code);
    const mappingLineId = mappedByAccount.get(code) ?? null;
    const mappingStatus: 'mapped' | 'unmapped' = unmappedSet.has(code) ? 'unmapped' : 'mapped';

    rows.push({
      accountCode: code,
      accountName: (name || account?.account_name) ?? code,
      accountType: account?.account_type ?? e.accountType ?? 'UNKNOWN',
      debitBalance: debit.toDecimalPlaces(2).toString(),
      creditBalance: credit.toDecimalPlaces(2).toString(),
      netBalance: net.toDecimalPlaces(2).toString(),
      mappingReportingLineId: mappingLineId,
      mappingReportingLineName: mappingLineId, // taxonomy name lookup would require fs_taxonomy_lines
      mappingStatus,
    });
  }

  const balanced = totalDebits.minus(totalCredits).abs().lessThan(0.01);

  return {
    periodLabel,
    isAdjusted: type === 'adjusted',
    totalDebits: totalDebits.toDecimalPlaces(2).toString(),
    totalCredits: totalCredits.toDecimalPlaces(2).toString(),
    balanced,
    rows,
  };
}
