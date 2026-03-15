/**
 * EBITDA bridge service: compute EBITDA bridge from income statement lines + addbacks.
 * All money arithmetic uses Decimal.js via src/utils/decimal.ts.
 */

import type { Pool } from 'pg';
import type { EbitdaBridgeResult } from '../types/ebitda_bridge.js';
import * as addbackRepo from '../db/repositories/ebitda_addbacks_repository.js';
import * as stmtPkgRepo from '../db/repositories/statement_package_repository.js';
import * as dec from '../utils/decimal.js';

/**
 * Keywords used to identify IS line items for the EBITDA bridge.
 * Matched case-insensitively against fs_line_id or metadata labels.
 */
const NET_INCOME_KEYS = ['net_income', 'net income', 'net_profit', 'net profit', 'profit_loss'];
const INTEREST_KEYS = ['interest_expense', 'interest expense', 'interest_cost', 'finance_cost', 'finance cost'];
const TAX_KEYS = ['income_tax', 'income tax', 'tax_expense', 'tax expense', 'provision_for_income_tax'];
const DA_KEYS = ['depreciation', 'amortization', 'depreciation_amortization', 'depreciation_and_amortization', 'd_and_a', 'dep_amort'];

function matchesAny(value: string, keys: string[]): boolean {
  const lower = value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return keys.some((k) => lower.includes(k.replace(/\s+/g, '_')));
}

/**
 * Compute the EBITDA bridge for a close session.
 * 1. Get the latest statement package for the session.
 * 2. Extract IS lines: Net Income, Interest Expense, Tax Expense, D&A.
 * 3. Get manual addbacks from the addbacks table.
 * 4. Compute EBITDA = Net Income + Interest + Tax + D&A + Addbacks.
 */
export async function computeEBITDABridge(
  pool: Pool,
  tenantId: string,
  sessionId: string
): Promise<EbitdaBridgeResult> {
  // Get the latest statement package for this session
  const packages = await stmtPkgRepo.listStatementPackagesByCloseSessionId(pool, tenantId, sessionId, 1);
  if (packages.length === 0) {
    throw new Error('No statement package found for session. Generate financial statements first.');
  }
  const latestPackage = packages[0];

  // Get all statement lines for the package
  const allLines = await stmtPkgRepo.listStatementLinesByPackageId(pool, latestPackage.id);

  // Filter to income statement lines only
  const isLines = allLines.filter((l) => l.statement === 'profit_and_loss');

  // Extract key line items by matching fs_line_id
  let netIncome = 0;
  let interestExpense = 0;
  let taxExpense = 0;
  let depreciationAmortization = 0;

  for (const line of isLines) {
    const lineId = line.fsLineId ?? '';
    const amount = Number(line.amount ?? 0);

    if (matchesAny(lineId, NET_INCOME_KEYS)) {
      netIncome = dec.plus(netIncome, amount);
    } else if (matchesAny(lineId, INTEREST_KEYS)) {
      // Interest expense is typically negative on IS; we add it back as positive
      interestExpense = dec.plus(interestExpense, Math.abs(amount));
    } else if (matchesAny(lineId, TAX_KEYS)) {
      // Tax expense: add back as positive
      taxExpense = dec.plus(taxExpense, Math.abs(amount));
    } else if (matchesAny(lineId, DA_KEYS)) {
      // D&A: add back as positive
      depreciationAmortization = dec.plus(depreciationAmortization, Math.abs(amount));
    }
  }

  // EBITDA before addbacks
  const ebitdaBeforeAddbacks = dec.sumRound2([netIncome, interestExpense, taxExpense, depreciationAmortization]);

  // Get manual addbacks
  const addbacks = await addbackRepo.listAddbacksForSession(pool, tenantId, sessionId);
  const addbackItems = addbacks.map((a) => ({
    label: a.label,
    amount: Number(a.amount),
    category: a.category,
  }));
  const totalAddbacks = dec.sumRound2(addbackItems.map((a) => a.amount));

  // Adjusted EBITDA
  const adjustedEbitda = dec.plus(ebitdaBeforeAddbacks, totalAddbacks);

  // Build the bridge lines for display
  const lines: EbitdaBridgeResult['lines'] = [
    { label: 'Net Income', amount: netIncome, type: 'income' },
    { label: 'Add: Interest Expense', amount: interestExpense, type: 'add_interest' },
    { label: 'Add: Income Tax Expense', amount: taxExpense, type: 'add_tax' },
    { label: 'Add: Depreciation & Amortization', amount: depreciationAmortization, type: 'add_da' },
  ];

  for (const ab of addbackItems) {
    lines.push({ label: `Add: ${ab.label}`, amount: ab.amount, type: 'addback' });
  }

  lines.push({ label: 'Adjusted EBITDA', amount: adjustedEbitda, type: 'ebitda' });

  return {
    netIncome,
    interestExpense,
    taxExpense,
    depreciationAmortization,
    ebitdaBeforeAddbacks,
    addbacks: addbackItems,
    totalAddbacks,
    adjustedEbitda,
    lines,
  };
}
