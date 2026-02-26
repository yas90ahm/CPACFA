/**
 * GL→TB Aggregation Service
 *
 * PRIMARY PIPELINE: GL journal entries → Trial Balance
 *
 * This service aggregates raw general ledger entries into a trial balance
 * by summing all debits and credits per account code for a given period.
 *
 * All monetary arithmetic uses Decimal.js via utils/decimal.ts.
 * Native JavaScript floating-point is NEVER used for dollar amounts.
 *
 * The output trial balance is stored as an immutable snapshot (hashed)
 * and serves as the foundation for all downstream processes:
 * reconciliation, adjusting entries, statement generation, and certification.
 */

import type { Pool } from 'pg';
import type { GeneralLedgerLine } from '../types/general_ledger.js';
import type { TrialBalanceEntry, DerivedTrialBalance } from '../types/trial_balance_derived.js';
import type { CoaAccount } from '../types/coa.js';
import * as glRepository from '../db/repositories/general_ledger_repository.js';
import * as coaRepository from '../db/repositories/coa_repository.js';
import type { AccountType } from '../types/coa.js';
import { from, plus, minus, sumRound2, round2, absGt } from '../utils/decimal.js';

/**
 * Infer account type from account code prefix when no COA is available.
 * Standard chart-of-accounts numbering convention:
 *   1xxx = Asset, 2xxx = Liability, 3xxx = Equity,
 *   4xxx = Revenue, 5xxx/6xxx = Expense,
 *   7xxx = Other Income, 8xxx/9xxx = Other Expense.
 */
function inferAccountType(accountCode: string): AccountType | undefined {
  const prefix = parseInt(accountCode.charAt(0));
  if (prefix === 1) return 'Asset';
  if (prefix === 2) return 'Liability';
  if (prefix === 3) return 'Equity';
  if (prefix === 4) return 'Revenue';
  if (prefix === 5 || prefix === 6) return 'Expense';
  return undefined;
}

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
    { total_debits: number; total_credits: number; gl_account_name?: string }
  >();

  for (const line of glLines) {
    const existing = accountMap.get(line.account_code) ?? {
      total_debits: 0,
      total_credits: 0,
    };
    existing.total_debits = plus(existing.total_debits, line.debit ?? 0);
    existing.total_credits = plus(existing.total_credits, line.credit ?? 0);
    // Capture account_name from the first GL line that has one
    if (!existing.gl_account_name && line.account_name) {
      existing.gl_account_name = line.account_name;
    }
    accountMap.set(line.account_code, existing);
  }

  const tbEntries: TrialBalanceEntry[] = [];
  accountMap.forEach((totals, accountCode) => {
    const coaAccount = coaMap.get(accountCode);
    const netBalance = minus(totals.total_debits, totals.total_credits);
    const netD = from(netBalance);
    const debitVal = netD.greaterThan(0) ? netBalance : 0;
    const creditVal = netD.lessThan(0) ? round2(from(netBalance).abs().toNumber()) : 0;

    tbEntries.push({
      account_code: accountCode,
      account_name: coaAccount?.account_name ?? totals.gl_account_name ?? accountCode,
      account_type: coaAccount?.account_type ?? inferAccountType(accountCode),
      total_debits: totals.total_debits,
      total_credits: totals.total_credits,
      net_balance: netBalance,
      debit: debitVal,
      credit: creditVal,
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
    const nb = entry.net_balance;
    const nbAbs = round2(from(nb).abs().toNumber());

    switch (entry.account_type) {
      case 'Asset':
        assets = plus(assets, nb);
        break;
      case 'Liability':
        liabilities = plus(liabilities, nbAbs);
        break;
      case 'Equity':
        equity = plus(equity, nbAbs);
        break;
      case 'Revenue':
        equity = minus(equity, nb);
        break;
      case 'Expense':
        equity = minus(equity, nb);
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
    // COA may not be populated yet — aggregateGLToTB gracefully falls
    // back to account_code for name and undefined for type.
    console.warn(`No COA found for tenant ${tenantId}; TB will use account codes as names.`);
  }

  const entries = aggregateGLToTB(glLines, coaAccounts);
  const totalDebits = sumRound2(entries.map((e) => e.total_debits));
  const totalCredits = sumRound2(entries.map((e) => e.total_credits));
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

  const debitCreditGap = from(derivedTB.total_debits).minus(derivedTB.total_credits).abs().toNumber();
  if (absGt(derivedTB.total_debits, derivedTB.total_credits, tolerance)) {
    errors.push(
      `Trial balance does not balance: debits ${derivedTB.total_debits.toFixed(2)} ≠ credits ${derivedTB.total_credits.toFixed(2)} (gap: ${debitCreditGap.toFixed(2)})`
    );
  }

  const { assets, liabilities, equity } = derivedTB.balance_sheet_totals;
  const lhsEq = plus(liabilities, equity);
  const balanceSheetGap = from(assets).minus(lhsEq).abs().toNumber();
  if (absGt(assets, lhsEq, tolerance)) {
    errors.push(
      `Balance sheet equation does not hold: Assets ${assets.toFixed(2)} ≠ Liabilities ${liabilities.toFixed(2)} + Equity ${equity.toFixed(2)} (gap: ${balanceSheetGap.toFixed(2)})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
