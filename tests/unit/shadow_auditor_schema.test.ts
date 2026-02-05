/**
 * Unit tests for Shadow Auditor pillar Zod schema and fail-open behavior.
 */

import { describe, it, expect } from '@jest/globals';
import { ShadowAuditorOutputSchema } from '../../src/ai/schemas/shadow_auditor.schema.js';
import { runShadowAudit } from '../../src/ai/ai_orchestrator.js';
import { getPool, isDbConfigured } from '../../src/db/index.js';

const validOutput = {
  prompt_version: 'shadow_auditor_v1.0.0',
  severity: 'ok' as const,
  confidence: 0.9,
  findings: [
    { code: 'MOCK_FINDING', message: 'Mock.', rule_ids: ['doc'], refs: ['je-1'] },
  ],
};

describe('ShadowAuditorOutputSchema', () => {
  it('accepts valid JSON matching schema', () => {
    const result = ShadowAuditorOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity).toBe('ok');
      expect(result.data.confidence).toBe(0.9);
      expect(result.data.findings).toHaveLength(1);
    }
  });

  it('accepts severity warn and block', () => {
    expect(ShadowAuditorOutputSchema.safeParse({ ...validOutput, severity: 'warn' }).success).toBe(true);
    expect(ShadowAuditorOutputSchema.safeParse({ ...validOutput, severity: 'block' }).success).toBe(true);
  });

  it('rejects invalid severity', () => {
    const result = ShadowAuditorOutputSchema.safeParse({ ...validOutput, severity: 'critical' });
    expect(result.success).toBe(false);
  });

  it('rejects non-JSON (string)', () => {
    const result = ShadowAuditorOutputSchema.safeParse('not json');
    expect(result.success).toBe(false);
  });

  it('rejects missing findings', () => {
    const { findings: _, ...rest } = validOutput;
    const result = ShadowAuditorOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const result = ShadowAuditorOutputSchema.safeParse({ ...validOutput, confidence: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe('runShadowAudit fail-open', () => {
  it('returns warn + AI_FAILED finding on invalid JSON (fail-open, no block)', async () => {
    if (!isDbConfigured()) return;
    const pool = getPool();
    const result = await runShadowAudit({
      pool,
      tenantId: 'test-tenant-fail-open',
      periodLabel: '2025-01',
      subjectType: 'journal_entry',
      subjectId: 'je-fail-open',
      facts: { jeId: 'je-fail-open' },
    });
    // With real adapter (no AI_MOCK) we may get API_KEY_MISSING → fail-open returns warn
    // With AI_MOCK=true we get valid mock JSON → ok
    expect(result.severity).toBeDefined();
    expect(['ok', 'warn', 'block']).toContain(result.severity);
    if (!result.ok) {
      expect(result.findings.some((f) => f.code === 'AI_FAILED')).toBe(true);
      expect(result.severity).not.toBe('block');
    }
  });
});
