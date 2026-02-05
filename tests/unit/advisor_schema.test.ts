/**
 * Unit tests for Advisor pillar Zod schema: validation, provenance enforcement, missing_inputs.
 */

import { describe, it, expect } from '@jest/globals';
import {
  AdvisorOutputSchema,
  AdvisorProposalSchema,
} from '../../src/ai/schemas/advisor.schema.js';
import { runAdvisor } from '../../src/ai/ai_orchestrator.js';
import { isDbConfigured, getPool } from '../../src/db/index.js';

const validProposal = {
  proposal_id: 'p1',
  type: 'reclass' as const,
  rationale: 'Reclass suggestion.',
  rule_ids: ['reclass_hint'],
  confidence: 0.8,
  requires_human_confirmation: true,
  lines: [
    {
      dr_account_key: 'Expense',
      cr_account_key: 'Prepaid',
      amountProvenance: 'SOURCE_LINE_AMOUNT' as const,
      sourceRef: { tbRowId: 'row-0' },
      note: 'From source.',
    },
  ],
  missing_inputs: [],
};

const validOutput = {
  prompt_version: 'advisor_v1.0.0',
  proposals: [validProposal],
};

describe('AdvisorOutputSchema', () => {
  it('accepts valid JSON matching schema', () => {
    const result = AdvisorOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt_version).toBe('advisor_v1.0.0');
      expect(result.data.proposals).toHaveLength(1);
      expect(result.data.proposals[0].type).toBe('reclass');
    }
  });

  it('accepts empty proposals array', () => {
    const result = AdvisorOutputSchema.safeParse({
      prompt_version: 'advisor_v1.0.0',
      proposals: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts proposal with missing_inputs and empty lines', () => {
    const result = AdvisorOutputSchema.safeParse({
      prompt_version: 'advisor_v1.0.0',
      proposals: [
        {
          proposal_id: 'p2',
          type: 'other',
          rationale: 'Missing info.',
          rule_ids: [],
          confidence: 0.5,
          requires_human_confirmation: true,
          lines: [],
          missing_inputs: ['effective_date', 'contract_terms'],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-JSON (string)', () => {
    const result = AdvisorOutputSchema.safeParse('not json');
    expect(result.success).toBe(false);
  });

  it('rejects invalid proposal type', () => {
    const invalid = {
      ...validOutput,
      proposals: [{ ...validProposal, type: 'invalid_type' }],
    };
    const result = AdvisorOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('AdvisorProposalSchema provenance', () => {
  it('rejects line with amount but no amountProvenance', () => {
    const line = {
      dr_account_key: 'A',
      cr_account_key: 'B',
      amount: 100,
      amountProvenance: undefined,
    };
    const result = AdvisorProposalSchema.safeParse({
      ...validProposal,
      lines: [line],
    });
    expect(result.success).toBe(false);
  });

  it('rejects SOURCE_LINE_AMOUNT without sourceRef', () => {
    const line = {
      dr_account_key: 'A',
      cr_account_key: 'B',
      amountProvenance: 'SOURCE_LINE_AMOUNT',
      sourceRef: undefined,
    };
    const result = AdvisorProposalSchema.safeParse({
      ...validProposal,
      lines: [line],
    });
    expect(result.success).toBe(false);
  });

  it('accepts SOURCE_LINE_AMOUNT with sourceRef.tbRowId', () => {
    const result = AdvisorProposalSchema.safeParse(validProposal);
    expect(result.success).toBe(true);
  });
});

describe('runAdvisor fail-safe', () => {
  it('returns empty proposals on failure (fail-safe)', async () => {
    if (!isDbConfigured()) return;
    const pool = getPool();
    const result = await runAdvisor({
      pool,
      tenantId: 'test-tenant-advisor',
      periodLabel: '2025-01',
      sourceLines: [{ source_id: 'row-0', accountName: 'Cash', debit: 0, credit: 0 }],
    });
    expect(result.proposals).toBeDefined();
    expect(Array.isArray(result.proposals)).toBe(true);
    if (!result.ok) {
      expect(result.proposals).toHaveLength(0);
    }
  });
});
