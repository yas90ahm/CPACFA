import { describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'pg';
import {
  scanPendingErpWritebacks,
  type ErpWritebackSchedulerDependencies,
} from '../../src/services/erp_writeback_scheduler.js';
import type { JournalEntryErpWriteback } from '../../src/db/repositories/journal_entry_erp_writeback_repository.js';

function pending(journalEntryId: string): JournalEntryErpWriteback {
  return {
    journalEntryId,
    tenantId: 'tenant-1',
    connectionId: 'connection-1',
    status: 'pending',
    idempotencyKey: `sabit-${journalEntryId}`,
    requestedBy: 'controller-1',
    requestedAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:00:00.000Z',
  };
}

describe('ERP writeback dispatcher', () => {
  it('recovers durable pending outbox rows into deterministic jobs', async () => {
    const enqueue = jest.fn(async (_tenantId: string, journalEntryId: string) => ({
      id: `job-${journalEntryId}`,
      inserted: true,
    }));
    const deps: ErpWritebackSchedulerDependencies = {
      listTenantIds: async () => ['tenant-1'],
      getTenantPool: async () => ({}) as Pool,
      listPending: async () => [pending('je-1'), pending('je-2')],
      enqueue,
    };

    const result = await scanPendingErpWritebacks({ dependencies: deps });

    expect(result).toEqual({
      tenantsScanned: 1,
      pendingFound: 2,
      jobsInserted: 2,
      jobsAlreadyQueued: 0,
      errors: [],
    });
    expect(enqueue).toHaveBeenNthCalledWith(1, 'tenant-1', 'je-1');
    expect(enqueue).toHaveBeenNthCalledWith(2, 'tenant-1', 'je-2');
  });

  it('counts an existing deterministic job without creating a duplicate', async () => {
    const deps: ErpWritebackSchedulerDependencies = {
      listTenantIds: async () => ['tenant-1'],
      getTenantPool: async () => ({}) as Pool,
      listPending: async () => [pending('je-1')],
      enqueue: async () => ({ id: 'stable-job', inserted: false }),
    };

    const result = await scanPendingErpWritebacks({ dependencies: deps });

    expect(result.jobsInserted).toBe(0);
    expect(result.jobsAlreadyQueued).toBe(1);
  });
});
