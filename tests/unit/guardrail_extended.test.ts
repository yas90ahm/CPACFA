/**
 * Extended AI Guardrail Tests — validates the updated hasNumericAmount()
 * catches numeric values under arbitrary keys (not just AMOUNT_KEYS).
 *
 * Written after blind audit finding #1: revenue allocation guardrail bypass.
 */

import { describe, it, expect } from '@jest/globals';
import { assertNoNumericAmountsInAgentOutput } from '../../src/llm/guardrails.js';

describe('Extended Guardrail: Non-Standard Output Structures', () => {
  // ─── MUST BE REJECTED ───

  describe('Rejects numeric amounts under arbitrary keys', () => {
    it('rejects POB allocation dict: { "pob-abc123": 50000 }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ 'pob-abc123': 50000 }, 'test')
      ).toThrow(/Scope violation/);
    });

    it('rejects percent allocation array: { "percentAllocations": [25, 50, 25] }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ percentAllocations: [25, 50, 25] }, 'test')
      ).toThrow(/Scope violation/);
    });

    it('rejects deeply nested numeric: { "nested": { "deep": { "value": 100 } } }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ nested: { deep: { value: 100 } } }, 'test')
      ).toThrow(/Scope violation/);
    });

    it('rejects standard amount in array: { "items": [{ "id": "x", "amount": 500 }] }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ items: [{ id: 'x', amount: 500 }] }, 'test')
      ).toThrow(/Scope violation/);
    });

    it('rejects numeric string value: { "result": "100.00" }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ result: '100.00' }, 'test')
      ).toThrow(/Scope violation/);
    });

    it('rejects array of bare numbers: { "data": [100, 200, 300] }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ data: [100, 200, 300] }, 'test')
      ).toThrow(/Scope violation/);
    });

    it('rejects mixed custom keys with amounts: { "line-1": 1000, "line-2": 2000 }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ 'line-1': 1000, 'line-2': 2000 }, 'test')
      ).toThrow(/Scope violation/);
    });

    it('rejects numeric in dollar-sign string: "$1,234.56"', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput('The total is $1,234.56', 'test')
      ).toThrow(/Scope violation/);
    });

    it('rejects amount key with string number: { "debit": "1234.56" }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ debit: '1234.56' }, 'test')
      ).toThrow(/Scope violation/);
    });

    it('rejects standard balance field: { "balance": 99999 }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ balance: 99999 }, 'test')
      ).toThrow(/Scope violation/);
    });
  });

  // ─── MUST PASS ───

  describe('Allows legitimate AI text output', () => {
    it('allows text suggestion: { "suggestion": "This account should map to PP&E" }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ suggestion: 'This account should map to PP&E' }, 'test')
      ).not.toThrow();
    });

    it('allows text explanation: { "explanation": "The variance is due to timing differences" }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ explanation: 'The variance is due to timing differences' }, 'test')
      ).not.toThrow();
    });

    it('allows string confidence: { "confidence": "high" }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ confidence: 'high' }, 'test')
      ).not.toThrow();
    });

    it('allows array of strings: { "accounts": ["Cash", "Revenue", "PP&E"] }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ accounts: ['Cash', 'Revenue', 'PP&E'] }, 'test')
      ).not.toThrow();
    });

    it('allows memo text: { "memo": "Depreciation for FY2026 fixed assets" }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ memo: 'Depreciation for FY2026 fixed assets' }, 'test')
      ).not.toThrow();
    });

    it('allows classification metadata: { "classification": "ASSET", "rationale": "Balance sheet item" }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ classification: 'ASSET', rationale: 'Balance sheet item' }, 'test')
      ).not.toThrow();
    });

    it('allows numeric confidence (ALLOWED_KEY): { "confidence": 0.94, "type": "classification" }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ confidence: 0.94, type: 'classification' }, 'test')
      ).not.toThrow();
    });

    it('allows plain narrative string', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput('Revenue should be classified as operating income', 'test')
      ).not.toThrow();
    });

    it('allows null and undefined', () => {
      expect(() => assertNoNumericAmountsInAgentOutput(null, 'test')).not.toThrow();
      expect(() => assertNoNumericAmountsInAgentOutput(undefined, 'test')).not.toThrow();
    });

    it('allows empty object', () => {
      expect(() => assertNoNumericAmountsInAgentOutput({}, 'test')).not.toThrow();
    });

    it('allows id as string identifier: { "id": "fs_asset_cash" }', () => {
      expect(() =>
        assertNoNumericAmountsInAgentOutput({ id: 'fs_asset_cash' }, 'test')
      ).not.toThrow();
    });
  });

  // ─── FUZZ TESTS ───

  describe('Fuzz: random objects with numeric values', () => {
    it('catches 100 random objects containing numeric values at random depths', () => {
      let caught = 0;
      for (let i = 0; i < 100; i++) {
        const depth = Math.floor(Math.random() * 4) + 1;
        let obj: Record<string, unknown> = { [`key_${i}`]: Math.random() * 100000 };
        for (let d = 0; d < depth; d++) {
          obj = { [`level_${d}`]: obj };
        }
        try {
          assertNoNumericAmountsInAgentOutput(obj, 'fuzz');
        } catch {
          caught++;
        }
      }
      expect(caught).toBe(100);
    });
  });

  describe('Fuzz: random objects with only string values', () => {
    it('passes 100 random objects containing only string values', () => {
      const words = ['revenue', 'expense', 'asset', 'liability', 'equity', 'cash', 'mapping', 'note', 'adjustment', 'review'];
      let passed = 0;
      for (let i = 0; i < 100; i++) {
        const depth = Math.floor(Math.random() * 3) + 1;
        const word = words[i % words.length];
        // Use only ALLOWED_KEYS to ensure they pass
        let obj: Record<string, unknown> = { description: `${word} item ${i}`, suggestion: `Review ${word}` };
        for (let d = 0; d < depth; d++) {
          obj = { description: `Level ${d} for ${word}`, suggestion: JSON.stringify(obj) };
        }
        try {
          assertNoNumericAmountsInAgentOutput(obj, 'fuzz');
          passed++;
        } catch {
          // Should not happen
        }
      }
      expect(passed).toBe(100);
    });
  });
});
