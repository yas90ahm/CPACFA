/**
 * Unit tests for canonical JSON: deterministic string, key-order and array-order.
 * canonicalStringifyKeysOnly: keys sorted, arrays preserved.
 * canonicalStringifyLegacy: keys sorted, arrays sorted by canonical string.
 */

import { describe, it, expect } from '@jest/globals';
import {
  canonicalStringifyKeysOnly,
  canonicalStringifyLegacy,
} from '../../src/lib/canonical_json.js';

describe('canonical_json', () => {
  describe('canonicalStringifyKeysOnly', () => {
    it('same input produces identical string across runs', () => {
      const obj = { trialBalance: { entries: [{ accountName: 'Cash', debit: 1000, credit: 0 }], totalDebits: 1000, totalCredits: 1000 } };
      expect(canonicalStringifyKeysOnly(obj)).toBe(canonicalStringifyKeysOnly(obj));
    });
    it('same logical data with different key ordering produces identical string', () => {
      const a = { z: 1, a: 2, m: 3 };
      const b = { m: 3, z: 1, a: 2 };
      expect(canonicalStringifyKeysOnly(a)).toBe(canonicalStringifyKeysOnly(b));
    });
    it('arrays are preserved in order (no generic sort)', () => {
      const a = { x: [3, 1, 2] };
      const b = { x: [1, 2, 3] };
      expect(canonicalStringifyKeysOnly(a)).not.toBe(canonicalStringifyKeysOnly(b));
    });
    it('sorts object keys deeply', () => {
      const s = canonicalStringifyKeysOnly({ b: 1, a: { z: 2, y: 3 } });
      const parsed = JSON.parse(s);
      expect(Object.keys(parsed)).toEqual(['a', 'b']);
      expect(Object.keys(parsed.a)).toEqual(['y', 'z']);
    });
  });

  describe('canonicalStringifyLegacy', () => {
    it('same logical data with different array element order produces identical string', () => {
      const a = { entries: [{ accountName: 'Revenue', debit: 0, credit: 1000 }, { accountName: 'Cash', debit: 1000, credit: 0 }] };
      const b = { entries: [{ accountName: 'Cash', debit: 1000, credit: 0 }, { accountName: 'Revenue', debit: 0, credit: 1000 }] };
      expect(canonicalStringifyLegacy(a)).toBe(canonicalStringifyLegacy(b));
    });
    it('omits undefined', () => {
      const a = { x: 1, y: undefined };
      const b = { x: 1 };
      expect(canonicalStringifyLegacy(a)).toBe(canonicalStringifyLegacy(b));
    });
  });
});
