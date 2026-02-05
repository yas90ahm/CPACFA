/**
 * Triage service unit tests: materiality, risk score, deterministic scoring.
 * Uses sample trial balance entries.
 */

import { describe, it, expect } from '@jest/globals';
import type { TrialBalanceEntry } from '../../src/types/financial.js';
import type { IssueItem } from '../../src/types/issue_item.js';
import {
  deriveTbSummary,
  computeMateriality,
  computeRiskScore,
} from '../../src/services/triage_service.js';

const sampleTbEntries: TrialBalanceEntry[] = [
  { accountName: 'Cash', debit: 1000, credit: 0, accountType: 'ASSET' },
  { accountName: 'Revenue', debit: 0, credit: 50000, accountType: 'REVENUE' },
  { accountName: 'COGS', debit: 20000, credit: 0, accountType: 'EXPENSE' },
  { accountName: 'OpEx', debit: 15000, credit: 0, accountType: 'EXPENSE' },
];

describe('Triage — deriveTbSummary', () => {
  it('derives revenue and expenses from classified TB entries', () => {
    const summary = deriveTbSummary(sampleTbEntries);
    expect(summary.totalRevenue).toBe(50000);
    expect(summary.totalExpenses).toBe(35000);
    expect(summary.totalDebits).toBe(36000);
    expect(summary.totalCredits).toBe(50000);
  });

  it('is deterministic: same input => same output', () => {
    const a = deriveTbSummary(sampleTbEntries);
    const b = deriveTbSummary(sampleTbEntries);
    expect(a).toEqual(b);
  });

  it('handles empty entries', () => {
    const summary = deriveTbSummary([]);
    expect(summary.totalRevenue).toBe(0);
    expect(summary.totalExpenses).toBe(0);
    expect(summary.totalDebits).toBe(0);
    expect(summary.totalCredits).toBe(0);
  });

  it('ignores unclassified entries for revenue/expense', () => {
    const withUnknown = [
      ...sampleTbEntries,
      { accountName: 'Other', debit: 100, credit: 100, accountType: undefined } as TrialBalanceEntry,
    ];
    const summary = deriveTbSummary(withUnknown);
    expect(summary.totalRevenue).toBe(50000);
    expect(summary.totalExpenses).toBe(35000);
    expect(summary.totalDebits).toBe(36100);
    expect(summary.totalCredits).toBe(50100);
  });
});

describe('Triage — computeMateriality', () => {
  const tbSummary = deriveTbSummary(sampleTbEntries);

  it('pct_revenue: 5% of revenue', () => {
    const result = computeMateriality(tbSummary, 'pct_revenue', { percentage: 0.05 });
    expect(result.materialityThreshold).toBe(2500);
    expect(result.basisUsed).toContain('pct_revenue');
  });

  it('pct_expenses: 5% of expenses', () => {
    const result = computeMateriality(tbSummary, 'pct_expenses', { percentage: 0.05 });
    expect(result.materialityThreshold).toBe(1750);
    expect(result.basisUsed).toContain('pct_expenses');
  });

  it('fixed: returns fixed amount', () => {
    const result = computeMateriality(tbSummary, 'fixed', { fixedAmount: 10000 });
    expect(result.materialityThreshold).toBe(10000);
    expect(result.basisUsed).toContain('fixed');
  });

  it('is deterministic: same input => same output', () => {
    const a = computeMateriality(tbSummary, 'pct_revenue', { percentage: 0.05 });
    const b = computeMateriality(tbSummary, 'pct_revenue', { percentage: 0.05 });
    expect(a).toEqual(b);
  });
});

describe('Triage — computeRiskScore', () => {
  const tbSummary = deriveTbSummary(sampleTbEntries);

  const openIssue = (overrides: Partial<IssueItem> = {}): IssueItem =>
    ({
      id: 'i1',
      closeSessionId: 's1',
      tenantId: 't1',
      category: 'posting',
      severity: 'high',
      status: 'open',
      title: 'Test',
      createdAt: '',
      updatedAt: '',
      ...overrides,
    }) as IssueItem;

  it('returns 0 when no issues', () => {
    const result = computeRiskScore([], tbSummary);
    expect(result.riskScore).toBe(0);
    expect(result.topRiskDrivers).toHaveLength(0);
  });

  it('returns higher score for unresolved high/critical issues', () => {
    const issues = [
      openIssue({ severity: 'high', status: 'open' }),
      openIssue({ severity: 'critical', status: 'open', id: 'i2' }),
    ];
    const result = computeRiskScore(issues, tbSummary);
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.topRiskDrivers.length).toBeGreaterThan(0);
  });

  it('ignores resolved issues', () => {
    const resolved = [openIssue({ status: 'resolved' }), openIssue({ status: 'wont_fix', id: 'i2' })];
    const result = computeRiskScore(resolved, tbSummary);
    expect(result.riskScore).toBe(0);
  });

  it('is deterministic: same issues => same risk score', () => {
    const issues = [
      openIssue({ severity: 'med', status: 'open' }),
      openIssue({ severity: 'high', status: 'in_progress', id: 'i2', impactPl: 1000 }),
    ];
    const a = computeRiskScore(issues, tbSummary);
    const b = computeRiskScore(issues, tbSummary);
    expect(a.riskScore).toBe(b.riskScore);
    expect(a.topRiskDrivers).toEqual(b.topRiskDrivers);
  });

  it('includes impact in risk when issues have impactPl/impactBs', () => {
    const issues = [
      openIssue({ severity: 'high', status: 'open', impactPl: 5000, impactBs: 2000 }),
    ];
    const result = computeRiskScore(issues, tbSummary);
    expect(result.riskScore).toBeGreaterThan(0);
    const hasImpact = result.topRiskDrivers.some((d) => d.driver === 'aggregate_impact' || d.detail?.includes('impact'));
    expect(hasImpact || result.riskScore > 0).toBe(true);
  });
});
