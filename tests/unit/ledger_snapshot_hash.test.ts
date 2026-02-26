/**
 * Hash stability: same canonical payload => same hash; key/array order normalized.
 * Structural drift: payload and hash input must have exact allowed top-level keys only.
 */

import { describe, it, expect } from '@jest/globals';
import {
  canonicalSnapshotJson,
  hashSnapshotPayload,
  getHashVersion,
  getHashVersionForStorage,
  validateHashInput,
  InvalidHashVersionError,
  HASH_INPUT_ALLOWED_TOP_LEVEL_KEYS,
  HASH_INPUT_REQUIRED_TOP_LEVEL_KEYS,
} from '../../src/lib/snapshot_hash.js';
import {
  buildSnapshotPayloadFromInput,
  SNAPSHOT_PAYLOAD_ALLOWED_TOP_LEVEL_KEYS,
  SNAPSHOT_PAYLOAD_REQUIRED_TOP_LEVEL_KEYS,
} from '../../src/services/ledger_snapshot_service.js';
import type {
  LedgerSnapshotPayload,
  CreateLedgerSnapshotInput,
} from '../../src/types/ledger_snapshot.js';

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

  it('hash_version is v1', () => {
    expect(getHashVersion()).toBe('v1');
  });

  it('omitting hash_version in validateHashInput defaults to v1 and passes', () => {
    const hashInput = { trialBalance: { entries: [], totalDebits: 0, totalCredits: 0 } };
    expect(() => validateHashInput(hashInput)).not.toThrow();
  });

  it('invalid hash_version fails deterministically', () => {
    const hashInput = { hash_version: 'v2', trialBalance: { entries: [], totalDebits: 0, totalCredits: 0 } };
    expect(() => validateHashInput(hashInput)).toThrow(InvalidHashVersionError);
    expect(() => validateHashInput(hashInput)).toThrow(/Invalid hash_version/);
  });

  it('identical entries in different order produce same hash (explicit entrySortKey)', () => {
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

  it('same input yields identical hash across multiple runs', () => {
    const p = payload();
    const hashes = [1, 2, 3].map(() => hashSnapshotPayload(p));
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).toBe(hashes[2]);
  });

  it('same logical data with different key ordering yields identical hash', () => {
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

  it('different data yields different hash', () => {
    const h1 = hashSnapshotPayload(payload());
    const h2 = hashSnapshotPayload(
      payload({
        trialBalance: {
          entries: [
            { accountName: 'Cash', debit: 1, credit: 0 },
            { accountName: 'Revenue', debit: 0, credit: 1 },
          ],
          totalDebits: 1,
          totalCredits: 1,
        },
      })
    );
    expect(h1).not.toBe(h2);
  });

  it('extra fields in payload are stripped and do not affect hash (proves we exclude id, timestamps)', () => {
    const p = payload();
    const hNormal = hashSnapshotPayload(p);
    const withId = { ...p, id: 'db-generated-uuid' } as LedgerSnapshotPayload & { id: string };
    const hWithId = hashSnapshotPayload(withId);
    expect(hNormal).toBe(hWithId);
  });
});

describe('snapshot payload structure (drift protection)', () => {
  function assertPayloadTopLevelKeys(p: Record<string, unknown>): void {
    const keys = Object.keys(p);
    for (const k of keys) {
      expect(SNAPSHOT_PAYLOAD_ALLOWED_TOP_LEVEL_KEYS.has(k)).toBe(true);
    }
    for (const req of SNAPSHOT_PAYLOAD_REQUIRED_TOP_LEVEL_KEYS) {
      expect(keys).toContain(req);
    }
    const maxKeys = SNAPSHOT_PAYLOAD_ALLOWED_TOP_LEVEL_KEYS.size;
    expect(keys.length).toBeLessThanOrEqual(maxKeys);
  }

  function assertHashInputTopLevelKeys(hashInput: Record<string, unknown>): void {
    const keys = Object.keys(hashInput);
    for (const k of keys) {
      expect(HASH_INPUT_ALLOWED_TOP_LEVEL_KEYS.has(k)).toBe(true);
    }
    for (const req of HASH_INPUT_REQUIRED_TOP_LEVEL_KEYS) {
      expect(keys).toContain(req);
    }
    expect(keys.length).toBeLessThanOrEqual(HASH_INPUT_ALLOWED_TOP_LEVEL_KEYS.size);
  }

  it('payload from buildSnapshotPayloadFromInput has exact allowed top-level keys (trialBalance required)', () => {
    const input: CreateLedgerSnapshotInput = {
      tenantId: 't',
      periodLabel: '2025-01',
      source: 'close_session',
      trialBalance: {
        entries: [{ accountName: 'Cash', debit: 1000, credit: 0 }, { accountName: 'RE', debit: 0, credit: 1000 }],
        totalDebits: 1000,
        totalCredits: 1000,
      },
    };
    const p = buildSnapshotPayloadFromInput(input);
    assertPayloadTopLevelKeys(p as unknown as Record<string, unknown>);
    expect(Object.keys(p)).toEqual(['trialBalance']);
  });

  it('payload with optional entries has only trialBalance and entries at top level', () => {
    const input: CreateLedgerSnapshotInput = {
      tenantId: 't',
      periodLabel: '2025-01',
      source: 'close_session',
      trialBalance: {
        entries: [{ accountName: 'Cash', debit: 1000, credit: 0 }],
        totalDebits: 1000,
        totalCredits: 1000,
      },
      entries: [{ accountName: 'Adjustment', debit: 0, credit: 100 }],
    };
    const p = buildSnapshotPayloadFromInput(input);
    assertPayloadTopLevelKeys(p as unknown as Record<string, unknown>);
    expect(Object.keys(p).sort()).toEqual(['entries', 'trialBalance']);
  });

  it('no additional unexpected top-level keys in payload', () => {
    const p = payload() as unknown as Record<string, unknown>;
    assertPayloadTopLevelKeys(p);
    const withDrift = { ...p, periodLabel: '2025-01' };
    expect(SNAPSHOT_PAYLOAD_ALLOWED_TOP_LEVEL_KEYS.has('periodLabel')).toBe(false);
    const keysWithDrift = Object.keys(withDrift);
    const hasUnexpected = keysWithDrift.some((k) => !SNAPSHOT_PAYLOAD_ALLOWED_TOP_LEVEL_KEYS.has(k));
    expect(hasUnexpected).toBe(true);
  });

  it('hash input has exact allowed top-level keys (hash_version, trialBalance; entries optional)', () => {
    const p = payload();
    const hashInput = { hash_version: getHashVersion(), ...p };
    assertHashInputTopLevelKeys(hashInput);
    expect(Object.keys(hashInput).sort()).toEqual(['hash_version', 'trialBalance']);
    expect(hashInput.hash_version).toBe('v1');
  });

  it('hash input with entries has only hash_version, trialBalance, entries', () => {
    const p = payload({ entries: [{ accountName: 'Extra', debit: 0, credit: 1 }] });
    const hashInput = { hash_version: getHashVersion(), ...p };
    assertHashInputTopLevelKeys(hashInput);
    expect(Object.keys(hashInput).sort()).toEqual(['entries', 'hash_version', 'trialBalance']);
  });
});
