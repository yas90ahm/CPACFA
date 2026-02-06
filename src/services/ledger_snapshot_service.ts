/**
 * Ledger snapshot service: create immutable snapshots (TB + entries) and verify hash.
 * Used as foundation for certification and export/binder generation.
 */

import type { Pool } from 'pg';
import type {
  LedgerSnapshot,
  LedgerSnapshotPayload,
  LedgerSnapshotEntry,
  LedgerSnapshotSource,
  CreateLedgerSnapshotInput,
  CreateLedgerSnapshotEntryInput,
} from '../types/ledger_snapshot.js';
import { hashSnapshotPayload, getHashVersion } from '../lib/snapshot_hash.js';
import { insertLedgerSnapshot, getLedgerSnapshotById } from '../db/repositories/ledger_snapshot_repository.js';

/** Normalize to snapshot entry shape; preserve lineId and amountProvenance for audit trail. */
function toSnapshotEntry(row: CreateLedgerSnapshotEntryInput): LedgerSnapshotEntry {
  return {
    ...(row.lineId != null && row.lineId !== '' && { lineId: row.lineId }),
    accountName: String(row.accountName ?? '').trim(),
    debit: Number(row.debit) || 0,
    credit: Number(row.credit) || 0,
    ...(row.accountCode != null && { accountCode: String(row.accountCode).trim() }),
    ...(row.description != null && row.description !== '' && { description: String(row.description).trim() }),
    ...(row.amountProvenance != null && { amountProvenance: row.amountProvenance }),
  };
}

/**
 * Build payload from trial balance and optional additional entries, then create snapshot record.
 */
export async function createSnapshotFromTrialBalanceAndEntries(
  pool: Pool,
  input: CreateLedgerSnapshotInput
): Promise<LedgerSnapshot> {
  const tbEntries = (input.trialBalance.entries ?? []).map(toSnapshotEntry);
  const extraEntries = (input.entries ?? []).map(toSnapshotEntry);

  const payload: LedgerSnapshotPayload = {
    trialBalance: {
      entries: tbEntries,
      totalDebits: input.trialBalance.totalDebits,
      totalCredits: input.trialBalance.totalCredits,
    },
    ...(extraEntries.length > 0 && { entries: extraEntries }),
  };

  const snapshotHash = hashSnapshotPayload(payload);
  const hashVersion = getHashVersion();

  return insertLedgerSnapshot(pool, {
    tenantId: input.tenantId,
    periodLabel: input.periodLabel,
    createdBy: input.createdBy,
    source: input.source,
    snapshotPayloadJson: payload,
    snapshotHash,
    hashVersion,
    closeSessionId: input.closeSessionId,
  });
}

/**
 * Verify that the stored snapshot_hash matches the hash of the stored payload.
 * Returns true if valid; false if tampered or hash version unsupported.
 */
export function verifySnapshotHash(snapshot: LedgerSnapshot): boolean {
  if (snapshot.hashVersion !== getHashVersion()) {
    return false;
  }
  const computed = hashSnapshotPayload(snapshot.snapshotPayloadJson);
  return computed === snapshot.snapshotHash;
}

