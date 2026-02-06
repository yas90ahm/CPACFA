/**
 * Unit tests for precheck board-ready service (deterministic structural check).
 */

import { describe, it, expect } from '@jest/globals';
import {
  runPrecheckBoardReady,
  type PrecheckBoardReadyInput,
} from '../../src/services/precheck_board_ready_service.js';

describe('precheck_board_ready_service', () => {
  describe('runPrecheckBoardReady', () => {
    it('balanced TB returns status ready and correct proofSummary', () => {
      const input: PrecheckBoardReadyInput = {
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 1000 },
        ],
      };
      const verdict = runPrecheckBoardReady(input);
      expect(verdict.status).toBe('ready');
      expect(verdict.blockers).toHaveLength(0);
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
      expect(verdict.status).toBe('not_ready');
      const code = verdict.blockers.find((b) => b.code === 'TRIAL_BALANCE_IMBALANCED');
      expect(code).toBeDefined();
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
      expect(verdict.status).toBe('not_ready');
      const code = verdict.blockers.find((b) => b.code === 'PLUG_ACCOUNTS_DETECTED');
      expect(code).toBeDefined();
      expect(verdict.proofSummary.plugDetected).toBe(true);
    });

    it('empty trialBalance returns not_ready with blocker', () => {
      const verdict = runPrecheckBoardReady({
        periodLabel: '2025-01',
        trialBalance: [],
      });
      expect(verdict.status).toBe('not_ready');
      expect(verdict.blockers.length).toBeGreaterThan(0);
      expect(verdict.blockers.some((b) => b.code === 'MISSING_TRIAL_BALANCE')).toBe(true);
    });

    it('optional journalEntries are merged and reflected in totals', () => {
      const verdict = runPrecheckBoardReady({
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 1000 },
        ],
        journalEntries: [
          { accountRef: 'Cash', debit: 100, credit: 0 },
          { accountRef: 'Revenue', debit: 0, credit: 100 },
        ],
      });
      expect(verdict.status).toBe('ready');
      expect(verdict.proofSummary.computedTotalsSummary).toMatchObject({
        totalDebits: 1100,
        totalCredits: 1100,
      });
    });
  });
});
