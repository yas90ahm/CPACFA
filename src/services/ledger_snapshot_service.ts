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
  HASH_VERSION_LEGACY,
  HASH_VERSION_CANONICAL_MONEY,
  HASH_VERSION_WITH_EVIDENCE_MANIFEST,
  HASH_VERSION_WITH_GL,
} from '../lib/snapshot_hash.js';
import { canonicalStringifyKeysOnly } from '../lib/canonical_json.js';
import { round2 } from '../utils/decimal.js';
import { insertLedgerSnapshot } from '../db/repositories/ledger_snapshot_repository.js';

/** Allowed top-level keys in LedgerSnapshotPayload. No other keys permitted (structural drift protection). */
export const SNAPSHOT_PAYLOAD_ALLOWED_TOP_LEVEL_KEYS = new Set<string>([
  'trialBalance',
  'entries',
  'evidenceManifest',
  'generalLedger',
]);

/** Required top-level key; every payload must have trialBalance. */
export const SNAPSHOT_PAYLOAD_REQUIRED_TOP_LEVEL_KEYS = new Set<string>(['trialBalance']);

/** Normalize to snapshot entry shape; preserve lineId, accountType, amountProvenance for audit trail. Uses round2 for deterministic debit/credit. */
function toSnapshotEntry(row: CreateLedgerSnapshotEntryInput): LedgerSnapshotEntry {
  return {
    ...(row.lineId != null && row.lineId !== '' && { lineId: row.lineId }),
    accountName: String(row.accountName ?? '').trim(),
    debit: round2(Number(row.debit) || 0),
    credit: round2(Number(row.credit) || 0),
    ...(row.accountCode != null && { accountCode: String(row.accountCode).trim() }),
    ...(row.accountType != null && row.accountType !== '' && { accountType: String(row.accountType).trim() }),
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
  const payload: LedgerSnapshotPayload = {
    trialBalance: {
      entries: tbEntries,
      totalDebits: round2(input.trialBalance.totalDebits ?? 0),
      totalCredits: round2(input.trialBalance.totalCredits ?? 0),
    },
    ...(extraEntries.length > 0 && { entries: extraEntries }),
  };
  if (input.evidenceManifest != null) {
    payload.evidenceManifest = JSON.parse(canonicalStringifyKeysOnly(input.evidenceManifest)) as LedgerSnapshotPayload['evidenceManifest'];
  }
  if (input.generalLedger != null && input.generalLedger.length > 0) {
    payload.generalLedger = input.generalLedger;
  }
  return payload;
}

/**
 * Build payload from trial balance and optional additional entries, then create snapshot record.
 */
export async function createSnapshotFromTrialBalanceAndEntries(
  client: Queryable,
  input: CreateLedgerSnapshotInput
): Promise<LedgerSnapshot> {
  const payload = buildSnapshotPayloadFromInput(input);
  const hasGL = payload.generalLedger != null && payload.generalLedger.length > 0;
  const hashVersion = hasGL ? 4 : getHashVersionForStorage();
  const snapshotHash = hashSnapshotPayload(payload, { hashVersion });

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
  const v = snapshot.hashVersion;
  if (
    v !== HASH_VERSION_LEGACY &&
    v !== HASH_VERSION_CANONICAL_MONEY &&
    v !== HASH_VERSION_WITH_EVIDENCE_MANIFEST &&
    v !== HASH_VERSION_WITH_GL
  ) {
    return false;
  }
  const computed = hashSnapshotPayload(snapshot.snapshotPayloadJson, { hashVersion: v });
  if (computed === snapshot.snapshotHash) return true;
  if (v === HASH_VERSION_LEGACY) {
    const legacyComputed = hashSnapshotPayloadLegacy(snapshot.snapshotPayloadJson);
    return legacyComputed === snapshot.snapshotHash;
  }
  return false;
}

/**
 * Recompute the snapshot hash using the same implementation as certification.
 * Returns { recomputedHash, hashMatches } for auditor verification.
 * Uses primary format for the snapshot's hashVersion; hashMatches uses same logic as verifySnapshotHash.
 */
export function recomputeAndVerifySnapshotHash(snapshot: LedgerSnapshot): {
  recomputedHash: string;
  hashMatches: boolean;
} {
  const v = snapshot.hashVersion;
  const recomputedHash =
    v === HASH_VERSION_LEGACY
      ? hashSnapshotPayloadLegacy(snapshot.snapshotPayloadJson)
      : hashSnapshotPayload(snapshot.snapshotPayloadJson, { hashVersion: v });
  const hashMatches = verifySnapshotHash(snapshot);
  return { recomputedHash, hashMatches };
}

