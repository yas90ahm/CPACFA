/**
 * Deterministic line ID: same logical line → same lineId; different order → same IDs.
 * Guards against UUID/insertion-order instability for audit clarity.
 */

import { describe, it, expect } from '@jest/globals';
import { computeLineId } from '../../src/utils/line_id.js';
import { parseTrialBalance } from '../../src/services/trialBalanceParser.js';
import type { RawTrialBalanceRow } from '../../src/services/trialBalanceParser.js';

describe('deterministic line ID', () => {
  it('same logical line produces same lineId', () => {
    const id1 = computeLineId({ accountName: 'Cash', debit: 1000, credit: 0 });
    const id2 = computeLineId({ accountName: 'Cash', debit: 1000, credit: 0 });
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[a-f0-9]{16}$/);
  });

  it('same logical lines in different insertion order produce identical lineIds', () => {
    const rows1: RawTrialBalanceRow[] = [
      { accountName: 'Cash', debit: 1000, credit: 0 },
      { accountName: 'Revenue', debit: 0, credit: 1000 },
    ];
    const rows2: RawTrialBalanceRow[] = [
      { accountName: 'Revenue', debit: 0, credit: 1000 },
      { accountName: 'Cash', debit: 1000, credit: 0 },
    ];
    const parsed1 = parseTrialBalance(rows1);
    const parsed2 = parseTrialBalance(rows2);
    const cash1 = parsed1.entries.find((e) => e.accountName === 'Cash');
    const cash2 = parsed2.entries.find((e) => e.accountName === 'Cash');
    const rev1 = parsed1.entries.find((e) => e.accountName === 'Revenue');
    const rev2 = parsed2.entries.find((e) => e.accountName === 'Revenue');
    expect(cash1?.lineId).toBe(cash2?.lineId);
    expect(rev1?.lineId).toBe(rev2?.lineId);
  });

  it('minor numeric formatting differences produce identical lineIds', () => {
    const id1 = computeLineId({ accountName: 'Cash', debit: 0.1 + 0.2, credit: 0 });
    const id2 = computeLineId({ accountName: 'Cash', debit: 0.3, credit: 0 });
    expect(id1).toBe(id2);
  });

  it('different logical lines produce different lineIds', () => {
    const id1 = computeLineId({ accountName: 'Cash', debit: 1000, credit: 0 });
    const id2 = computeLineId({ accountName: 'Revenue', debit: 0, credit: 1000 });
    const id3 = computeLineId({ accountName: 'Cash', debit: 999, credit: 0 });
    expect(id1).not.toBe(id2);
    expect(id1).not.toBe(id3);
  });

  it('same logical JE twice produces identical lineIds (via computeLineId)', () => {
    const jeLine = { accountName: 'Accrued Expense', debit: 500, credit: 0 };
    const id1 = computeLineId(jeLine);
    const id2 = computeLineId(jeLine);
    expect(id1).toBe(id2);
  });

  it('parsed trial balance: same CSV twice produces identical lineIds', () => {
    const rows: RawTrialBalanceRow[] = [
      { accountName: 'Cash', debit: 1000, credit: 0 },
      { accountName: 'Revenue', debit: 0, credit: 1000 },
    ];
    const p1 = parseTrialBalance(rows);
    const p2 = parseTrialBalance(rows);
    expect(p1.entries.length).toBe(p2.entries.length);
    for (let i = 0; i < p1.entries.length; i++) {
      const e1 = p1.entries[i];
      const e2 = p2.entries.find((e) => e.accountName === e1!.accountName);
      expect(e1?.lineId).toBe(e2?.lineId);
    }
  });
});
