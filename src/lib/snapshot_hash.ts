/**
 * Deterministic canonical JSON and SHA-256 hash for ledger snapshots.
 * Hash contract: hash_version (required, "v1"), trialBalance, entries (optional). No timestamps, ids, createdAt.
 * Ordering: trialBalance.entries and entries are sorted by explicit entrySortKey before hashing; serializer does NOT sort arrays.
 *
 * Hash version 2: amounts (debit, credit, totalDebits, totalCredits) are canonical strings ("1234.56") to eliminate JS float drift.
 */

import { createHash } from 'crypto';
import {
  canonicalStringifyKeysOnly,
  canonicalStringifyLegacy,
} from './canonical_json.js';
import { normalizeMoney } from '../utils/decimal.js';
import type {
  LedgerSnapshotPayload,
  LedgerSnapshotEntry,
  EvidenceManifest,
} from '../types/ledger_snapshot.js';

const HASH_VERSION = 'v1';
const ALLOWED_HASH_VERSIONS = new Set<string>(['v1']);

/** Hash version for DB: 1 = legacy (numbers), 2 = canonical money strings, 3 = + evidence manifest. */
export const HASH_VERSION_LEGACY = 1;
export const HASH_VERSION_CANONICAL_MONEY = 2;
export const HASH_VERSION_WITH_EVIDENCE_MANIFEST = 3;

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
    (typeof (obj as LedgerSnapshotEntry).debit === 'number' || typeof (obj as LedgerSnapshotEntry).debit === 'string') &&
    (typeof (obj as LedgerSnapshotEntry).credit === 'number' || typeof (obj as LedgerSnapshotEntry).credit === 'string')
  );
}

/** Explicit sort key for domain entries: accountName, debit, credit, lineId, accountCode, description, provenance. Uses normalizeMoney for stable sort. */
function entrySortKey(e: LedgerSnapshotEntry): string {
  const prov =
    e.amountProvenance != null ? canonicalStringifyLegacy(e.amountProvenance) : '';
  return [
    String(e.accountName ?? ''),
    normalizeMoney(e.debit ?? 0),
    normalizeMoney(e.credit ?? 0),
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
export const HASH_INPUT_ALLOWED_TOP_LEVEL_KEYS = new Set<string>([
  'hash_version',
  'trialBalance',
  'entries',
  'evidenceManifest',
]);

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
 * Transform amounts to canonical strings for hash input (eliminates JS float drift).
 * Used when hashVersion >= HASH_VERSION_CANONICAL_MONEY.
 */
function toCanonicalMoneyPayload(payload: LedgerSnapshotPayload): Record<string, unknown> {
  const mapEntry = (e: LedgerSnapshotEntry): Record<string, unknown> => {
    const out: Record<string, unknown> = {
      accountName: e.accountName ?? '',
      debit: normalizeMoney(e.debit ?? 0),
      credit: normalizeMoney(e.credit ?? 0),
    };
    if (e.lineId != null && e.lineId !== '') out.lineId = e.lineId;
    if (e.accountCode != null) out.accountCode = e.accountCode;
    if (e.description != null && e.description !== '') out.description = e.description;
    if (e.amountProvenance != null) out.amountProvenance = e.amountProvenance;
    return out;
  };
  const tb = payload.trialBalance;
  const trialBalance = {
    entries: tb.entries.map(mapEntry),
    totalDebits: normalizeMoney(tb.totalDebits),
    totalCredits: normalizeMoney(tb.totalCredits),
  };
  const result: Record<string, unknown> = { hash_version: HASH_VERSION, trialBalance };
  if (payload.entries && payload.entries.length > 0) {
    result.entries = payload.entries.map(mapEntry);
  }
  return result;
}

/**
 * Hash input: hash_version (required, default "v1") + payload. No id, createdAt, or DB-generated fields.
 * When useCanonicalMoney, amounts are canonical strings for deterministic hashing.
 */
function buildHashInput(
  payload: LedgerSnapshotPayload,
  options?: { useCanonicalMoney?: boolean }
): Record<string, unknown> {
  const normalized = normalizePayloadForHash(payload);
  if (options?.useCanonicalMoney) {
    return toCanonicalMoneyPayload(normalized);
  }
  return { hash_version: HASH_VERSION, ...normalized };
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

export interface HashSnapshotPayloadOptions {
  /** When provided, use canonical money strings for hash (v2). When 1, use legacy number format for backward compat. */
  hashVersion?: number;
}

/**
 * Compute SHA-256 hex hash of canonical snapshot JSON.
 * Payload is normalized (entries sorted by entrySortKey), then keys-only serialization (no generic array sort).
 * For hashVersion 2 (default), amounts are canonical strings ("1234.56") to eliminate JS float drift.
 * For hashVersion 3+, evidenceManifest is included in hash input.
 */
export function hashSnapshotPayload(
  payload: LedgerSnapshotPayload,
  options?: HashSnapshotPayloadOptions
): string {
  const hashVersion = options?.hashVersion ?? HASH_VERSION_CANONICAL_MONEY;
  const useCanonicalMoney = hashVersion !== HASH_VERSION_LEGACY;
  const hashInput = buildHashInput(payload, { useCanonicalMoney });
  if (hashVersion >= HASH_VERSION_WITH_EVIDENCE_MANIFEST) {
    const manifest = payload.evidenceManifest ?? { journalEntries: [] };
    hashInput.evidenceManifest = manifest;
  }
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

/** Numeric version for DB storage (hash_version column). New snapshots use v3 (canonical money + evidence manifest). */
export function getHashVersionForStorage(): number {
  return HASH_VERSION_WITH_EVIDENCE_MANIFEST;
}

/**
 * Deterministic hash of evidence manifest content only.
 * Uses same canonicalization as snapshot hash (canonicalStringifyKeysOnly).
 * For auditor verification: manifest is deterministic and independently verifiable.
 */
export function hashManifestContent(manifest: EvidenceManifest): string {
  const json = canonicalStringifyKeysOnly(manifest);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}
