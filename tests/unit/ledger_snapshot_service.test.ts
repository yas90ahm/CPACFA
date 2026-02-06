/**
 * Unit tests for ledger_snapshot_service: verifySnapshotHash, payload building.
 */

import { describe, it, expect } from '@jest/globals';
import { verifySnapshotHash } from '../../src/services/ledger_snapshot_service.js';
import { hashSnapshotPayload } from '../../src/lib/snapshot_hash.js';
import type { LedgerSnapshot } from '../../src/types/ledger_snapshot.js';

function snapshot(overrides: Partial<LedgerSnapshot>): LedgerSnapshot {
  const payload = {
    trialBalance: {
      entries: [{ accountName: 'Cash', debit: 1000, credit: 0 }, { accountName: 'Revenue', debit: 0, credit: 1000 }],
      totalDebits: 1000,
      totalCredits: 1000,
    },
  };
  const snapshotHash = hashSnapshotPayload(payload);
  return {
    id: 'test-id',
    tenantId: 'tenant-1',
    periodLabel: '2025-01',
    createdAt: new Date().toISOString(),
    source: 'precheck',
    snapshotPayloadJson: payload,
    snapshotHash,
    hashVersion: 1,
    ...overrides,
  };
}

describe('ledger_snapshot_service', () => {
  describe('verifySnapshotHash', () => {
    it('returns true when stored hash matches computed hash', () => {
      const s = snapshot({});
      expect(verifySnapshotHash(s)).toBe(true);
    });

    it('returns false when stored hash does not match payload', () => {
      const s = snapshot({ snapshotHash: 'wrong' });
      expect(verifySnapshotHash(s)).toBe(false);
    });

    it('returns false when hash version is unsupported', () => {
      const s = snapshot({ hashVersion: 99 });
      expect(verifySnapshotHash(s)).toBe(false);
    });
  });
});
