/**
 * GL → Trial Balance aggregation service.
 * Aggregates journal entry lines into account-level TB format for certification.
 */

import type { Pool } from 'pg';
import type { GeneralLedgerLine } from '../types/general_ledger.js';
import type { TrialBalanceEntry, DerivedTrialBalance } from '../types/trial_balance_derived.js';
import type { CoaAccount } from '../types/coa.js';
import * as glRepository from '../db/repositories/general_ledger_repository.js';
import * as coaRepository from '../db/repositories/coa_repository.js';

/**
 * Aggregate GL lines into trial balance entries.
 * Groups by account_code, sums debits/credits.
 */
export function aggregateGLToTB(
  glLines: GeneralLedgerLine[],
  coaAccounts: CoaAccount[]
): TrialBalanceEntry[] {
  const coaMap = new Map<string, CoaAccount>();
  for (const a of coaAccounts) {
    coaMap.set(a.account_code, a);
  }

  const accountMap = new Map<
    string,
    { total_debits: number; total_credits: number }
  >();

  for (const line of glLines) {
    const existing = accountMap.get(line.account_code) ?? {
      total_debits: 0,
      total_credits: 0,
    };
    existing.total_debits += line.debit ?? 0;
    existing.total_credits += line.credit ?? 0;
    accountMap.set(line.account_code, existing);
  }

  const tbEntries: TrialBalanceEntry[] = [];
  accountMap.forEach((totals, accountCode) => {
    const coaAccount = coaMap.get(accountCode);
    const netBalance = totals.total_debits - totals.total_credits;

    tbEntries.push({
      account_code: accountCode,
      account_name: coaAccount?.account_name ?? accountCode,
      account_type: coaAccount?.account_type,
      total_debits: totals.total_debits,
      total_credits: totals.total_credits,
      net_balance: netBalance,
      debit: netBalance > 0 ? netBalance : 0,
      credit: netBalance < 0 ? Math.abs(netBalance) : 0,
    });
  });

  tbEntries.sort((a, b) => a.account_code.localeCompare(b.account_code));
  return tbEntries;
}

/**
 * Compute balance sheet totals from TB entries.
 * Uses account_type from COA; Asset, Liability, Equity only.
 */
export function computeBalanceSheetTotals(entries: TrialBalanceEntry[]): {
  assets: number;
  liabilities: number;
  equity: number;
} {
  let assets = 0;
  let liabilities = 0;
  let equity = 0;

  for (const entry of entries) {
    if (!entry.account_type) continue;

    switch (entry.account_type) {
      case 'Asset':
        assets += entry.net_balance;
        break;
      case 'Liability':
        liabilities += Math.abs(entry.net_balance);
        break;
      case 'Equity':
        equity += Math.abs(entry.net_balance);
        break;
      case 'Revenue':
        // Revenue has credit balance (negative net_balance); increases equity
        equity -= entry.net_balance;
        break;
      case 'Expense':
        // Expense has debit balance (positive net_balance); decreases equity
        equity -= entry.net_balance;
        break;
      default:
        break;
    }
  }

  return { assets, liabilities, equity };
}

/**
 * Build complete derived trial balance from GL.
 */
export async function buildDerivedTrialBalance(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<DerivedTrialBalance> {
  const glLines = await glRepository.getGLForPeriod(pool, tenantId, periodLabel);

  if (glLines.length === 0) {
    throw new Error(
      `No GL data found for tenant ${tenantId}, period ${periodLabel}`
    );
  }

  const coaAccounts = await coaRepository.getAccountsByTenant(pool, tenantId);

  if (coaAccounts.length === 0) {
    throw new Error(`No COA found for tenant ${tenantId}`);
  }

  const entries = aggregateGLToTB(glLines, coaAccounts);
  const totalDebits = entries.reduce((sum, e) => sum + e.total_debits, 0);
  const totalCredits = entries.reduce((sum, e) => sum + e.total_credits, 0);
  const balanceSheetTotals = computeBalanceSheetTotals(entries);

  return {
    tenant_id: tenantId,
    period_label: periodLabel,
    source: 'gl_aggregation',
    entries,
    total_debits: totalDebits,
    total_credits: totalCredits,
    balance_sheet_totals: balanceSheetTotals,
    derived_at: new Date(),
  };
}

/**
 * Validate derived TB meets integrity requirements.
 * - Total debits = total credits (within tolerance)
 * - Assets = Liabilities + Equity (within tolerance)
 */
export function validateDerivedTB(
  derivedTB: DerivedTrialBalance,
  tolerance = 0.01
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const debitCreditGap = Math.abs(
    derivedTB.total_debits - derivedTB.total_credits
  );
  if (debitCreditGap > tolerance) {
    errors.push(
      `Trial balance does not balance: debits ${derivedTB.total_debits.toFixed(2)} ≠ credits ${derivedTB.total_credits.toFixed(2)} (gap: ${debitCreditGap.toFixed(2)})`
    );
  }

  const { assets, liabilities, equity } = derivedTB.balance_sheet_totals;
  const balanceSheetGap = Math.abs(assets - (liabilities + equity));
  if (balanceSheetGap > tolerance) {
    errors.push(
      `Balance sheet equation does not hold: Assets ${assets.toFixed(2)} ≠ Liabilities ${liabilities.toFixed(2)} + Equity ${equity.toFixed(2)} (gap: ${balanceSheetGap.toFixed(2)})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
