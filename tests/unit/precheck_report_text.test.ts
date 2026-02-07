/**
 * Unit tests for precheck text report (deterministic verdict -> human-readable string).
 */

import { describe, it, expect } from '@jest/globals';
import {
  precheckVerdictToText,
  type PrecheckVerdictForReport,
} from '../../src/lib/precheck_report_text.js';

describe('precheck_report_text', () => {
  const readyVerdict: PrecheckVerdictForReport = {
    contractVersion: 'v1',
    status: 'ready',
    blockers: [],
    warnings: [],
    proofSummary: {
      trialBalanceBalanced: true,
      balanceSheetEquationBalanced: true,
      plugDetected: false,
      roundingToleranceUsed: 0.01,
      computedTotalsSummary: {
        totalDebits: 1000,
        totalCredits: 1000,
        totalAssets: 500,
        totalLiabilities: 200,
        totalEquity: 300,
      },
    },
  };

  it('includes period and status in header when periodLabel provided', () => {
    const text = precheckVerdictToText(readyVerdict, '2025-01');
    expect(text).toContain('Period: 2025-01');
    expect(text).toContain('Status: ready');
  });

  it('omits period line when periodLabel not provided', () => {
    const text = precheckVerdictToText(readyVerdict);
    expect(text).toContain('Status: ready');
    expect(text).not.toMatch(/^Period:/m);
  });

  it('renders Blockers: None and Warnings: None when empty', () => {
    const text = precheckVerdictToText(readyVerdict, '2025-01');
    expect(text).toContain('Blockers:\n  None');
    expect(text).toContain('Warnings:\n  None');
  });

  it('renders blockers with code and remediation when present', () => {
    const verdict: PrecheckVerdictForReport = {
      ...readyVerdict,
      status: 'not_ready',
      blockers: [
        {
          code: 'TRIAL_BALANCE_IMBALANCED',
          message: 'Blocked until resolved: debits and credits do not match.',
          details: { totalDebits: 1000, totalCredits: 500 },
          remediation: 'Reconcile debits and credits or add adjusting entries.',
        },
      ],
    };
    const text = precheckVerdictToText(verdict, '2025-01');
    expect(text).toContain('TRIAL_BALANCE_IMBALANCED');
    expect(text).toContain('Reconcile debits and credits or add adjusting entries.');
  });

  it('falls back to message when remediation missing for blocker', () => {
    const verdict: PrecheckVerdictForReport = {
      ...readyVerdict,
      status: 'not_ready',
      blockers: [
        {
          code: 'PLUG_ACCOUNTS_DETECTED',
          message: 'Blocked until resolved: reclassify plug accounts.',
          details: {},
        },
      ],
    };
    const text = precheckVerdictToText(verdict);
    expect(text).toContain('PLUG_ACCOUNTS_DETECTED');
    expect(text).toContain('Blocked until resolved: reclassify plug accounts.');
  });

  it('renders warnings with code and message', () => {
    const verdict: PrecheckVerdictForReport = {
      ...readyVerdict,
      warnings: [
        {
          code: 'SOME_WARNING',
          message: 'Optional note.',
          details: {},
        },
      ],
    };
    const text = precheckVerdictToText(verdict, '2025-02');
    expect(text).toContain('SOME_WARNING');
    expect(text).toContain('Optional note.');
  });

  it('includes proof summary totals deterministically', () => {
    const text = precheckVerdictToText(readyVerdict, '2025-01');
    expect(text).toContain('Trial balance balanced: true');
    expect(text).toContain('Balance sheet equation balanced: true');
    expect(text).toContain('Plug detected: false');
    expect(text).toContain('Rounding tolerance used: 0.01');
    expect(text).toContain('Totals: Debits 1000  Credits 1000  Assets 500  Liabilities 200  Equity 300');
  });
});
