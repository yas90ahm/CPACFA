/**
 * Regression tests: certified statement generation from snapshot is deterministic and
 * produces identical structure/totals. Ensures refactored certified paths (binder, export)
 * remain identical to previous behavior.
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildCertifiedStatementsFromSnapshot,
  snapshotPayloadToTrialBalanceResult,
  statementsToExportPayload,
} from '../../src/services/certified_statements_service.js';
import { MathematicalIntegrityError } from '../../src/errors.js';
import type { LedgerSnapshotPayload } from '../../src/types/ledger_snapshot.js';

/** Fixed snapshot payload: balanced TB (Cash, AP, Equity) so classification and BS equation hold. */
const FIXED_SNAPSHOT: LedgerSnapshotPayload = {
  trialBalance: {
    entries: [
      { lineId: 'L1', accountName: 'Cash', debit: 1000, credit: 0, accountCode: '1000' },
      { lineId: 'L2', accountName: 'Account Payable', debit: 0, credit: 200, accountCode: '2000' },
      { lineId: 'L3', accountName: 'Equity', debit: 0, credit: 800, accountCode: '3000' },
    ],
    totalDebits: 1000,
    totalCredits: 1000,
  },
};

describe('certified_statements_service', () => {
  describe('snapshotPayloadToTrialBalanceResult', () => {
    it('converts fixed snapshot to trial balance with correct totals', () => {
      const result = snapshotPayloadToTrialBalanceResult(FIXED_SNAPSHOT);
      expect(result.entries).toHaveLength(3);
      expect(result.totalDebits).toBe(1000);
      expect(result.totalCredits).toBe(1000);
      expect(result.balances).toBe(true);
    });
  });

  describe('buildCertifiedStatementsFromSnapshot', () => {
    it('produces deterministic output for fixed snapshot (regression: certified output identity)', () => {
      const out = buildCertifiedStatementsFromSnapshot(FIXED_SNAPSHOT);

      expect(out.trialBalance).toBeDefined();
      expect(out.trialBalance?.totalDebits).toBe(1000);
      expect(out.trialBalance?.totalCredits).toBe(1000);
      expect(out.trialBalance?.balances).toBe(true);
      expect(out.balanceSheet).toBeDefined();
      expect(out.profitAndLoss).toBeDefined();
      expect(out.reasoningChain?.plan).toBe('certified_snapshot');
      expect(out.reasoningChain?.verification?.passed).toBe(true);

      expect(out.balanceSheet.totalAssets).toBe(1000);
      expect(out.balanceSheet.totalLiabilities).toBe(200);
      expect(out.balanceSheet.totalEquity).toBe(800);
      expect(out.balanceSheet.balances).toBe(true);

      expect(out.profitAndLoss.totalRevenue).toBe(0);
      expect(out.profitAndLoss.totalExpenses).toBe(0);
      expect(out.profitAndLoss.netIncome).toBe(0);
    });

    it('uses the embedded prior certified TB for cash and equity roll-forwards and ASPE presentation', () => {
      const comparativeSnapshot: LedgerSnapshotPayload = {
        ...FIXED_SNAPSHOT,
        accountingContext: { standard: 'ASPE' },
        comparativeTrialBalance: {
          periodLabel: '2026-06',
          sourceSnapshotId: 'prior-certified-snapshot',
          sourceSnapshotHash: 'a'.repeat(64),
          entries: [
            { accountName: 'Cash', debit: 800, credit: 0, accountCode: '1000' },
            { accountName: 'Account Payable', debit: 0, credit: 200, accountCode: '2000' },
            { accountName: 'Equity', debit: 0, credit: 600, accountCode: '3000' },
          ],
          totalDebits: 800,
          totalCredits: 800,
        },
      };

      const out = buildCertifiedStatementsFromSnapshot(comparativeSnapshot);

      expect(out.standard).toBe('ASPE');
      expect(out.balanceSheet.codificationRef).toEqual(expect.objectContaining({ framework: 'ASPE' }));
      expect(out.profitAndLoss.codificationRef).toEqual(expect.objectContaining({ framework: 'ASPE' }));
      expect(out.cashFlow).toEqual(expect.objectContaining({
        beginningCash: 800,
        endingCash: 1000,
        netChangeInCash: 200,
        estimated: false,
      }));
      expect(out.cashFlow?.financing).toEqual(
        expect.arrayContaining([expect.objectContaining({ amount: 200 })])
      );
      expect(out.equityChanges).toEqual(expect.objectContaining({
        openingEquity: 600,
        closingEquity: 800,
        estimated: false,
      }));
    });

    it('throws when trial balance is imbalanced (MathematicalIntegrityError from builder)', () => {
      const imbalanced: LedgerSnapshotPayload = {
        trialBalance: {
          entries: [
            { accountName: 'Cash', debit: 1000, credit: 0 },
            { accountName: 'Equity', debit: 0, credit: 500 },
          ],
          totalDebits: 1000,
          totalCredits: 500,
        },
      };
      expect(() => buildCertifiedStatementsFromSnapshot(imbalanced)).toThrow(MathematicalIntegrityError);
    });
  });

  describe('statementsToExportPayload', () => {
    it('round-trip: snapshot → certified statements → export payload has same totals', () => {
      const statements = buildCertifiedStatementsFromSnapshot(FIXED_SNAPSHOT);
      const payload = statementsToExportPayload(statements);

      const bs = payload.financial_statements.balance_sheet as Record<string, unknown>;
      const pl = payload.financial_statements.profit_and_loss as Record<string, unknown>;
      expect(bs.total_assets).toBe(1000);
      expect(bs.total_liabilities).toBe(200);
      expect(bs.total_equity).toBe(800);
      expect(pl.net_income).toBe(0);

      expect(Array.isArray(payload.clean_ledger)).toBe(true);
      expect(payload.clean_ledger.length).toBe(statements.trialBalance?.entries?.length ?? 0);
      const sumDebits = payload.clean_ledger.reduce((s, r) => s + (r.debit ?? 0), 0);
      const sumCredits = payload.clean_ledger.reduce((s, r) => s + (r.credit ?? 0), 0);
      expect(sumDebits).toBe(1000);
      expect(sumCredits).toBe(1000);
    });
  });
});
