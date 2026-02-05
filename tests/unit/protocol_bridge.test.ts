/**
 * Protocol Bridge unit tests: invalid command rejected, period-locked commands rejected,
 * valid commands produce deterministic results (with mocks).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import {
  executeBridgeCommand,
  bridgeCommandSchema,
  type BridgeContext,
} from '../../src/bridge/protocol_bridge.js';
import * as periodLock from '../../src/services/period_lock_service.js';
import * as trialBalanceStore from '../../src/services/trial_balance_store_service.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';

const mockPool = {} as Pool;

const ctx: BridgeContext = {
  pool: mockPool,
  tenantId: 'tenant-1',
  actor: 'user@test.com',
};

describe('Protocol Bridge — invalid command rejected', () => {
  it('rejects empty command', async () => {
    const result = await executeBridgeCommand(ctx, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_COMMAND');
      expect(result.error).toMatch(/commandType|required/);
    }
  });

  it('rejects unknown commandType', async () => {
    const result = await executeBridgeCommand(ctx, {
      commandType: 'UnknownCommand',
      periodLabel: '2025-01',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_COMMAND');
  });

  it('rejects SaveTrialBalance with missing periodLabel', async () => {
    const result = await executeBridgeCommand(ctx, {
      commandType: 'SaveTrialBalance',
      periodLabel: '',
      entries: [{ accountName: 'Cash', debit: 100, credit: 0 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_COMMAND');
  });

  it('rejects SaveTrialBalance with empty entries', async () => {
    const parsed = bridgeCommandSchema.safeParse({
      commandType: 'SaveTrialBalance',
      periodLabel: '2025-01',
      entries: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects CreateDraftJE with invalid closeSessionId (not uuid)', async () => {
    const parsed = bridgeCommandSchema.safeParse({
      commandType: 'CreateDraftJE',
      closeSessionId: 'not-a-uuid',
      source: 'manual',
      lines: [{ accountRef: 'Cash', debit: 100, credit: 0 }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('Protocol Bridge — period-locked commands rejected', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('SaveTrialBalance returns PERIOD_LOCKED when period is locked', async () => {
    jest.spyOn(periodLock, 'assertPeriodNotLocked').mockRejectedValue(new periodLock.PeriodLockedError('2025-01'));
    const result = await executeBridgeCommand(ctx, {
      commandType: 'SaveTrialBalance',
      periodLabel: '2025-01',
      entries: [
        { accountName: 'Cash', debit: 1000, credit: 0 },
        { accountName: 'Revenue', debit: 0, credit: 1000 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PERIOD_LOCKED');
      expect(result.error).toContain('2025-01');
    }
  });

  it('LockPeriod returns VALIDATION when actorRole is insufficient', async () => {
    const result = await executeBridgeCommand(
      { ...ctx, actorRole: 'preparer' },
      {
        commandType: 'LockPeriod',
        periodLabel: '2025-01',
        lockedBy: 'user@test.com',
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION');
      expect(result.error).toMatch(/approver|role/);
    }
  });
});

describe('Protocol Bridge — valid SaveTrialBalance (mocked)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('calls saveUnadjustedFromUpload and recordMaterialEvent when balance within tolerance', async () => {
    jest.spyOn(periodLock, 'assertPeriodNotLocked').mockResolvedValue(undefined);
    jest.spyOn(trialBalanceStore, 'saveUnadjustedFromUpload').mockResolvedValue(undefined);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue(undefined);

    const result = await executeBridgeCommand(ctx, {
      commandType: 'SaveTrialBalance',
      periodLabel: '2025-01',
      entries: [
        { accountName: 'Cash', debit: 1000, credit: 0 },
        { accountName: 'Revenue', debit: 0, credit: 1000 },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.commandType === 'SaveTrialBalance') {
      expect(result.periodLabel).toBe('2025-01');
    }
    expect(trialBalanceStore.saveUnadjustedFromUpload).toHaveBeenCalledWith(
      ctx.tenantId,
      '2025-01',
      expect.arrayContaining([
        expect.objectContaining({ accountName: 'Cash', debit: 1000, credit: 0 }),
        expect.objectContaining({ accountName: 'Revenue', debit: 0, credit: 1000 }),
      ]),
      expect.objectContaining({ uploadedBy: ctx.actor }),
      mockPool
    );
    expect(auditLedger.recordMaterialEvent).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        eventType: 'bridge_command',
        tenantId: ctx.tenantId,
        deterministicFlagSnapshot: expect.objectContaining({
          commandType: 'SaveTrialBalance',
          actor: ctx.actor,
          periodLabel: '2025-01',
        }),
        createdBy: ctx.actor,
      })
    );
  });

  it('returns VALIDATION when trial balance does not balance', async () => {
    jest.spyOn(periodLock, 'assertPeriodNotLocked').mockResolvedValue(undefined);
    const saveSpy = jest.spyOn(trialBalanceStore, 'saveUnadjustedFromUpload').mockResolvedValue(undefined);

    const result = await executeBridgeCommand(ctx, {
      commandType: 'SaveTrialBalance',
      periodLabel: '2025-01',
      entries: [
        { accountName: 'Cash', debit: 1000, credit: 0 },
        { accountName: 'Revenue', debit: 0, credit: 500 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION');
      expect(result.error).toMatch(/balance|Debits|Credits/);
    }
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
