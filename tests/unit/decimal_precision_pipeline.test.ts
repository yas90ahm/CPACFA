/**
 * Decimal Precision Pipeline Test
 *
 * Tests that the GL→TB→Adjusted TB→Statements pipeline
 * produces exact results with no floating-point drift.
 *
 * Uses values known to cause IEEE 754 errors:
 * - $0.10 + $0.20 must equal $0.30 (not $0.30000000000000004)
 * - Summing many small values must not accumulate drift
 * - D=C must hold to the penny through the entire pipeline
 */

import { describe, it, expect } from '@jest/globals';
import { parseGLCsv, groupAndNumberLines } from '../../src/services/gl_upload_service.js';
import { aggregateGLToTB } from '../../src/services/gl_to_tb_aggregation_service.js';
import { parseTrialBalance } from '../../src/services/trialBalanceParser.js';
import { mergeAdjustmentsIntoEntries } from '../../src/services/adjusted_trial_balance_service.js';
import { runIntegrityGate } from '../../src/services/integrity_gate_service.js';
import { buildValidatedStatements } from '../../src/services/financialStatements.js';
import { sumRound2 } from '../../src/utils/decimal.js';

describe('Decimal Precision Pipeline — GL ingest', () => {
  it('0.10 + 0.20 = 0.30 exactly in GL parse', () => {
    const csv = `entry_id,account_code,debit,credit
JE1,1000,0.10,0
JE1,2000,0.20,0
JE1,4000,0,0.30`;
    const rows = parseGLCsv(Buffer.from(csv, 'utf8'));
    expect(rows).toHaveLength(3);
    const lines = groupAndNumberLines(rows);
    const totalDebits = sumRound2(lines.map((l) => l.debit ?? 0));
    const totalCredits = sumRound2(lines.map((l) => l.credit ?? 0));
    expect(totalDebits).toBe(0.3);
    expect(totalCredits).toBe(0.3);
    expect(totalDebits).toBe(totalCredits);
  });

  it('1000 entries of $0.01 sum to exactly $10.00', () => {
    const lines = ['entry_id,account_code,debit,credit'];
    for (let i = 0; i < 1000; i++) {
      lines.push('JE' + i + ',1000,0.01,0');
      lines.push('JE' + i + ',4000,0,0.01');
    }
    const rows = parseGLCsv(Buffer.from(lines.join('\n'), 'utf8'));
    const grouped = groupAndNumberLines(rows);
    const totalDebits = sumRound2(grouped.map((l) => l.debit ?? 0));
    const totalCredits = sumRound2(grouped.map((l) => l.credit ?? 0));
    expect(totalDebits).toBe(10);
    expect(totalCredits).toBe(10);
    expect(totalDebits - totalCredits).toBe(0);
  });
});

describe('Decimal Precision Pipeline — TB parser', () => {
  it('0.10 + 0.20 = 0.30 exactly in TB parse', () => {
    const rows = [
      { accountName: 'Cash', debit: 0.1, credit: 0 },
      { accountName: 'AR', debit: 0.2, credit: 0 },
      { accountName: 'Revenue', debit: 0, credit: 0.3 },
    ];
    const result = parseTrialBalance(rows);
    expect(result.totalDebits).toBe(0.3);
    expect(result.totalCredits).toBe(0.3);
    expect(result.balances).toBe(true);
  });

  it('1000 rows of $0.01 sum to exactly $10.00', () => {
    const rows: Array<{ accountName: string; debit: number; credit: number }> = [];
    for (let i = 0; i < 1000; i++) {
      rows.push({ accountName: `Acct${i}`, debit: 0.01, credit: 0 });
    }
    rows.push({ accountName: 'Revenue', debit: 0, credit: 10 });
    const result = parseTrialBalance(rows);
    expect(result.totalDebits).toBe(10);
    expect(result.totalCredits).toBe(10);
    expect(result.balances).toBe(true);
  });
});

