/**
 * statementGenerator — Integrity gate enforcement.
 * When contracts exist, generateStatements MUST throw on integrity failure.
 * It must NOT return valid-looking statements when Truth Gate fails.
 */

import { describe, it, expect } from '@jest/globals';
import { generateStatements } from '../../src/services/statementGenerator.js';
import { MathematicalIntegrityError } from '../../src/errors.js';

describe('statementGenerator integrity gate', () => {
  it('throws MathematicalIntegrityError when contracts exist and trial balance is imbalanced', async () => {
    // Debits=100, Credits=99 — gate (A) fails (gap 1 > tolerance 0.01)
    const trialBalance = {
      entries: [
        { accountName: 'Cash', debit: 100, credit: 0 },
        { accountName: 'Revenue', debit: 0, credit: 99 },
      ],
      totalDebits: 100,
      totalCredits: 99,
      balances: false,
      errors: [],
    };

    const contracts = [{ id: 'c1', totalContractValue: 100, periodRecognizedRevenue: 99 }];

    await expect(
      generateStatements(trialBalance, 'US_GAAP', {
        contracts,
      })
    ).rejects.toThrow(MathematicalIntegrityError);

    await expect(
      generateStatements(trialBalance, 'US_GAAP', {
        contracts,
      })
    ).rejects.toMatchObject({
      check: 'A',
      imbalanceAmount: 1,
    });
  });

  it('does NOT return statements when integrity fails — throws before any output', async () => {
    const trialBalance = {
      entries: [
        { accountName: 'Cash', debit: 100, credit: 0 },
        { accountName: 'Revenue', debit: 0, credit: 99 },
      ],
      totalDebits: 100,
      totalCredits: 99,
      balances: false,
      errors: [],
    };

    const contracts = [{ id: 'c1', totalContractValue: 100, periodRecognizedRevenue: 99 }];

    let caught = false;
    try {
      await generateStatements(trialBalance, 'US_GAAP', { contracts });
    } catch (e) {
      caught = true;
      expect(e).toBeInstanceOf(MathematicalIntegrityError);
    }
    expect(caught).toBe(true);
  });

  it('returns statements when contracts exist and gate passes', async () => {
    // Cash + Equity: Assets=100, L=0, E=100 — balance sheet equation holds
    const trialBalance = {
      entries: [
        { accountName: 'Cash', debit: 100, credit: 0 },
        { accountName: 'Equity', debit: 0, credit: 100 },
      ],
      totalDebits: 100,
      totalCredits: 100,
      balances: true,
      errors: [],
    };

    const contracts = [{ id: 'c1', totalContractValue: 100, periodRecognizedRevenue: 0 }];

    const result = await generateStatements(trialBalance, 'US_GAAP', { contracts });

    expect(result).toBeDefined();
    expect(result.balanceSheet).toBeDefined();
    expect(result.profitAndLoss).toBeDefined();
    expect(result.balanceSheet.totalAssets).toBe(100);
    expect(result.balanceSheet.totalLiabilities + result.balanceSheet.totalEquity).toBe(100);
  });
});
