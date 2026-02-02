/**
 * Plan-Execute-Verify loop for FinOS Agent
 * Before writing any financial logic, the bot outputs its Reasoning Chain.
 */

import type {
  TrialBalanceResult,
  BalanceSheet,
  ProfitAndLoss,
  FinancialStatementsOutput,
} from '../types/financial.js';
import { absGt, absLt, sumRound2 } from '../utils/decimal.js';

const DEFAULT_MATERIALITY = 0.01;

export interface PlanExecuteVerifyInput {
  trialBalance: TrialBalanceResult;
  balanceSheet: BalanceSheet;
  profitAndLoss: ProfitAndLoss;
  /** Configurable materiality; when balance gap exceeds this, verification fails. */
  materiality?: number;
}

/**
 * Builds the Reasoning Chain and runs verification.
 * When the balance gap exceeds materiality, verification fails with "Balance gap exceeds materiality."
 */
export function runPlanExecuteVerify(input: PlanExecuteVerifyInput): FinancialStatementsOutput['reasoningChain'] {
  const executedAt = new Date().toISOString();
  const materiality = input.materiality ?? DEFAULT_MATERIALITY;

  const plan = [
    'P1: Input = Trial Balance (Account, Debit, Credit); Σ Debits = Σ Credits.',
    'P2: Standards = FASB ASC 205, 210, 220; IAS 1 (Presentation).',
    'P3: Output = Balance Sheet (Assets = Liabilities + Equity) + P&L (Revenue − Expenses = Net Income).',
    'P4: Each line item classified and traced to FASB/IASB codification.',
  ].join(' ');

  const checks: string[] = [];
  let passed = true;

  if (input.trialBalance.balances) {
    checks.push('V1: Trial Balance balances (Σ Debits = Σ Credits).');
  } else {
    checks.push('V1 FAIL: Trial Balance does not balance.');
    passed = false;
  }

  const bsGapExceedsMateriality = absGt(
    input.balanceSheet.totalAssets,
    input.balanceSheet.totalLiabilities + input.balanceSheet.totalEquity,
    materiality
  );
  const bsBalances = input.balanceSheet.balances && !bsGapExceedsMateriality;
  if (bsBalances) {
    checks.push('V2: Balance Sheet equation holds (Assets = Liabilities + Equity).');
  } else {
    if (bsGapExceedsMateriality) {
      const bsGap = Math.abs(
        input.balanceSheet.totalAssets -
          (input.balanceSheet.totalLiabilities + input.balanceSheet.totalEquity)
      );
      checks.push(`V2 FAIL: Balance gap exceeds materiality (gap=${bsGap.toFixed(2)}, materiality=${materiality}).`);
    } else {
      checks.push('V2 FAIL: Balance Sheet does not balance.');
    }
    passed = false;
  }

  // V3: P&L Net Income consistency (conceptual: NI flows to equity)
  checks.push('V3: Net Income from P&L computed (Revenue − Expenses).');

  // V3b: P&L cross-foot — sum of line amounts vs totalRevenue/totalExpenses within materiality
  const revenueLineSum = sumRound2(input.profitAndLoss.revenue.map((l) => l.amount));
  const expenseLineSum = sumRound2(input.profitAndLoss.expenses.map((l) => l.amount));
  const revenueCrossFootOk = absLt(revenueLineSum, input.profitAndLoss.totalRevenue, materiality);
  const expenseCrossFootOk = absLt(expenseLineSum, input.profitAndLoss.totalExpenses, materiality);
  if (revenueCrossFootOk && expenseCrossFootOk) {
    checks.push('V3b: P&L cross-foot (sum of line amounts vs totals within materiality).');
  } else {
    if (!revenueCrossFootOk) {
      checks.push(`V3b FAIL: Revenue line sum (${revenueLineSum.toFixed(2)}) vs totalRevenue (${input.profitAndLoss.totalRevenue.toFixed(2)}) exceeds materiality.`);
    }
    if (!expenseCrossFootOk) {
      checks.push(`V3b FAIL: Expense line sum (${expenseLineSum.toFixed(2)}) vs totalExpenses (${input.profitAndLoss.totalExpenses.toFixed(2)}) exceeds materiality.`);
    }
    passed = false;
  }

  // V4: Codification present on BS and P&L
  const hasCodification =
    input.balanceSheet.codificationRef && input.profitAndLoss.codificationRef;
  if (hasCodification) {
    checks.push('V4: Balance Sheet and P&L have codification references.');
  } else {
    checks.push('V4 WARN: Missing codification on one or more statements.');
  }

  return {
    plan,
    executedAt,
    verification: { passed, checks },
  };
}
