/**
 * Roll-Forward Reconciliation Service (GAP I12)
 *
 * Provides roll-forward analysis for balance sheet accounts where
 * the appropriate reconciliation method is activity-based:
 *   Beginning Balance + Additions - Disposals +/- Adjustments = Ending Balance
 *
 * Applicable to: fixed assets, intangibles, ROU assets, debt, equity.
 * Pulls supporting journal entries to evidence each movement category.
 */

import type { Pool } from 'pg';
import { from, round2, sumRound2 } from '../utils/decimal.js';

/** Account types that use roll-forward reconciliation. */
const ROLL_FORWARD_ACCOUNT_TYPES = new Set([
  'FIXED_ASSET',
  'NON_CURRENT_ASSET',
  'INTANGIBLE',
  'ROU_ASSET',
  'RIGHT_OF_USE',
  'LONG_TERM_DEBT',
  'NON_CURRENT_LIABILITY',
  'EQUITY',
  'RETAINED_EARNINGS',
  'SHARE_CAPITAL',
  'ADDITIONAL_PAID_IN_CAPITAL',
  // Common alternative names
  'PPE',
  'PROPERTY_PLANT_EQUIPMENT',
  'GOODWILL',
  'DEBT',
]);

export interface RollForwardMovement {
  category: 'beginning_balance' | 'additions' | 'disposals' | 'adjustments' | 'ending_balance';
  label: string;
  amount: number;
  supportingEntries: RollForwardJEDetail[];
}

export interface RollForwardJEDetail {
  entryId: string;
  entryDate: string;
  memo: string | null;
  amount: number;
  side: 'debit' | 'credit';
}

export interface RollForwardResult {
  reconId: string;
  accountCode: string;
  accountName: string | null;
  isRollForwardAccount: boolean;
  beginningBalance: number;
  additions: number;
  disposals: number;
  adjustments: number;
  computedEndingBalance: number;
  actualEndingBalance: number;
  difference: number;
  movements: RollForwardMovement[];
}

/**
 * Check if an account type should use roll-forward reconciliation.
 */
export function isRollForwardAccount(accountType: string | null | undefined): boolean {
  if (!accountType) return false;
  const normalized = accountType.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return ROLL_FORWARD_ACCOUNT_TYPES.has(normalized);
}

/**
 * Compute roll-forward reconciliation for a specific account.
 *
 * Beginning balance comes from the prior period's GL balance (or the recon's
 * prior_period_gl_balance). Movements are derived from posted journal entries
 * that touch this account during the close session's period.
 *
 * Movement categorization:
 * - Additions: debit entries for assets, credit entries for liabilities/equity
 * - Disposals: credit entries for assets, debit entries for liabilities/equity
 * - Adjustments: entries from AJE/recon sources
 */
