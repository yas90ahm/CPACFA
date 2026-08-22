import type { Pool } from 'pg';
import {
  createTenantScopedPool,
  getControlPool,
  getTenantPoolWithMigrations,
} from '../db/index.js';
import { listPendingWritebacks } from '../db/repositories/journal_entry_erp_writeback_repository.js';
import { enqueueErpWritebackJob } from './journal_entry_erp_writeback_service.js';
import { log } from '../lib/logger.js';

export interface ErpWritebackScanResult {
  tenantsScanned: number;
  pendingFound: number;
  jobsInserted: number;
  jobsAlreadyQueued: number;
  errors: Array<{ tenantId: string; message: string }>;
}

export interface ErpWritebackSchedulerDependencies {
  listTenantIds(): Promise<string[]>;
  getTenantPool(tenantId: string): Promise<Pool>;
  listPending(pool: Pool, tenantId: string): ReturnType<typeof listPendingWritebacks>;
  enqueue(tenantId: string, journalEntryId: string): ReturnType<typeof enqueueErpWritebackJob>;
}

function defaultDependencies(): ErpWritebackSchedulerDependencies {
  return {
    async listTenantIds() {
      const result = await getControlPool().query<{ id: string }>('SELECT id FROM tenants ORDER BY id');
      return result.rows.map((row) => row.id);
    },
    async getTenantPool(tenantId) {
      const pool = await getTenantPoolWithMigrations(tenantId);
      return createTenantScopedPool(pool, tenantId);
    },
    listPending: (pool, tenantId) => listPendingWritebacks(pool, tenantId),
    enqueue: enqueueErpWritebackJob,
  };
}

/** Recover durable tenant outbox rows that were not queued during approval. */
export async function scanPendingErpWritebacks(options?: {
  dependencies?: ErpWritebackSchedulerDependencies;
}): Promise<ErpWritebackScanResult> {
  const deps = options?.dependencies ?? defaultDependencies();
  const result: ErpWritebackScanResult = {
    tenantsScanned: 0,
    pendingFound: 0,
    jobsInserted: 0,
    jobsAlreadyQueued: 0,
    errors: [],
  };

  for (const tenantId of await deps.listTenantIds()) {
    result.tenantsScanned += 1;
    try {
      const pool = await deps.getTenantPool(tenantId);
      const pending = await deps.listPending(pool, tenantId);
      result.pendingFound += pending.length;
      for (const writeback of pending) {
        const queued = await deps.enqueue(tenantId, writeback.journalEntryId);
        if (queued.inserted) result.jobsInserted += 1;
        else result.jobsAlreadyQueued += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ tenantId, message });
      log('error', 'ERP writeback dispatcher failed for tenant', { tenantId, error: message });
    }
  }
  return result;
}
