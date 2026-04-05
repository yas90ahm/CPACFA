/**
 * Hash chain integrity: audit ledger append-only, hash chaining, canonical JSON.
 */

import assert from 'node:assert/strict';
import { createHash } from 'crypto';

describe('hash chain — canonical JSON determinism', () => {
  function canonicalize(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(canonicalize);
    if (typeof obj === 'object') {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
        sorted[key] = canonicalize((obj as Record<string, unknown>)[key]);
      }
      return sorted;
    }
    return obj;
  }

  it('sorted keys produce deterministic JSON regardless of insertion order', () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    assert.equal(JSON.stringify(canonicalize(a)), JSON.stringify(canonicalize(b)));
  });

  it('nested objects are sorted recursively', () => {
    const a = { outer: { z: 1, a: 2 }, first: true };
    const b = { first: true, outer: { a: 2, z: 1 } };
    assert.equal(JSON.stringify(canonicalize(a)), JSON.stringify(canonicalize(b)));
  });

  it('arrays preserve order (not sorted)', () => {
    const a = { items: [3, 1, 2] };
    const b = { items: [3, 1, 2] };
    assert.equal(JSON.stringify(canonicalize(a)), JSON.stringify(canonicalize(b)));
    const c = { items: [1, 2, 3] };
    assert.notEqual(JSON.stringify(canonicalize(a)), JSON.stringify(canonicalize(c)));
  });
});

describe('hash chain — SHA-256 chain linking', () => {
  function computeEntryHash(payload: string, previousHash: string | null): string {
    const data = previousHash ? `${previousHash}|${payload}` : payload;
    return createHash('sha256').update(data).digest('hex');
  }

  it('chain of 3 entries: each hash depends on previous', () => {
    const h1 = computeEntryHash('entry-1', null);
    const h2 = computeEntryHash('entry-2', h1);
    const h3 = computeEntryHash('entry-3', h2);

    const h2_tampered = computeEntryHash('entry-2', null);
    assert.notEqual(h2, h2_tampered);

    const h3_wrong = computeEntryHash('entry-3', h1);
    assert.notEqual(h3, h3_wrong);
  });

  it('tampering with an entry breaks the chain', () => {
    const h1 = computeEntryHash('entry-1', null);
    const h2 = computeEntryHash('entry-2', h1);
    const h3 = computeEntryHash('entry-3', h2);

    const h2_tampered = computeEntryHash('entry-2-TAMPERED', h1);
    const h3_recomputed = computeEntryHash('entry-3', h2_tampered);

    assert.notEqual(h3_recomputed, h3);
  });

  it('first entry hash is deterministic', () => {
    const h1a = computeEntryHash('same-payload', null);
    const h1b = computeEntryHash('same-payload', null);
    assert.equal(h1a, h1b);
  });
});

describe('hash chain — audit ledger repository structure', () => {
  it('audit_ledger_repository exports expected functions', async () => {
    const mod = await import('../../src/db/repositories/audit_ledger_repository.js');
    assert.equal(typeof mod.appendEntry, 'function');
    assert.equal(typeof mod.verifyChain, 'function');
    assert.equal(typeof mod.listByTenantAndPeriod, 'function');
  });
});
