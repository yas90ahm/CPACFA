import { describe, expect, it } from '@jest/globals';
import { buildCashFlowStatement } from '../../src/services/cashFlow.js';
import type { ProfitAndLoss, TrialBalanceResult } from '../../src/types/financial.js';

const emptyProfitAndLoss: ProfitAndLoss = {
  revenue: [],
  expenses: [],
  totalRevenue: 0,
  totalExpenses: 0,
  netIncome: 0,
};

function trialBalance(entries: TrialBalanceResult['entries']): TrialBalanceResult {
  return {
    entries,
    totalDebits: 0,
    totalCredits: 0,
    balances: true,
    errors: [],
  };
}

describe('cash-flow normal balance handling', () => {
  it('treats an AP increase as an operating cash source when imported account types are absent', () => {
    const prior = trialBalance([
      { accountName: 'Accounts Payable', debit: 0, credit: 100 },
    ]);
    const current = trialBalance([
      { accountName: 'Accounts Payable', debit: 0, credit: 150 },
    ]);

    const statement = buildCashFlowStatement(current, emptyProfitAndLoss, prior);

    expect(statement.operating).toContainEqual({
      label: 'Change in accounts payable',
      amount: 50,
    });
  });

  it('treats an equity increase as a financing inflow when imported account types are absent', () => {
    const prior = trialBalance([
      { accountName: 'Share Capital', debit: 0, credit: 100 },
    ]);
    const current = trialBalance([
      { accountName: 'Share Capital', debit: 0, credit: 175 },
    ]);

    const statement = buildCashFlowStatement(current, emptyProfitAndLoss, prior);

    expect(statement.financing).toContainEqual({ label: 'Equity issued', amount: 75 });
  });
});
