/**
 * Unit tests for cross-statement validation at certification.
 */

import { describe, it, expect } from '@jest/globals';
import { runCrossStatementValidationForCertification } from '../../src/services/cross_statement_validation.js';
import type { BalanceSheet, ProfitAndLoss, CashFlowStatement, EquityChangesStatement } from '../../src/types/financial.js';

const bsBalanced: BalanceSheet = {
  assets: [{ label: 'Cash', amount: 500 }, { label: 'AR', amount: 200 }],
  liabilities: [{ label: 'AP', amount: 100 }],
  equity: [{ label: 'Retained Earnings', amount: 600 }],
  totalAssets: 700,
  totalLiabilities: 100,
  totalEquity: 600,
};

const plBalanced: ProfitAndLoss = {
  revenue: [{ label: 'Revenue', amount: 100 }],
  expenses: [{ label: 'Expenses', amount: 40 }],
  totalRevenue: 100,
  totalExpenses: 40,
  netIncome: 60,
};

const cfBalanced: CashFlowStatement = {
  endingCash: 500,
  beginningCash: 500,
  netChangeInCash: 0,
  operating: [],
  investing: [],
  financing: [],
};

const equityBalanced: EquityChangesStatement = {
  closingEquity: 600,
  changes: [{ label: 'Net Income', amount: 60 }],
};

describe('runCrossStatementValidationForCertification', () => {
  it('passes when A = L + E and all ties hold', () => {
    const checks = runCrossStatementValidationForCertification(
      bsBalanced,
      plBalanced,
      cfBalanced,
      equityBalanced
    );
    const hard = checks.filter((c) => c.check_type === 'hard');
    expect(hard.every((c) => c.passes)).toBe(true);
  });

  it('fails balance_sheet_equation when A != L + E', () => {
    const bsBroken: BalanceSheet = {
      ...bsBalanced,
      totalAssets: 800,
      totalEquity: 650,
    };
    const checks = runCrossStatementValidationForCertification(
      bsBroken,
      plBalanced,
      cfBalanced,
      equityBalanced
    );
    const eq = checks.find((c) => c.check_name === 'balance_sheet_equation');
    expect(eq).toBeDefined();
    expect(eq?.passes).toBe(false);
    expect(eq?.message).toContain('A=');
  });

  it('fails cash_flow_exists when CF is null', () => {
    const checks = runCrossStatementValidationForCertification(
      bsBalanced,
      plBalanced,
      null,
      equityBalanced
    );
    const cf = checks.find((c) => c.check_name === 'cash_flow_exists');
    expect(cf).toBeDefined();
    expect(cf?.passes).toBe(false);
    expect(cf?.message).toContain('Cash Flow');
  });

  it('fails equity_statement_exists when equity is null', () => {
    const checks = runCrossStatementValidationForCertification(
      bsBalanced,
      plBalanced,
      cfBalanced,
      null
    );
    const eq = checks.find((c) => c.check_name === 'equity_statement_exists');
    expect(eq).toBeDefined();
    expect(eq?.passes).toBe(false);
    expect(eq?.message).toContain('changes in equity');
  });

  it('fails cash_tie when CF ending cash != BS cash', () => {
    const cfWrong: CashFlowStatement = { ...cfBalanced, endingCash: 999 };
    const checks = runCrossStatementValidationForCertification(
      bsBalanced,
      plBalanced,
      cfWrong,
      equityBalanced
    );
    const tie = checks.find((c) => c.check_name === 'cash_tie');
    expect(tie).toBeDefined();
    expect(tie?.passes).toBe(false);
    expect(tie?.message).toContain('ending cash');
  });

  it('fails when cash-flow sections do not equal reported net change in cash', () => {
    const cfBroken: CashFlowStatement = {
      operating: [{ label: 'Net income', amount: 100 }],
      investing: [],
      financing: [],
      beginningCash: 450,
      endingCash: 500,
      netChangeInCash: 50,
    };

    const checks = runCrossStatementValidationForCertification(
      bsBalanced,
      plBalanced,
      cfBroken,
      equityBalanced
    );
    const tie = checks.find((check) => check.check_name === 'cash_flow_sections_tie');
    expect(tie?.passes).toBe(false);
    expect(tie?.message).toContain('sections total');
  });

  it('fails when beginning cash plus net change does not equal ending cash', () => {
    const cfBroken: CashFlowStatement = {
      operating: [{ label: 'Net income', amount: 50 }],
      investing: [],
      financing: [],
      beginningCash: 400,
      endingCash: 500,
      netChangeInCash: 50,
    };

    const checks = runCrossStatementValidationForCertification(
      bsBalanced,
      plBalanced,
      cfBroken,
      equityBalanced
    );
    const tie = checks.find((check) => check.check_name === 'cash_rollforward_tie');
    expect(tie?.passes).toBe(false);
    expect(tie?.message).toContain('Beginning cash');
  });
});