describe('Decimal Precision Pipeline — GL→TB aggregation', () => {
  it('aggregateGLToTB: D=C holds exactly', () => {
    const glLines = [
      { account_code: '1000', debit: 0.1, credit: 0, entry_id: '1', line_number: 1, entry_date: '2025-01-01', tenant_id: 't', period_label: '2025-01' },
      { account_code: '4000', debit: 0, credit: 0.2, entry_id: '1', line_number: 2, entry_date: '2025-01-01', tenant_id: 't', period_label: '2025-01' },
      { account_code: '1000', debit: 0.2, credit: 0, entry_id: '2', line_number: 1, entry_date: '2025-01-01', tenant_id: 't', period_label: '2025-01' },
      { account_code: '4000', debit: 0, credit: 0.2, entry_id: '2', line_number: 2, entry_date: '2025-01-01', tenant_id: 't', period_label: '2025-01' },
    ];
    const coaAccounts = [
      { account_code: '1000', account_name: 'Cash', account_type: 'Asset' as const, tenant_id: 't' },
      { account_code: '4000', account_name: 'Revenue', account_type: 'Revenue' as const, tenant_id: 't' },
    ];
    const entries = aggregateGLToTB(glLines, coaAccounts);
    const totalDebits = sumRound2(entries.map((e) => e.total_debits));
    const totalCredits = sumRound2(entries.map((e) => e.total_credits));
    expect(totalDebits).toBe(0.3);
    expect(totalCredits).toBe(0.4);
    // This specific setup: 0.1+0.2 debits, 0.2+0.2 credits - not balanced, but aggregation is exact
    expect(totalDebits - totalCredits).toBeCloseTo(-0.1, 10);
  });

  it('aggregateGLToTB: balanced entries produce D=C', () => {
    const glLines = [
      { account_code: '1000', debit: 0.3, credit: 0, entry_id: '1', line_number: 1, entry_date: '2025-01-01', tenant_id: 't', period_label: '2025-01' },
      { account_code: '4000', debit: 0, credit: 0.3, entry_id: '1', line_number: 2, entry_date: '2025-01-01', tenant_id: 't', period_label: '2025-01' },
    ];
    const coaAccounts = [
      { account_code: '1000', account_name: 'Cash', account_type: 'Asset' as const, tenant_id: 't' },
      { account_code: '4000', account_name: 'Revenue', account_type: 'Revenue' as const, tenant_id: 't' },
    ];
    const entries = aggregateGLToTB(glLines, coaAccounts);
    const totalDebits = sumRound2(entries.map((e) => e.total_debits));
    const totalCredits = sumRound2(entries.map((e) => e.total_credits));
    expect(totalDebits).toBe(0.3);
    expect(totalCredits).toBe(0.3);
    expect(totalDebits).toBe(totalCredits);
  });
});

describe('Decimal Precision Pipeline — Adjusted TB merge', () => {
  it('mergeAdjustmentsIntoEntries: D=C after AJE', () => {
    const unadjusted = [
      { accountName: 'Cash', debit: 0.1, credit: 0 },
      { accountName: 'Revenue', debit: 0, credit: 0.2 },
    ];
    const adjustments = [
      {
        debits: [{ account: 'Cash', amount: 0.2 }],
        credits: [{ account: 'Revenue', amount: 0.2 }],
      },
    ];
    const merged = mergeAdjustmentsIntoEntries(unadjusted, adjustments);
    const totalDebits = sumRound2(merged.map((e) => e.debit ?? 0));
    const totalCredits = sumRound2(merged.map((e) => e.credit ?? 0));
    expect(totalDebits).toBe(0.3);
    expect(totalCredits).toBe(0.4);
  });
});

describe('Decimal Precision Pipeline — Integrity gate', () => {
  it('runIntegrityGate: A=L+E holds exactly', () => {
    const result = runIntegrityGate({
      trialBalance: {
        totalDebits: 1000.01,
        totalCredits: 1000.01,
      },
      balanceSheet: {
        totalAssets: 1000.01,
        totalLiabilities: 500.01,
        totalEquity: 500,
      },
    });
    expect(result.passed).toBe(true);
    expect(result.checks?.balanceSheetBalances).toBe(true);
  });

  it('runIntegrityGate: D=C holds exactly', () => {
    const result = runIntegrityGate({
      trialBalance: {
        entries: [
          { debit: 0.1, credit: 0 },
          { debit: 0.2, credit: 0 },
          { debit: 0, credit: 0.3 },
        ],
      },
      balanceSheet: {
        totalAssets: 0.3,
        totalLiabilities: 0,
        totalEquity: 0.3,
      },
    });
    expect(result.passed).toBe(true);
    expect(result.checks?.trialBalanceBalances).toBe(true);
  });
});

describe('Decimal Precision Pipeline — Statement generation', () => {
  it('buildValidatedStatements: A=L+E from 0.1+0.2 trial balance', () => {
    const tbResult = {
      entries: [
        { accountName: 'Cash', debit: 0.3, credit: 0, lineId: 'l1', accountType: 'ASSET' as const },
        { accountName: 'Revenue', debit: 0, credit: 0.3, lineId: 'l2', accountType: 'REVENUE' as const },
      ],
      totalDebits: 0.3,
      totalCredits: 0.3,
      balances: true,
      errors: [] as string[],
    };
    const out = buildValidatedStatements(tbResult);
    const a = out.balanceSheet.totalAssets;
    const l = out.balanceSheet.totalLiabilities;
    const e = out.balanceSheet.totalEquity;
    expect(Math.abs(a - (l + e))).toBeLessThan(0.01);
  });
});
