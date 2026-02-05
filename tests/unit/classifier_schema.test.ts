/**
 * Unit tests for Classifier pillar Zod schema and fail-open behavior.
 */

import { describe, it, expect } from '@jest/globals';
import { ClassifierOutputSchema } from '../../src/ai/schemas/classifier.schema.js';
import { runClassifier } from '../../src/ai/ai_orchestrator.js';
import { isDbConfigured, getPool } from '../../src/db/index.js';

const validOutput = {
  prompt_version: 'classifier_v1.0.0',
  results: [
    {
      source_id: 'row-0',
      object_type: 'expense',
      fs_placement: 'pnl.expense',
      suggested_accounts: ['Operating Expense'],
      rule_tags: ['expense_in_period'],
      missing_inputs: [],
      confidence: 0.85,
    },
  ],
};

describe('ClassifierOutputSchema', () => {
  it('accepts valid JSON matching schema', () => {
    const result = ClassifierOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt_version).toBe('classifier_v1.0.0');
      expect(result.data.results).toHaveLength(1);
      expect(result.data.results[0].object_type).toBe('expense');
    }
  });

  it('accepts empty results array', () => {
    const result = ClassifierOutputSchema.safeParse({
      prompt_version: 'classifier_v1.0.0',
      results: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-JSON (string)', () => {
    const result = ClassifierOutputSchema.safeParse('not json');
    expect(result.success).toBe(false);
  });

  it('rejects missing prompt_version', () => {
    const { prompt_version: _, ...rest } = validOutput;
    const result = ClassifierOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing results', () => {
    const { results: _, ...rest } = validOutput;
    const result = ClassifierOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const invalid = {
      ...validOutput,
      results: [{ ...validOutput.results[0], confidence: 1.5 }],
    };
    const result = ClassifierOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('runClassifier fail-open', () => {
  it('returns empty results on failure (fail-open, no block)', async () => {
    if (!isDbConfigured()) return;
    const pool = getPool();
    const result = await runClassifier({
      pool,
      tenantId: 'test-tenant-classifier',
      periodLabel: '2025-01',
      sourceLines: [{ source_id: 'row-0', accountName: 'Cash', debit: 0, credit: 0 }],
    });
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
    if (!result.ok) {
      expect(result.results).toHaveLength(0);
    }
  });
});
