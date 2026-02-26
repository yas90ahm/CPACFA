/**
 * Unit tests: PBC Index missing[] computation (deterministic from evidence flags).
 */

import { describe, it, expect } from '@jest/globals';
import { buildMissing } from '../../src/routes/audit/pbc_index.js';

describe('PBC Index buildMissing', () => {
  it('returns LOCK_REQUIRED and CERTIFICATION_REQUIRED when not locked and not certified', () => {
    const missing = buildMissing(false, false, false, null, null, false);
    const codes = missing.map((m) => m.code);
    expect(codes).toContain('LOCK_REQUIRED');
    expect(codes).toContain('CERTIFICATION_REQUIRED');
    expect(codes).toContain('CERTIFIED_STATEMENTS_UNAVAILABLE');
  });

  it('returns CERTIFICATION_REQUIRED when locked but not certified', () => {
    const missing = buildMissing(true, false, false, null, null, false);
    const codes = missing.map((m) => m.code);
    expect(codes).not.toContain('LOCK_REQUIRED');
    expect(codes).toContain('CERTIFICATION_REQUIRED');
  });

  it('returns SNAPSHOT_MISSING when certified but no snapshot', () => {
    const missing = buildMissing(true, true, false, null, null, false);
    const codes = missing.map((m) => m.code);
    expect(codes).toContain('SNAPSHOT_MISSING');
  });

  it('returns SNAPSHOT_HASH_UNVERIFIED when snapshot exists but hash verified false', () => {
    const missing = buildMissing(true, true, true, false, true, true);
    const codes = missing.map((m) => m.code);
    expect(codes).toContain('SNAPSHOT_HASH_UNVERIFIED');
  });

  it('returns CHAIN_BROKEN when chain verified false', () => {
    const missing = buildMissing(true, true, true, true, false, true);
    const codes = missing.map((m) => m.code);
    expect(codes).toContain('CHAIN_BROKEN');
  });

  it('returns empty missing when all evidence present and verified', () => {
    const missing = buildMissing(true, true, true, true, true, true);
    expect(missing).toHaveLength(0);
  });

  it('each item has code, message, and remediation', () => {
    const missing = buildMissing(false, false, false, null, false, false);
    for (const item of missing) {
      expect(typeof item.code).toBe('string');
      expect(item.code.length).toBeGreaterThan(0);
      expect(typeof item.message).toBe('string');
      expect(typeof item.remediation).toBe('string');
    }
  });
});
