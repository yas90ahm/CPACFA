/**
 * Deterministic canonical JSON and SHA-256 hash for ledger snapshots.
 * Hash contract: hash_version (required, "v1"), trialBalance, entries (optional). No timestamps, ids, createdAt.
 * Ordering: trialBalance.entries and entries are sorted by explicit entrySortKey before hashing; serializer does NOT sort arrays.
 */

import { createHash } from 'crypto';
import {
  canonicalStringifyKeysOnly,
  canonicalStringifyLegacy,
} from './canonical_json.js';
import type { LedgerSnapshotPayload, LedgerSnapshotEntry } from '../types/ledger_snapshot.js';

const HASH_VERSION = 'v1';
const ALLOWED_HASH_VERSIONS = new Set<string>(['v1']);

export class InvalidHashVersionError extends Error {
  constructor(version: unknown) {
    super(`Invalid hash_version: ${String(version)}. Allowed: ${[...ALLOWED_HASH_VERSIONS].join(', ')}`);
    this.name = 'InvalidHashVersionError';
  }
}

function isEntryLike(obj: unknown): obj is LedgerSnapshotEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'accountName' in obj &&
    typeof (obj as LedgerSnapshotEntry).accountName === 'string' &&
    typeof (obj as LedgerSnapshotEntry).debit === 'number' &&
    typeof (obj as LedgerSnapshotEntry).credit === 'number'
  );
}

/** Explicit sort key for domain entries: accountName, debit, credit, lineId, accountCode, description, provenance. */
function entrySortKey(e: LedgerSnapshotEntry): string {
  const prov =
    e.amountProvenance != null ? canonicalStringifyLegacy(e.amountProvenance) : '';
  return [
    String(e.accountName ?? ''),
    String(e.debit ?? 0),
    String(e.credit ?? 0),
    String(e.lineId ?? ''),
    String(e.accountCode ?? ''),
    String(e.description ?? ''),
    prov,
  ].join('\0');
}

/** Legacy canonicalize: sort object keys; omit undefined; sort entry arrays by entrySortKey. Used for legacy verification only. */
function legacyCanonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && isEntryLike(value[0])) {
      const sorted = [...value] as LedgerSnapshotEntry[];
      sorted.sort((a, b) => entrySortKey(a).localeCompare(entrySortKey(b)));
      return sorted.map((item) => legacyCanonicalize(item));
    }
    return value.map(legacyCanonicalize);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (obj[k] === undefined) continue;
    const c = legacyCanonicalize(obj[k]);
    if (c === undefined) continue;
    out[k] = c;
  }
  return out;
}

/**
 * Legacy canonical JSON (stable key order, stable entry order, omit undefined).
 * Used only for verifying snapshots created before hash_version was included in the hashed payload.
 */
export function canonicalSnapshotJson(payload: LedgerSnapshotPayload): string {
  const canon = legacyCanonicalize(payload) as LedgerSnapshotPayload;
  return JSON.stringify(canon);
}

/** Allowed top-level keys in the object we hash. No other keys permitted (structural drift protection). */
export const HASH_INPUT_ALLOWED_TOP_LEVEL_KEYS = new Set<string>(['hash_version', 'trialBalance', 'entries']);

/** Required top-level keys in hash input. */
export const HASH_INPUT_REQUIRED_TOP_LEVEL_KEYS = new Set<string>(['hash_version', 'trialBalance']);

/**
 * Normalize payload: sort trialBalance.entries and entries by explicit entrySortKey. Domain arrays only.
 */
function normalizePayloadForHash(payload: LedgerSnapshotPayload): LedgerSnapshotPayload {
  const tbEntries = [...(payload.trialBalance?.entries ?? [])].sort((a, b) =>
    entrySortKey(a).localeCompare(entrySortKey(b))
  );
  const extraEntries = payload.entries
    ? [...payload.entries].sort((a, b) => entrySortKey(a).localeCompare(entrySortKey(b)))
    : undefined;
  return {
    trialBalance: {
      entries: tbEntries,
      totalDebits: payload.trialBalance.totalDebits,
      totalCredits: payload.trialBalance.totalCredits,
    },
    ...(extraEntries && extraEntries.length > 0 && { entries: extraEntries }),
  };
}

/**
 * Hash input: hash_version (required, default "v1") + payload. No id, createdAt, or DB-generated fields.
 */
function buildHashInput(payload: LedgerSnapshotPayload): Record<string, unknown> {
  const normalized = normalizePayloadForHash(payload);
  return {
    hash_version: HASH_VERSION,
    ...normalized,
  };
}

/**
 * Validate hash_version is in allowed set. Throws InvalidHashVersionError if not.
 */
export function validateHashInput(hashInput: Record<string, unknown>): void {
  const v = hashInput.hash_version ?? 'v1';
  if (!ALLOWED_HASH_VERSIONS.has(String(v))) {
    throw new InvalidHashVersionError(v);
  }
}

/**
 * Compute SHA-256 hex hash of canonical snapshot JSON.
 * Payload is normalized (entries sorted by entrySortKey), then keys-only serialization (no generic array sort).
 */
export function hashSnapshotPayload(payload: LedgerSnapshotPayload): string {
  const hashInput = buildHashInput(payload);
  validateHashInput(hashInput);
  const json = canonicalStringifyKeysOnly(hashInput);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

/**
 * Legacy hash (no hash_version in payload). Used only for verifying old snapshots.
 */
export function hashSnapshotPayloadLegacy(payload: LedgerSnapshotPayload): string {
  const json = canonicalSnapshotJson(payload);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

export function getHashVersion(): string {
  return HASH_VERSION;
}

/** Numeric version for DB storage (hash_version column). v1 → 1. */
export function getHashVersionForStorage(): number {
  return HASH_VERSION === 'v1' ? 1 : 1;
}