export async function computeRollForward(
  pool: Pool,
  tenantId: string,
  reconId: string,
  sessionId: string
): Promise<RollForwardResult> {
  // Get the reconciliation record
  const reconResult = await pool.query<{
    recon_id: string;
    account_code: string;
    account_name: string | null;
    gl_balance: string | null;
    prior_period_gl_balance: string | null;
    entity_id: string;
  }>(
    `SELECT r.recon_id, r.account_code, req.account_name,
            r.gl_balance::text, r.prior_period_gl_balance::text, r.entity_id
     FROM tenant_period_reconciliations r
     LEFT JOIN tenant_recon_requirements req ON r.requirement_id = req.requirement_id
     WHERE r.recon_id = $1 AND r.tenant_id = $2`,
    [reconId, tenantId]
  );

  const recon = reconResult.rows[0];
  if (!recon) throw new Error('Reconciliation not found');

  // Determine account type from TB or requirements
  const typeResult = await pool.query<{ account_type: string | null }>(
    `SELECT account_type FROM tenant_trial_balance
     WHERE tenant_id = $1 AND account_code = $2
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, recon.account_code]
  );
  const accountType = typeResult.rows[0]?.account_type ?? null;
  const isAsset = (accountType ?? '').toUpperCase().includes('ASSET');

  // Beginning balance = prior period GL balance (or 0 if first period)
  const beginningBalance = round2(Number(recon.prior_period_gl_balance ?? 0));
  const actualEndingBalance = round2(Number(recon.gl_balance ?? 0));

  // Get posted journal entries touching this account in this session
  const jeResult = await pool.query<{
    entry_id: string;
    entry_date: string;
    memo: string | null;
    source: string | null;
    debit: string | null;
    credit: string | null;
  }>(
    `SELECT je.id AS entry_id, je.entry_date, je.memo, je.source,
            jl.debit::text, jl.credit::text
     FROM tenant_journal_entries je
     JOIN tenant_journal_entry_lines jl ON jl.journal_entry_id = je.id
     WHERE je.tenant_id = $1
       AND je.close_session_id = $2
       AND jl.account_code = $3
       AND je.status = 'posted'
     ORDER BY je.entry_date, je.id`,
    [tenantId, sessionId, recon.account_code]
  );

  // Categorize journal entries into movements
  const additionEntries: RollForwardJEDetail[] = [];
  const disposalEntries: RollForwardJEDetail[] = [];
  const adjustmentEntries: RollForwardJEDetail[] = [];

  for (const row of jeResult.rows) {
    const debit = Number(row.debit ?? 0);
    const credit = Number(row.credit ?? 0);
    const isAdjustment = row.source === 'recon' || row.source === 'aje' || row.source === 'template';

    if (isAdjustment) {
      // Adjustments: entries from AJE/recon/template sources
      const netAmount = round2(debit - credit);
      adjustmentEntries.push({
        entryId: row.entry_id,
        entryDate: row.entry_date,
        memo: row.memo,
        amount: netAmount,
        side: debit > credit ? 'debit' : 'credit',
      });
    } else if (isAsset) {
      // For assets: debits are additions, credits are disposals
      if (debit > 0) {
        additionEntries.push({
          entryId: row.entry_id,
          entryDate: row.entry_date,
          memo: row.memo,
          amount: round2(debit),
          side: 'debit',
        });
      }
      if (credit > 0) {
        disposalEntries.push({
          entryId: row.entry_id,
          entryDate: row.entry_date,
          memo: row.memo,
          amount: round2(credit),
          side: 'credit',
        });
      }
    } else {
      // For liabilities/equity: credits are additions, debits are disposals
      if (credit > 0) {
        additionEntries.push({
          entryId: row.entry_id,
          entryDate: row.entry_date,
          memo: row.memo,
          amount: round2(credit),
          side: 'credit',
        });
      }
      if (debit > 0) {
        disposalEntries.push({
          entryId: row.entry_id,
          entryDate: row.entry_date,
          memo: row.memo,
          amount: round2(debit),
          side: 'debit',
        });
      }
    }
  }

  const additionsTotal = sumRound2(additionEntries.map((e) => e.amount));
  const disposalsTotal = sumRound2(disposalEntries.map((e) => e.amount));
  const adjustmentsTotal = sumRound2(adjustmentEntries.map((e) => e.amount));

  // For assets: beginning + additions - disposals + adjustments = ending
  // For liabilities/equity: beginning + additions - disposals + adjustments = ending
  const computedEndingBalance = round2(
    beginningBalance + additionsTotal - disposalsTotal + adjustmentsTotal
  );
  const difference = round2(actualEndingBalance - computedEndingBalance);

  const movements: RollForwardMovement[] = [
    {
      category: 'beginning_balance',
      label: 'Beginning Balance',
      amount: beginningBalance,
      supportingEntries: [],
    },
    {
      category: 'additions',
      label: 'Additions',
      amount: additionsTotal,
      supportingEntries: additionEntries,
    },
    {
      category: 'disposals',
      label: 'Disposals',
      amount: disposalsTotal,
      supportingEntries: disposalEntries,
    },
    {
      category: 'adjustments',
      label: 'Adjustments',
      amount: adjustmentsTotal,
      supportingEntries: adjustmentEntries,
    },
    {
      category: 'ending_balance',
      label: 'Ending Balance (Computed)',
      amount: computedEndingBalance,
      supportingEntries: [],
    },
  ];

  return {
    reconId,
    accountCode: recon.account_code,
    accountName: recon.account_name,
    isRollForwardAccount: isRollForwardAccount(accountType),
    beginningBalance,
    additions: additionsTotal,
    disposals: disposalsTotal,
    adjustments: adjustmentsTotal,
    computedEndingBalance,
    actualEndingBalance,
    difference,
    movements,
  };
}
