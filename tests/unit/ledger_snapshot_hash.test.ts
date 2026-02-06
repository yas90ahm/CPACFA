/**
 * Hash stability: same canonical payload => same hash; key/array order normalized.
 */

import { describe, it, expect } from '@jest/globals';
import {
  canonicalSnapshotJson,
  hashSnapshotPayload,
  getHashVersion,
} from '../../src/lib/snapshot_hash.js';
import type { LedgerSnapshotPayload } from '../../src/types/ledger_snapshot.js';

function payload(overrides?: Partial<LedgerSnapshotPayload>): LedgerSnapshotPayload {
  return {
    trialBalance: {
      entries: [
        { accountName: 'Cash', debit: 1000, credit: 0 },
        { accountName: 'Revenue', debit: 0, credit: 1000 },
      ],
      totalDebits: 1000,
      totalCredits: 1000,
    },
    ...overrides,
  };
}

describe('ledger snapshot hash', () => {
  it('same payload produces same hash', () => {
    const p = payload();
    const h1 = hashSnapshotPayload(p);
    const h2 = hashSnapshotPayload(p);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different payload produces different hash', () => {
    const h1 = hashSnapshotPayload(payload());
    const h2 = hashSnapshotPayload(
      payload({
        trialBalance: {
          entries: [{ accountName: 'Cash', debit: 999, credit: 0 }, { accountName: 'Revenue', debit: 0, credit: 999 }],
          totalDebits: 999,
          totalCredits: 999,
        },
      })
    );
    expect(h1).not.toBe(h2);
  });

  it('object key order does not affect hash (canonical key sort)', () => {
    const p1 = payload();
    const p2: LedgerSnapshotPayload = {
      trialBalance: {
        totalCredits: 1000,
        totalDebits: 1000,
        entries: [
          { credit: 0, debit: 1000, accountName: 'Cash' },
          { credit: 1000, debit: 0, accountName: 'Revenue' },
        ],
      },
    };
    expect(hashSnapshotPayload(p1)).toBe(hashSnapshotPayload(p2));
  });

  it('entry array order does not affect hash (canonical entry sort)', () => {
    const p1 = payload();
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
    expect(hashSnapshotPayload(p1)).toBe(hashSnapshotPayload(p2));
  });

  it('canonicalSnapshotJson is deterministic for same payload', () => {
    const p = payload();
    const j1 = canonicalSnapshotJson(p);
    const j2 = canonicalSnapshotJson(p);
    expect(j1).toBe(j2);
    const parsed = JSON.parse(j1);
    expect(parsed.trialBalance.entries[0].accountName).toBe('Cash');
    expect(parsed.trialBalance.entries[1].accountName).toBe('Revenue');
  });

  it('hash_version is 1', () => {
    expect(getHashVersion()).toBe(1);
  });
});
