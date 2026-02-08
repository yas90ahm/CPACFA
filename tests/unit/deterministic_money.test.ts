/**
 * Deterministic money normalization: equivalent float representations produce identical hashes.
 * Guards against JS float drift (0.1+0.2 vs 0.3, 1000.000 vs 1000).
 */

import { describe, it, expect } from '@jest/globals';
import { hashSnapshotPayload, getHashVersionForStorage } from '../../src/lib/snapshot_hash.js';
import { computeLedgerHash } from '../../src/services/export_service.js';
import { buildSnapshotPayloadFromInput } from '../../src/services/ledger_snapshot_service.js';
import type { LedgerSnapshotPayload, CreateLedgerSnapshotInput } from '../../src/types/ledger_snapshot.js';

describe('deterministic money — no float drift', () => {
  it('0.1+0.2 and 0.3 produce same snapshot hash', () => {
    const a = 0.1 + 0.2; // JS: 0.30000000000000004
    const b = 0.3;

    const p1: LedgerSnapshotPayload = {
      trialBalance: {
        entries: [
          { accountName: 'Cash', debit: a, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: a },
        ],
        totalDebits: a,
        totalCredits: a,
      },
    };
    const p2: LedgerSnapshotPayload = {
      trialBalance: {
        entries: [
          { accountName: 'Cash', debit: b, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: b },
        ],
        totalDebits: b,
        totalCredits: b,
      },
    };

    const h1 = hashSnapshotPayload(p1, { hashVersion: getHashVersionForStorage() });
    const h2 = hashSnapshotPayload(p2, { hashVersion: getHashVersionForStorage() });
    expect(h1).toBe(h2);
  });

  it('1000 and 1000.000 produce same snapshot hash', () => {
    const p1: LedgerSnapshotPayload = {
      trialBalance: {
        entries: [
          { accountName: 'Cash', debit: 1000, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 1000 },
        ],
        totalDebits: 1000,
        totalCredits: 1000,
      },
    };
    const p2: LedgerSnapshotPayload = {
      trialBalance: {
        entries: [
          { accountName: 'Cash', debit: 1000.0, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 1000.0 },
        ],
        totalDebits: 1000.0,
        totalCredits: 1000.0,
      },
    };

    const h1 = hashSnapshotPayload(p1, { hashVersion: getHashVersionForStorage() });
    const h2 = hashSnapshotPayload(p2, { hashVersion: getHashVersionForStorage() });
    expect(h1).toBe(h2);
  });

  it('buildSnapshotPayloadFromInput + hash: 0.1+0.2 and 0.3 produce same hash', () => {
    const a = 0.1 + 0.2;
    const b = 0.3;

    const input1: CreateLedgerSnapshotInput = {
      tenantId: 't',
      periodLabel: '2025-01',
      source: 'close_session',
      trialBalance: {
        entries: [
          { accountName: 'Cash', debit: a, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: a },
        ],
        totalDebits: a,
        totalCredits: a,
      },
    };
    const input2: CreateLedgerSnapshotInput = {
      ...input1,
      trialBalance: {
        entries: [
          { accountName: 'Cash', debit: b, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: b },
        ],
        totalDebits: b,
        totalCredits: b,
      },
    };

    const payload1 = buildSnapshotPayloadFromInput(input1);
    const payload2 = buildSnapshotPayloadFromInput(input2);
    const h1 = hashSnapshotPayload(payload1, { hashVersion: getHashVersionForStorage() });
    const h2 = hashSnapshotPayload(payload2, { hashVersion: getHashVersionForStorage() });
    expect(h1).toBe(h2);
  });
});

describe('deterministic money — computeLedgerHash', () => {
  it('0.1+0.2 and 0.3 produce same ledger hash', () => {
    const a = 0.1 + 0.2;
    const b = 0.3;

    const ledger1 = [
      { account_name: 'Cash', debit: a, credit: 0, account_code: '1000', account_type: 'asset' },
      { account_name: 'Revenue', debit: 0, credit: a, account_code: '4000', account_type: 'revenue' },
    ];
    const ledger2 = [
      { account_name: 'Cash', debit: b, credit: 0, account_code: '1000', account_type: 'asset' },
      { account_name: 'Revenue', debit: 0, credit: b, account_code: '4000', account_type: 'revenue' },
    ];

    const h1 = computeLedgerHash(ledger1);
    const h2 = computeLedgerHash(ledger2);
    expect(h1).toBe(h2);
  });

  it('1000 and 1000.000 produce same ledger hash', () => {
    const ledger1 = [
      { account_name: 'Cash', debit: 1000, credit: 0, account_code: '1000', account_type: 'asset' },
      { account_name: 'Revenue', debit: 0, credit: 1000, account_code: '4000', account_type: 'revenue' },
    ];
    const ledger2 = [
      { account_name: 'Cash', debit: 1000.0, credit: 0, account_code: '1000', account_type: 'asset' },
      { account_name: 'Revenue', debit: 0, credit: 1000.0, account_code: '4000', account_type: 'revenue' },
    ];

    const h1 = computeLedgerHash(ledger1);
    const h2 = computeLedgerHash(ledger2);
    expect(h1).toBe(h2);
  });
});
