import { describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'pg';
import type { CloseCalendarConfig } from '../../src/services/close_calendar_config_service.js';
import {
  closeCycleKickoffJobId,
  scanConfiguredCloseCycles,
  type CloseCycleSchedulerDependencies,
} from '../../src/services/close_cycle_scheduler.js';

const pool = {} as Pool;

function configured(overrides: Partial<CloseCalendarConfig> = {}): CloseCalendarConfig {
  return {
    tenantId: 'tenant-1',
    closeDueOffsetDays: 5,
    entityId: 'entity-1',
    connectionId: 'conn-1',
    profileId: 'ca-aspe-private-enterprise',
    frequency: 'monthly',
    autoStartEnabled: true,
    approvedErpWritebackEnabled: false,
    nextPeriodLabel: '2026-01',
    startOffsetDays: 1,
    startTimeLocal: '06:00',
    timezone: 'America/Toronto',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function dependencies(input?: {
  config?: CloseCalendarConfig;
  inserted?: boolean;
}): CloseCycleSchedulerDependencies & {
  enqueue: jest.Mock;
  markDispatched: jest.Mock;
} {
  return {
    listTenantIds: jest.fn(async () => ['tenant-1']),
    getTenantPool: jest.fn(async () => pool),
    getConfig: jest.fn(async () => input?.config ?? configured()),
    enqueue: jest.fn(async (id: string) => ({ id, inserted: input?.inserted ?? true })),
    markDispatched: jest.fn(async () => true),
  } as unknown as CloseCycleSchedulerDependencies & {
    enqueue: jest.Mock;
    markDispatched: jest.Mock;
  };
}

describe('Configured close-cycle scheduler', () => {
  it('queues the due period exactly once and advances the recurring cursor', async () => {
    const deps = dependencies();
    const result = await scanConfiguredCloseCycles({
      now: new Date('2026-02-01T11:00:00.000Z'),
      dependencies: deps,
    });

    const expectedId = closeCycleKickoffJobId('tenant-1', 'entity-1', '2026-01');
    expect(deps.enqueue).toHaveBeenCalledWith(
      expectedId,
      expect.objectContaining({
        type: 'close_cycle_kickoff',
        payload: expect.objectContaining({
          tenantId: 'tenant-1',
          entityId: 'entity-1',
          connectionId: 'conn-1',
          periodLabel: '2026-01',
          scheduledStartAt: '2026-02-01T11:00:00.000Z',
        }),
      })
    );
    expect(deps.markDispatched).toHaveBeenCalledWith(
      'tenant-1',
      '2026-01',
      '2026-02',
      '2026-02-01T11:00:00.000Z',
      pool
    );
    expect(result).toEqual(expect.objectContaining({
      jobsInserted: 1,
      jobsAlreadyQueued: 0,
      cursorsAdvanced: 1,
    }));
  });

  it('does not queue work before the configured start instant', async () => {
    const deps = dependencies();
    const result = await scanConfiguredCloseCycles({
      now: new Date('2026-02-01T10:59:59.999Z'),
      dependencies: deps,
    });

    expect(deps.enqueue).not.toHaveBeenCalled();
    expect(deps.markDispatched).not.toHaveBeenCalled();
    expect(result.notDue).toBe(1);
  });

  it('advances the cursor when another scheduler already inserted the deterministic job', async () => {
    const deps = dependencies({ inserted: false });
    const result = await scanConfiguredCloseCycles({
      now: new Date('2026-02-01T11:00:00.000Z'),
      dependencies: deps,
    });

    expect(result.jobsInserted).toBe(0);
    expect(result.jobsAlreadyQueued).toBe(1);
    expect(result.cursorsAdvanced).toBe(1);
  });

  it('ignores a calendar row until auto-start is explicitly enabled', async () => {
    const deps = dependencies({ config: configured({ autoStartEnabled: false }) });
    const result = await scanConfiguredCloseCycles({
      now: new Date('2026-02-01T11:00:00.000Z'),
      dependencies: deps,
    });

    expect(deps.enqueue).not.toHaveBeenCalled();
    expect(result.jobsInserted).toBe(0);
  });
});
