/**
 * Unit tests for precheck board-ready service (deterministic structural check).
 */

import { describe, it, expect } from '@jest/globals';
import {
  runPrecheckBoardReady,
  type PrecheckBoardReadyInput,
} from '../../src/services/precheck_board_ready_service.js';
import { PrecheckCode } from '../../src/constants/precheck_codes.js';

const PROOF_SUMMARY_KEYS = [
  'trialBalanceBalanced',
  'balanceSheetEquationBalanced',
  'plugDetected',
  'roundingToleranceUsed',
  'computedTotalsSummary',
];
const COMPUTED_TOTALS_KEYS = ['totalDebits', 'totalCredits', 'totalAssets', 'totalLiabilities', 'totalEquity'];

function expectStableBlockerShape(blocker: { code: string; message: string; details: unknown; remediation?: string }) {
  expect(typeof blocker.code).toBe('string');
  expect(blocker.code.length).toBeGreaterThan(0);
  expect(typeof blocker.message).toBe('string');
  expect(blocker.message.length).toBeGreaterThan(0);
  expect(blocker.details).toBeDefined();
  expect(typeof blocker.details).toBe('object');
  expect(blocker.details).not.toBeNull();
}

describe('precheck_board_ready_service', () => {
  describe('runPrecheckBoardReady', () => {
    it('response includes contractVersion v1 and stable proofSummary shape', () => {
      const verdict = runPrecheckBoardReady({
        periodLabel: '2025-01',
        trialBalance: [{ accountName: 'Cash', debit: 100, credit: 0 }, { accountName: 'Equity', debit: 0, credit: 100 }],
      });
      expect(verdict.contractVersion).toBe('v1');
      expect(verdict.status).toBe('ready');
      expect(Object.keys(verdict.proofSummary)).toEqual(PROOF_SUMMARY_KEYS);
      expect(Object.keys(verdict.proofSummary.computedTotalsSummary)).toEqual(COMPUTED_TOTALS_KEYS);
    });

    it('balanced TB returns status ready and correct proofSummary', () => {
      const input: PrecheckBoardReadyInput = {
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Account Payable', debit: 0, credit: 200 },
          { accountName: 'Equity', debit: 0, credit: 800 },
        ],
      };
      const verdict = runPrecheckBoardReady(input);
      expect(verdict.contractVersion).toBe('v1');
      expect(verdict.status).toBe('ready');
      expect(verdict.blockers).toHaveLength(0);
      expect(verdict.warnings).toHaveLength(0);
      verdict.blockers.forEach(expectStableBlockerShape);
      verdict.warnings.forEach(expectStableBlockerShape);
      expect(verdict.proofSummary).toMatchObject({
        trialBalanceBalanced: true,
        balanceSheetEquationBalanced: true,
        plugDetected: false,
      });
      expect(verdict.proofSummary.computedTotalsSummary).toMatchObject({
        totalDebits: 1000,
        totalCredits: 1000,
      });
    });

    it('imbalanced TB returns not_ready with TRIAL_BALANCE_IMBALANCED', () => {
      const input: PrecheckBoardReadyInput = {
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 500 },
        ],
      };
      const verdict = runPrecheckBoardReady(input);
      expect(verdict.contractVersion).toBe('v1');
      expect(verdict.status).toBe('not_ready');
      const b = verdict.blockers.find((x) => x.code === PrecheckCode.TRIAL_BALANCE_IMBALANCED);
      expect(b).toBeDefined();
      expectStableBlockerShape(b!);
      expect(b!.details).toMatchObject({ totalDebits: 1000, totalCredits: 500 });
      expect(verdict.proofSummary.trialBalanceBalanced).toBe(false);
    });

    it('plug accounts (Suspense + Other) return not_ready with PLUG_ACCOUNTS_DETECTED', () => {
      const input: PrecheckBoardReadyInput = {
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Suspense', debit: 9000, credit: 0 },
          { accountName: 'Other', debit: 0, credit: 9000 },
        ],
      };
      const verdict = runPrecheckBoardReady(input);
      expect(verdict.contractVersion).toBe('v1');
      expect(verdict.status).toBe('not_ready');
      const b = verdict.blockers.find((x) => x.code === PrecheckCode.PLUG_ACCOUNTS_DETECTED);
      expect(b).toBeDefined();
      expectStableBlockerShape(b!);
      expect(verdict.proofSummary.plugDetected).toBe(true);
    });

    it('empty trialBalance returns not_ready with blocker (stable shape)', () => {
      const verdict = runPrecheckBoardReady({
        periodLabel: '2025-01',
        trialBalance: [],
      });
      expect(verdict.contractVersion).toBe('v1');
      expect(verdict.status).toBe('not_ready');
      expect(verdict.blockers.length).toBeGreaterThan(0);
      const b = verdict.blockers.find((x) => x.code === PrecheckCode.MISSING_TRIAL_BALANCE);
      expect(b).toBeDefined();
      expectStableBlockerShape(b!);
      expect(Object.keys(verdict.proofSummary)).toEqual(PROOF_SUMMARY_KEYS);
    });

    it('optional journalEntries are merged and reflected in totals', () => {
      const verdict = runPrecheckBoardReady({
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Account Payable', debit: 0, credit: 200 },
          { accountName: 'Equity', debit: 0, credit: 800 },
        ],
        journalEntries: [
          { accountRef: 'Cash', debit: 100, credit: 0 },
          { accountRef: 'Equity', debit: 0, credit: 100 },
        ],
      });
      expect(verdict.contractVersion).toBe('v1');
      expect(verdict.status).toBe('ready');
      expect(verdict.proofSummary.computedTotalsSummary).toMatchObject({
        totalDebits: 1100,
        totalCredits: 1100,
      });
    });
  });
});
