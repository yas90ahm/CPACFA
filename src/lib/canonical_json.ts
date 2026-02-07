/**
 * Canonical JSON serialization for deterministic hashing.
 * - canonicalStringifyKeysOnly: deep alphabetical key ordering, undefined omitted, arrays NOT sorted (caller must pre-sort domain arrays).
 * - canonicalStringifyLegacy: same but arrays sorted by canonical string (for callers that need generic array normalization).
 * Snapshot hashing uses KeysOnly after domain-aware pre-sort of trialBalance.entries and entries.
 */

/**
 * Recursively canonicalize with keys-only: sort object keys, omit undefined, arrays preserved in original order.
 */
function canonicalizeKeysOnly(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeKeysOnly);
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    const c = canonicalizeKeysOnly(v);
    if (c === undefined) continue;
    out[k] = c;
  }
  return out;
}

/**
 * Recursively canonicalize (legacy): sort object keys, omit undefined, sort arrays by canonical string.
 */
function canonicalizeLegacy(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const canonicalized = value.map(canonicalizeLegacy);
    canonicalized.sort((a, b) => deterministicStringifyLegacy(a).localeCompare(deterministicStringifyLegacy(b)));
    return canonicalized;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    const c = canonicalizeLegacy(v);
    if (c === undefined) continue;
    out[k] = c;
  }
  return out;
}

function deterministicStringifyLegacy(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const sorted = value.map(canonicalizeLegacy).sort((a, b) =>
      deterministicStringifyLegacy(a).localeCompare(deterministicStringifyLegacy(b))
    );
    return '[' + sorted.map((e) => deterministicStringifyLegacy(e)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + deterministicStringifyLegacy(canonicalizeLegacy(obj[k])));
  return '{' + parts.join(',') + '}';
}

/**
 * Keys-only: sort object keys, omit undefined, arrays preserved. Use when domain arrays are pre-sorted.
 */
export function canonicalStringifyKeysOnly(value: unknown): string {
  return JSON.stringify(canonicalizeKeysOnly(value));
}

/**
 * Legacy: sort object keys, omit undefined, sort arrays by canonical string. Use for nested structures (e.g. amountProvenance).
 */
export function canonicalStringifyLegacy(value: unknown): string {
  return JSON.stringify(canonicalizeLegacy(value));
}
