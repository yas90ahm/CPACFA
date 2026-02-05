/**
 * Unit tests for Justifier pillar Zod schema (valid JSON passes; non-JSON/missing fields fail).
 */

import { describe, it, expect } from '@jest/globals';
import { JustifierOutputSchema } from '../../src/ai/schemas/justifier.schema.js';

const validOutput = {
  prompt_version: 'justifier_v1.0.0',
  irac: {
    issue: 'Whether the treatment is appropriate.',
    rule: 'GAAP applies.',
    analysis: 'Facts support the entry.',
    conclusion: 'Conclusion supported.',
  },
  memo_markdown: '**Issue** ... **Conclusion** ...',
  rule_ids: ['no_ai_math', 'documentation'],
  facts_used: ['jeId', 'lines'],
};

describe('JustifierOutputSchema', () => {
  it('accepts valid JSON matching schema', () => {
    const result = JustifierOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt_version).toBe('justifier_v1.0.0');
      expect(result.data.irac.issue).toBeDefined();
      expect(result.data.rule_ids).toEqual(['no_ai_math', 'documentation']);
    }
  });

  it('rejects non-JSON (string)', () => {
    const result = JustifierOutputSchema.safeParse('not json');
    expect(result.success).toBe(false);
  });

  it('rejects invalid type (number)', () => {
    const result = JustifierOutputSchema.safeParse(42);
    expect(result.success).toBe(false);
  });

  it('rejects missing prompt_version', () => {
    const { prompt_version: _, ...rest } = validOutput;
    const result = JustifierOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing irac', () => {
    const { irac: _, ...rest } = validOutput;
    const result = JustifierOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing irac.issue', () => {
    const invalid = { ...validOutput, irac: { ...validOutput.irac, issue: undefined } };
    const result = JustifierOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects missing memo_markdown', () => {
    const { memo_markdown: _, ...rest } = validOutput;
    const result = JustifierOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing rule_ids', () => {
    const { rule_ids: _, ...rest } = validOutput;
    const result = JustifierOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing facts_used', () => {
    const { facts_used: _, ...rest } = validOutput;
    const result = JustifierOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
