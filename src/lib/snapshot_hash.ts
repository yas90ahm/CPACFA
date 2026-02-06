/**
 * Deterministic canonical JSON and SHA-256 hash for ledger snapshots.
 * Same payload (stable key ordering + stable array ordering) => same hash.
 */

import { createHash } from 'crypto';
import type { LedgerSnapshotPayload, LedgerSnapshotEntry } from '../types/ledger_snapshot.js';

const HASH_VERSION = 1;

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

/** Sort entries by accountName, then debit, then credit, lineId, then canonical provenance for stable ordering. */
function entrySortKey(e: LedgerSnapshotEntry): string {
  const prov = e.amountProvenance ? JSON.stringify(e.amountProvenance) : '';
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

/** Recursively canonicalize: sort object keys; sort entry arrays by entrySortKey. */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && isEntryLike(value[0])) {
      const sorted = [...value] as LedgerSnapshotEntry[];
      sorted.sort((a, b) => entrySortKey(a).localeCompare(entrySortKey(b)));
      return sorted.map((item) => canonicalize(item));
    }
    return value.map(canonicalize);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = canonicalize(obj[k]);
  }
  return out;
}

/**
 * Serialize payload to canonical JSON (stable key order, stable entry order).
 */
export function canonicalSnapshotJson(payload: LedgerSnapshotPayload): string {
  const canon = canonicalize(payload) as LedgerSnapshotPayload;
  return JSON.stringify(canon);
}

/**
 * Compute SHA-256 hex hash of canonical snapshot JSON.
 */
export function hashSnapshotPayload(payload: LedgerSnapshotPayload): string {
  const json = canonicalSnapshotJson(payload);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

export function getHashVersion(): number {
  return HASH_VERSION;
}
