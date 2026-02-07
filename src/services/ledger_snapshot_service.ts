/**
 * Ledger snapshot service: create immutable snapshots (TB + entries) and verify hash.
 * Used as foundation for certification and export/binder generation.
 *
 * Allowed snapshot payload structure (no drift):
 * - Top-level keys: "trialBalance" (required), "entries" (optional, only when extra entries exist).
 * - trialBalance: { entries: LedgerSnapshotEntry[], totalDebits: number, totalCredits: number }.
 * - entries: LedgerSnapshotEntry[] (additional lines in deterministic order).
 * No other top-level keys (e.g. no periodLabel, id, createdAt in payload; those live on the snapshot record).
 */

import type { Pool, PoolClient } from 'pg';

/** Pool or client (for transactional writes). Both expose .query(). */
type Queryable = Pool | PoolClient;
import type {
  LedgerSnapshot,
  LedgerSnapshotPayload,
  LedgerSnapshotEntry,
  LedgerSnapshotSource,
  CreateLedgerSnapshotInput,
  CreateLedgerSnapshotEntryInput,
} from '../types/ledger_snapshot.js';
import {
  hashSnapshotPayload,
  hashSnapshotPayloadLegacy,
  getHashVersion,
  getHashVersionForStorage,
} from '../lib/snapshot_hash.js';
import { insertLedgerSnapshot, getLedgerSnapshotById } from '../db/repositories/ledger_snapshot_repository.js';

/** Allowed top-level keys in LedgerSnapshotPayload. No other keys permitted (structural drift protection). */
export const SNAPSHOT_PAYLOAD_ALLOWED_TOP_LEVEL_KEYS = new Set<string>(['trialBalance', 'entries']);

/** Required top-level key; every payload must have trialBalance. */
export const SNAPSHOT_PAYLOAD_REQUIRED_TOP_LEVEL_KEYS = new Set<string>(['trialBalance']);

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
 * Build the same LedgerSnapshotPayload that would be stored (deterministic).
 * Used for reproducibility: rebuild state and re-hash to assert hash === stored snapshot_hash.
 */
export function buildSnapshotPayloadFromInput(input: CreateLedgerSnapshotInput): LedgerSnapshotPayload {
  const tbEntries = (input.trialBalance.entries ?? []).map(toSnapshotEntry);
  const extraEntries = (input.entries ?? []).map(toSnapshotEntry);
  return {
    trialBalance: {
      entries: tbEntries,
      totalDebits: input.trialBalance.totalDebits,
      totalCredits: input.trialBalance.totalCredits,
    },
    ...(extraEntries.length > 0 && { entries: extraEntries }),
  };
}

/**
 * Build payload from trial balance and optional additional entries, then create snapshot record.
 */
export async function createSnapshotFromTrialBalanceAndEntries(
  client: Queryable,
  input: CreateLedgerSnapshotInput
): Promise<LedgerSnapshot> {
  const payload = buildSnapshotPayloadFromInput(input);

  const snapshotHash = hashSnapshotPayload(payload);
  const hashVersion = getHashVersionForStorage();

  return insertLedgerSnapshot(client, {
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
 * Tries current format (hash_version in payload) then legacy (no hash_version).
 * Returns true if valid; false if tampered or hash version unsupported.
 */
export function verifySnapshotHash(snapshot: LedgerSnapshot): boolean {
  if (snapshot.hashVersion !== getHashVersionForStorage()) {
    return false;
  }
  const computed = hashSnapshotPayload(snapshot.snapshotPayloadJson);
  if (computed === snapshot.snapshotHash) return true;
  const legacyComputed = hashSnapshotPayloadLegacy(snapshot.snapshotPayloadJson);
  return legacyComputed === snapshot.snapshotHash;
}

