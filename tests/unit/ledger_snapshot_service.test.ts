/**
 * Unit tests for ledger_snapshot_service: verifySnapshotHash, payload building.
 */

import { describe, it, expect } from '@jest/globals';
import { verifySnapshotHash } from '../../src/services/ledger_snapshot_service.js';
import { hashSnapshotPayload, getHashVersionForStorage } from '../../src/lib/snapshot_hash.js';
import type { LedgerSnapshot } from '../../src/types/ledger_snapshot.js';

function snapshot(overrides: Partial<LedgerSnapshot>): LedgerSnapshot {
  const payload = {
    trialBalance: {
      entries: [{ accountName: 'Cash', debit: 1000, credit: 0 }, { accountName: 'Revenue', debit: 0, credit: 1000 }],
      totalDebits: 1000,
      totalCredits: 1000,
    },
  };
  const hashVersion = getHashVersionForStorage();
  const snapshotHash = hashSnapshotPayload(payload, { hashVersion });
  return {
    id: 'test-id',
    tenantId: 'tenant-1',
    periodLabel: '2025-01',
    createdAt: new Date().toISOString(),
    source: 'precheck',
    snapshotPayloadJson: payload,
    snapshotHash,
    hashVersion,
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
      const s = snapshot({ hashVersion: 99 as unknown as number });
      expect(verifySnapshotHash(s)).toBe(false);
    });

    it('verifies snapshot with evidence manifest (v3)', () => {
      const payloadWithManifest = {
        trialBalance: {
          entries: [
            { accountName: 'Cash', debit: 1000, credit: 0 },
            { accountName: 'Revenue', debit: 0, credit: 1000 },
          ],
          totalDebits: 1000,
          totalCredits: 1000,
        },
        evidenceManifest: {
          journalEntries: [
            {
              journalEntryId: 'je-1',
              evidenceLinks: [
                {
                  evidenceId: 'ev-1',
                  hashSha256: 'abc123',
                  sizeBytes: 1024,
                  attachedBy: 'user@test.com',
                  attachedAt: '2025-01-01T00:00:00.000Z',
                  mimeType: 'application/pdf',
                },
              ],
            },
          ],
        },
      };
      const hashVersion = getHashVersionForStorage();
      const snapshotHash = hashSnapshotPayload(payloadWithManifest, { hashVersion });
      const s: LedgerSnapshot = {
        id: 'test-id',
        tenantId: 'tenant-1',
        periodLabel: '2025-01',
        createdAt: new Date().toISOString(),
        source: 'close_session',
        snapshotPayloadJson: payloadWithManifest,
        snapshotHash,
        hashVersion,
      };
      expect(verifySnapshotHash(s)).toBe(true);

      // Simulate DB round-trip: stringify + parse (like jsonb storage)
      const roundTripped = JSON.parse(JSON.stringify(payloadWithManifest));
      const s2: LedgerSnapshot = {
        ...s,
        snapshotPayloadJson: roundTripped,
      };
      expect(verifySnapshotHash(s2)).toBe(true);
    });

    it('verifies v5 snapshots and detects comparative TB tampering', () => {
      const payload = {
        trialBalance: {
          entries: [{ accountName: 'Cash', debit: 1000, credit: 0 }, { accountName: 'Equity', debit: 0, credit: 1000 }],
          totalDebits: 1000,
          totalCredits: 1000,
        },
        accountingContext: { standard: 'ASPE' },
        comparativeTrialBalance: {
          periodLabel: '2026-06',
          sourceSnapshotId: 'prior',
          sourceSnapshotHash: 'a'.repeat(64),
          entries: [{ accountName: 'Cash', debit: 900, credit: 0 }, { accountName: 'Equity', debit: 0, credit: 900 }],
          totalDebits: 900,
          totalCredits: 900,
        },
      };
      const hashVersion = 5;
      const s: LedgerSnapshot = {
        id: 'current',
        tenantId: 'tenant-1',
        periodLabel: '2026-07',
        createdAt: new Date().toISOString(),
        source: 'close_session',
        snapshotPayloadJson: payload,
        snapshotHash: hashSnapshotPayload(payload, { hashVersion }),
        hashVersion,
      };
      expect(verifySnapshotHash(s)).toBe(true);

      const tampered: LedgerSnapshot = {
        ...s,
        snapshotPayloadJson: {
          ...payload,
          comparativeTrialBalance: {
            ...payload.comparativeTrialBalance,
            totalDebits: 901,
          },
        },
      };
      expect(verifySnapshotHash(tampered)).toBe(false);
    });
  });
});
