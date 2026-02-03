/**
 * Accounting Kill Switch — Integrity Gate smoke tests.
 *
 * Proves to investors that our 'Accounting Law' is physically enforced:
 * (A) Trial Balance must balance: Sum(Debits) == Sum(Credits).
 * (B) Balance Sheet equation: Total Assets == Total Liabilities + Total Equity.
 *
 * buildValidatedStatements() throws MathematicalIntegrityError when either check fails;
 * it never returns financial statements for illegal data.
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildValidatedStatements,
  MathematicalIntegrityError,
} from '../../src/services/financialStatements.js';
import type { TrialBalanceResult, TrialBalanceEntry } from '../../src/types/financial.js';

describe('Integrity Gate — Accounting Kill Switch', () => {
  describe('imbalanced Trial Balance (Debits != Credits)', () => {
    it('throws MathematicalIntegrityError when total debits != total credits', () => {
      // Intentionally imbalanced: debits 1000, credits 500 → imbalance 500
      const imbalancedEntries: TrialBalanceEntry[] = [
        { accountName: 'Cash', debit: 1000, credit: 0 },
        { accountName: 'Revenue', debit: 0, credit: 500 },
      ];
      const trialBalance: TrialBalanceResult = {
        entries: imbalancedEntries,
        totalDebits: 1000,
        totalCredits: 500,
        balances: false,
        errors: [],
      };

      expect(() => buildValidatedStatements(trialBalance)).toThrow(MathematicalIntegrityError);
    });

    it('throws with check "A" and exact imbalanceAmount', () => {
      const imbalancedEntries: TrialBalanceEntry[] = [
        { accountName: 'Cash', debit: 100, credit: 0 },
        { accountName: 'Equity', debit: 0, credit: 60 },
      ];
      const trialBalance: TrialBalanceResult = {
        entries: imbalancedEntries,
        totalDebits: 100,
        totalCredits: 60,
        balances: false,
        errors: [],
      };

      let thrown: MathematicalIntegrityError | undefined;
      try {
        buildValidatedStatements(trialBalance);
      } catch (e) {
        thrown = e instanceof MathematicalIntegrityError ? e : undefined;
      }

      expect(thrown).toBeDefined();
      expect(thrown!.name).toBe('MathematicalIntegrityError');
      expect(thrown!.check).toBe('A');
      expect(thrown!.imbalanceAmount).toBe(40);
      expect(thrown!.details?.totalDebits).toBe(100);
      expect(thrown!.details?.totalCredits).toBe(60);
    });
  });

  describe('balanced Trial Balance', () => {
    it('returns correct Financial Statements when TB balances and BS equation holds', () => {
      // Balanced: Cash 1000 debit, Equity 1000 credit. Classifier maps "Cash" → ASSET, "Equity" → EQUITY.
      const balancedEntries: TrialBalanceEntry[] = [
        { accountName: 'Cash', debit: 1000, credit: 0 },
        { accountName: 'Equity', debit: 0, credit: 1000 },
      ];
      const trialBalance: TrialBalanceResult = {
        entries: balancedEntries,
        totalDebits: 1000,
        totalCredits: 1000,
        balances: true,
        errors: [],
      };

      const result = buildValidatedStatements(trialBalance);

      expect(result).toBeDefined();
      expect(result.balanceSheet).toBeDefined();
      expect(result.profitAndLoss).toBeDefined();
      expect(result.classifiedEntries).toBeDefined();
      expect(result.classifiedEntries.length).toBe(2);

      // Balance sheet equation: Assets = Liabilities + Equity
      expect(result.balanceSheet.totalAssets).toBe(1000);
      expect(result.balanceSheet.totalLiabilities).toBe(0);
      expect(result.balanceSheet.totalEquity).toBe(1000);
      expect(result.balanceSheet.balances).toBe(true);

      // P&L: no revenue/expense in this minimal TB
      expect(result.profitAndLoss.totalRevenue).toBe(0);
      expect(result.profitAndLoss.totalExpenses).toBe(0);
      expect(result.profitAndLoss.netIncome).toBe(0);
    });

    it('returns valid statements for a TB with revenue and expense (balanced)', () => {
      // Cash 1000 Dr, Revenue 500 Cr, Expense 500 Dr, Equity 1000 Cr → Debits 1500, Credits 1500.
      // BS: Assets 1000 (Cash), Equity 1000 → 1000 = 1000. P&L: Revenue 500, Expense 500, Net 0.
      const balancedEntries: TrialBalanceEntry[] = [
        { accountName: 'Cash', debit: 1000, credit: 0 },
        { accountName: 'Revenue', debit: 0, credit: 500 },
        { accountName: 'Operating expense', debit: 500, credit: 0 },
        { accountName: 'Equity', debit: 0, credit: 1000 },
      ];
      const trialBalance: TrialBalanceResult = {
        entries: balancedEntries,
        totalDebits: 1500,
        totalCredits: 1500,
        balances: true,
        errors: [],
      };

      const result = buildValidatedStatements(trialBalance);

      expect(result).toBeDefined();
      expect(result.balanceSheet.balances).toBe(true);
      expect(result.balanceSheet.totalAssets).toBe(1000);
      expect(result.balanceSheet.totalEquity).toBe(1000);
      expect(result.balanceSheet.totalAssets).toBe(
        result.balanceSheet.totalLiabilities + result.balanceSheet.totalEquity
      );
      expect(result.profitAndLoss.totalRevenue).toBe(500);
      expect(result.profitAndLoss.totalExpenses).toBe(500);
      expect(result.profitAndLoss.netIncome).toBe(0);
    });
  });
});
