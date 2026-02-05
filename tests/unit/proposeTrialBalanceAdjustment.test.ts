/**
 * proposeTrialBalanceAdjustment — Sovereign scope: amount provenance enforced.
 * Tests: SOURCE_LINE reclass allowed; AI-invented amount blocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { runProposeTrialBalanceAdjustment, proposeTrialBalanceAdjustmentSchema } from '../../src/agents/tools/proposeTrialBalanceAdjustment.js';
import * as hitlOrchestrator from '../../src/services/hitl_orchestrator.js';
import * as trialBalanceStore from '../../src/services/trial_balance_store_service.js';
import type { Pool } from 'pg';

const mockPool = {} as Pool;

describe('proposeTrialBalanceAdjustment — amount provenance', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('allows SOURCE_LINE_AMOUNT reclass when amount matches TB row and sourceRef provided', async () => {
    jest.spyOn(trialBalanceStore, 'getUnadjusted').mockResolvedValue({
      entries: [
        { accountName: 'Cash', debit: 1000, credit: 0 },
        { accountName: 'Other', debit: 0, credit: 500 },
      ],
      source: 'uploaded',
      at: '2025-01-01T00:00:00Z',
    });
    let submittedPayload: Record<string, unknown> = {};
    jest.spyOn(hitlOrchestrator, 'submitToStaging').mockImplementation((params) => {
      submittedPayload = params.payload as Record<string, unknown>;
      return Promise.resolve({
        id: 'hitl-1',
        status: 'pending',
        proposedAction: params.proposedAction,
        justification: params.justification,
        type: params.type ?? 'adjustment',
        payload: params.payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const input = {
      debits: [
        {
          account: 'Lease Liability',
          amount: 1000,
          amountProvenance: 'SOURCE_LINE_AMOUNT' as const,
          sourceRef: { periodTrialBalanceRowId: '0' },
        },
      ],
      credits: [
        {
          account: 'Cash',
          amount: 1000,
          amountProvenance: 'SOURCE_LINE_AMOUNT' as const,
          sourceRef: { periodTrialBalanceRowId: '0' },
        },
      ],
      justification: 'Reclass from Cash to Lease Liability per source row',
      periodLabel: '2025-01',
    };

    const result = await runProposeTrialBalanceAdjustment(input, {
      tenantId: 'test-tenant',
      pool: mockPool,
    });

    expect(result.success).toBe(true);
    expect(hitlOrchestrator.submitToStaging).toHaveBeenCalled();
    const payload = submittedPayload as {
      debits?: Array<{ account: string; amount: number; amountProvenance: string; sourceRef?: unknown; amountProvenanceInternal?: unknown }>;
    };
    expect(payload.debits?.[0]?.amountProvenance).toBe('SOURCE_LINE_AMOUNT');
    expect(payload.debits?.[0]?.sourceRef).toEqual({ periodTrialBalanceRowId: '0' });
    expect(payload.debits?.[0]?.amountProvenanceInternal).toBeDefined();
  });

  it('blocks AI-invented amount: missing amountProvenance fails schema', async () => {
    const input = {
      debits: [{ account: 'Expense', amount: 500 }],
      credits: [{ account: 'Cash', amount: 500 }],
      justification: 'Plug',
    };
    const parsed = proposeTrialBalanceAdjustmentSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  it('blocks AI-invented amount: SOURCE_LINE_AMOUNT without sourceRef rejected by runner', async () => {
    const input = {
      debits: [
        { account: 'Expense', amount: 500, amountProvenance: 'SOURCE_LINE_AMOUNT' as const },
      ],
      credits: [
        { account: 'Cash', amount: 500, amountProvenance: 'SOURCE_LINE_AMOUNT' as const },
      ],
      justification: 'Plug',
      periodLabel: '2025-01',
    };

    const result = await runProposeTrialBalanceAdjustment(input, {
      tenantId: 'test-tenant',
      pool: mockPool,
    });

    expect(result.success).toBe(false);
    expect('error' in result && result.error).toContain('sourceRef');
  });

  it('blocks Advisor-provided amount when amountProvenance is DETERMINISTIC_ENGINE_AMOUNT', async () => {
    const input = {
      debits: [
        {
          account: 'Interest Expense',
          amount: 100,
          amountProvenance: 'DETERMINISTIC_ENGINE_AMOUNT' as const,
          deterministicCalcRef: { calcId: 'lease-interest', inputsHash: 'abc', ruleVersion: '1' },
        },
      ],
      credits: [
        {
          account: 'Lease Liability',
          amount: 100,
          amountProvenance: 'DETERMINISTIC_ENGINE_AMOUNT' as const,
          deterministicCalcRef: { calcId: 'lease-interest', inputsHash: 'abc', ruleVersion: '1' },
        },
      ],
      justification: 'Lease interest',
    };

    const result = await runProposeTrialBalanceAdjustment(input, {
      tenantId: 'test-tenant',
      pool: mockPool,
    });

    expect(result.success).toBe(false);
    const err = !result.success && 'error' in result ? result.error : '';
    expect(err).toContain('must not be provided by Advisor');
    expect(err).toContain('DETERMINISTIC_ENGINE_AMOUNT');
  });

  it('rejects SOURCE_LINE_AMOUNT when amount does not match source row within tolerance', async () => {
    jest.spyOn(trialBalanceStore, 'getUnadjusted').mockResolvedValue({
      entries: [{ accountName: 'Cash', debit: 1000, credit: 0 }],
      source: 'uploaded',
      at: '2025-01-01T00:00:00Z',
    });

    const input = {
      debits: [
        {
          account: 'Other',
          amount: 999,
          amountProvenance: 'SOURCE_LINE_AMOUNT' as const,
          sourceRef: { periodTrialBalanceRowId: '0' },
        },
      ],
      credits: [
        {
          account: 'Cash',
          amount: 999,
          amountProvenance: 'SOURCE_LINE_AMOUNT' as const,
          sourceRef: { periodTrialBalanceRowId: '0' },
        },
      ],
      justification: 'Reclass',
      periodLabel: '2025-01',
    };

    const result = await runProposeTrialBalanceAdjustment(input, {
      tenantId: 'test-tenant',
      pool: mockPool,
    });

    expect(result.success).toBe(false);
    const err = 'error' in result ? result.error : '';
    expect(err).toMatch(/does not match source line amount|tolerance/);
  });
});
