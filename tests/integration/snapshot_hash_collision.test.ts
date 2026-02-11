/**
 * Snapshot hash: deterministic and collision-resistant.
 * Proves: same input → same hash; different input → different hash;
 * reorder → same hash; float drift within rounding → same hash.
 */

import { describe, it, expect } from '@jest/globals';
import { hashSnapshotPayload, getHashVersionForStorage } from '../../src/lib/snapshot_hash.js';
import type { LedgerSnapshotPayload } from '../../src/types/ledger_snapshot.js';

const hashVersion = getHashVersionForStorage();

function basePayload(): LedgerSnapshotPayload {
  return {
    trialBalance: {
      entries: [
        { accountName: 'Cash', debit: 1000, credit: 0 },
        { accountName: 'Revenue', debit: 0, credit: 1000 },
      ],
      totalDebits: 1000,
      totalCredits: 1000,
    },
  };
}

describe('Snapshot hash deterministic and collision-resistant', () => {
  it('1. SAME INPUT → SAME HASH', () => {
    const p = basePayload();
    const h1 = hashSnapshotPayload(p, { hashVersion });
    const h2 = hashSnapshotPayload(p, { hashVersion });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('2. SLIGHTLY DIFFERENT INPUT → DIFFERENT HASH (one account name differs by 1 char)', () => {
    const p1 = basePayload();
    const p2: LedgerSnapshotPayload = {
      trialBalance: {
        entries: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Revenu', debit: 0, credit: 1000 }, // "Revenue" → "Revenu" (drop 1 char)
        ],
        totalDebits: 1000,
        totalCredits: 1000,
      },
    };
    const h1 = hashSnapshotPayload(p1, { hashVersion });
    const h2 = hashSnapshotPayload(p2, { hashVersion });
    expect(h1).not.toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    expect(h2).toMatch(/^[a-f0-9]{64}$/);
  });

  it('3. REORDERED ENTRIES → SAME HASH (proves deterministic sort)', () => {
    const p1 = basePayload();
    const p2: LedgerSnapshotPayload = {
      trialBalance: {
        entries: [
          { accountName: 'Revenue', debit: 0, credit: 1000 },
          { accountName: 'Cash', debit: 1000, credit: 0 },
        ],
        totalDebits: 1000,
        totalCredits: 1000,
      },
    };
    const h1 = hashSnapshotPayload(p1, { hashVersion });
    const h2 = hashSnapshotPayload(p2, { hashVersion });
    expect(h1).toBe(h2);
  });

  it('4. FLOAT DRIFT → SAME HASH (amounts differ by 0.0000001, within rounding)', () => {
    const p1 = basePayload();
    const p2: LedgerSnapshotPayload = {
      trialBalance: {
        entries: [
          { accountName: 'Cash', debit: 1000 + 0.0000001, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 1000 - 0.0000001 },
        ],
        totalDebits: 1000 + 0.0000001,
        totalCredits: 1000 - 0.0000001,
      },
    };
    const h1 = hashSnapshotPayload(p1, { hashVersion });
    const h2 = hashSnapshotPayload(p2, { hashVersion });
    expect(h1).toBe(h2);
  });
});
