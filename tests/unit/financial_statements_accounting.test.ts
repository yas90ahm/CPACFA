import { describe, expect, it } from '@jest/globals';
import { buildProfitAndLoss } from '../../src/services/financialStatements.js';
import type { TrialBalanceEntry } from '../../src/types/financial.js';

describe('financial statement accounting signs', () => {
  it('subtracts interest expense from income and adds it back once for EBITDA', () => {
    const entries: TrialBalanceEntry[] = [
      {
        accountCode: '4000',
        accountName: 'Service revenue',
        debit: 0,
        credit: 100,
        accountType: 'REVENUE',
        fsLineId: 'fs_revenue_service',
      },
      {
        accountCode: '7100',
        accountName: 'Interest expense',
        debit: 10,
        credit: 0,
        accountType: 'EXPENSE',
        fsLineId: 'fs_interest_expense',
      },
    ];

    const statement = buildProfitAndLoss(entries);

    expect(statement.totalOtherIncomeExpense).toBe(-10);
    expect(statement.incomeBeforeTax).toBe(90);
    expect(statement.netIncome).toBe(90);
    expect(statement.totalExpenses).toBe(10);
    expect(statement.ebitda).toBe(100);
    expect(statement.otherIncomeExpense?.[0]?.amount).toBe(-10);
  });

  it('nets interest income and interest expense using their economic signs', () => {
    const entries: TrialBalanceEntry[] = [
      { accountName: 'Revenue', debit: 0, credit: 100, accountType: 'REVENUE', fsLineId: 'fs_revenue' },
      { accountName: 'Interest income', debit: 0, credit: 5, accountType: 'REVENUE', fsLineId: 'fs_interest_income' },
      { accountName: 'Interest expense', debit: 10, credit: 0, accountType: 'EXPENSE', fsLineId: 'fs_interest_expense' },
    ];

    const statement = buildProfitAndLoss(entries);

    expect(statement.totalOtherIncomeExpense).toBe(-5);
    expect(statement.netIncome).toBe(95);
    expect(statement.totalExpenses).toBe(10);
  });
});
