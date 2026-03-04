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
  /** Prior period net balance (when includePrior=true) */
  priorNetBalance?: string | null;
  /** Change = current net - prior net */
  changeAmount?: string | null;
  /** Change % = (current - prior) / |prior| * 100 */
  changePercent?: string | null;
  /** Account exists in current but not prior */
  isNew?: boolean;
  /** Account had balance in prior but zero in current */
  isInactive?: boolean;
  /** Original currency if all GL lines for this account share the same currency */
  originalCurrency?: string | null;
  /** Original debit in original currency (before translation) */
  originalDebit?: string | null;
  /** Original credit in original currency (before translation) */
  originalCredit?: string | null;
  /** Exchange rate used for translation */
  exchangeRate?: string | null;
}

export interface SessionTrialBalanceResult {
  periodLabel: string;
  priorPeriodLabel?: string | null;
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
  type: 'adjusted' | 'unadjusted',
  includePrior?: boolean
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

  // Enrich rows with original currency data from GL
  try {
    const glCurrencyRows = await pool.query<{
      account_code: string;
      original_currency: string | null;
      total_original_debit: string;
      total_original_credit: string;
      avg_exchange_rate: string;
      currency_count: string;
    }>(
      `SELECT account_code,
              original_currency,
              SUM(COALESCE(original_debit, 0))::text AS total_original_debit,
              SUM(COALESCE(original_credit, 0))::text AS total_original_credit,
              AVG(exchange_rate)::text AS avg_exchange_rate,
              COUNT(DISTINCT original_currency)::text AS currency_count
       FROM core.general_ledger
       WHERE tenant_id = $1 AND period_label = $2 AND original_currency IS NOT NULL
       GROUP BY account_code, original_currency`,
      [tenantId, periodLabel]
    );
    const currencyMap = new Map<string, { currency: string; origDebit: string; origCredit: string; rate: string }>();
    for (const cr of glCurrencyRows.rows) {
      if (cr.original_currency && Number(cr.currency_count) === 1) {
        currencyMap.set(cr.account_code, {
          currency: cr.original_currency,
          origDebit: decimalFrom(cr.total_original_debit).toDecimalPlaces(2).toString(),
          origCredit: decimalFrom(cr.total_original_credit).toDecimalPlaces(2).toString(),
          rate: decimalFrom(cr.avg_exchange_rate).toDecimalPlaces(8).toString(),
        });
      }
    }
    for (const row of rows) {
      const cd = currencyMap.get(row.accountCode);
      if (cd) {
        row.originalCurrency = cd.currency;
        row.originalDebit = cd.origDebit;
        row.originalCredit = cd.origCredit;
        row.exchangeRate = cd.rate;
      }
    }
  } catch {
    // original_currency columns may not exist yet — silently skip enrichment
  }

  // Prior period comparison
  let priorPeriodLabel: string | null = null;
  if (includePrior) {
    try {
      const { listCloseSessions } = await import('../db/repositories/close_session_repository.js');
      const allSessions = await listCloseSessions(pool, tenantId, entityId);
      const priorSession = allSessions
        .filter((s) => s.id !== session.id && (s.periodEnd ?? '') < (session.periodEnd ?? ''))
        .sort((a, b) => (b.periodEnd ?? '').localeCompare(a.periodEnd ?? ''))[0];

      if (priorSession) {
        const priorLabel = periodLabelFromSession(priorSession);
        priorPeriodLabel = priorLabel;
        let priorEntries: Array<{ accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }>;
        if (type === 'adjusted') {
          try {
            priorEntries = await getAdjustedTrialBalance(tenantId, priorLabel, pool, priorSession.id);
          } catch {
            priorEntries = [];
          }
        } else {
          const unadj = await getUnadjustedOrRollup(tenantId, priorLabel, pool);
          priorEntries = unadj?.entries ?? [];
        }

        // Build prior balances map by account code
        const priorMap = new Map<string, { debit: number; credit: number }>();
        for (const pe of priorEntries) {
          const code = (pe.accountCode ?? pe.accountName ?? '').trim();
          priorMap.set(code, { debit: pe.debit ?? 0, credit: pe.credit ?? 0 });
        }

        // Current account codes
        const currentCodes = new Set(rows.map((r) => r.accountCode));

        // Enrich current rows with prior data
        for (const row of rows) {
          const prior = priorMap.get(row.accountCode);
          if (prior) {
            const priorNet = decimalFrom(prior.debit).minus(decimalFrom(prior.credit));
            const currentNet = decimalFrom(row.netBalance);
            const change = currentNet.minus(priorNet);
            row.priorNetBalance = priorNet.toDecimalPlaces(2).toString();
            row.changeAmount = change.toDecimalPlaces(2).toString();
            row.changePercent = priorNet.abs().greaterThan(0)
              ? change.div(priorNet.abs()).times(100).toDecimalPlaces(1).toString()
              : currentNet.abs().greaterThan(0) ? null : '0.0';
            row.isNew = false;
            row.isInactive = false;
          } else {
            row.priorNetBalance = null;
            row.changeAmount = row.netBalance;
            row.changePercent = null;
            row.isNew = true;
            row.isInactive = false;
          }
        }

        // Add inactive accounts (in prior but not in current)
        for (const [code, prior] of priorMap) {
          if (!currentCodes.has(code)) {
            const priorNet = decimalFrom(prior.debit).minus(decimalFrom(prior.credit));
            if (priorNet.abs().greaterThan(0)) {
              rows.push({
                accountCode: code,
                accountName: code,
                accountType: 'UNKNOWN',
                debitBalance: '0.00',
                creditBalance: '0.00',
                netBalance: '0.00',
                mappingReportingLineId: null,
                mappingReportingLineName: null,
                mappingStatus: 'unmapped',
                priorNetBalance: priorNet.toDecimalPlaces(2).toString(),
                changeAmount: priorNet.negated().toDecimalPlaces(2).toString(),
                changePercent: '-100.0',
                isNew: false,
                isInactive: true,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[TB_GET] prior period lookup failed (non-fatal):', (err as Error).message);
    }
  }

  return {
    periodLabel,
    priorPeriodLabel,
    isAdjusted: type === 'adjusted',
    totalDebits: totalDebits.toDecimalPlaces(2).toString(),
    totalCredits: totalCredits.toDecimalPlaces(2).toString(),
    balanced,
    rows,
  };
}
