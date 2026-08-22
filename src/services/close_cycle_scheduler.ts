import { createHash } from 'crypto';
import type { Pool } from 'pg';
import {
  createTenantScopedPool,
  getControlPool,
  getTenantPoolWithMigrations,
} from '../db/index.js';
import type { CloseCalendarConfig } from './close_calendar_config_service.js';
import {
  getCloseCalendarConfig,
  markCloseCycleDispatched,
} from './close_calendar_config_service.js';
import {
  getCloseCycleStartAt,
  isCloseCycleDue,
  nextClosePeriodLabel,
} from './close_cycle_schedule.js';
import { enqueueJobWithId } from './job_service.js';
import { log } from '../lib/logger.js';

export interface CloseCycleScanResult {
  tenantsScanned: number;
  jobsInserted: number;
  jobsAlreadyQueued: number;
  cursorsAdvanced: number;
  notDue: number;
  errors: Array<{ tenantId: string; message: string }>;
}

export interface CloseCycleSchedulerDependencies {
  listTenantIds(): Promise<string[]>;
  getTenantPool(tenantId: string): Promise<Pool>;
  getConfig(tenantId: string, pool: Pool): Promise<CloseCalendarConfig | undefined>;
  enqueue(
    id: string,
    input: Parameters<typeof enqueueJobWithId>[1]
  ): Promise<{ id: string; inserted: boolean }>;
  markDispatched(
    tenantId: string,
    expectedPeriodLabel: string,
    nextPeriodLabel: string,
    dispatchedAt: string,
    pool: Pool
  ): Promise<boolean>;
}

function defaultDependencies(): CloseCycleSchedulerDependencies {
  return {
    async listTenantIds() {
      const result = await getControlPool().query<{ id: string }>('SELECT id FROM tenants ORDER BY id');
      return result.rows.map((row) => row.id);
    },
    async getTenantPool(tenantId) {
      const pool = await getTenantPoolWithMigrations(tenantId);
      return createTenantScopedPool(pool, tenantId);
    },
    getConfig: getCloseCalendarConfig,
    enqueue: enqueueJobWithId,
    markDispatched: markCloseCycleDispatched,
  };
}

export function closeCycleKickoffJobId(tenantId: string, entityId: string, periodLabel: string): string {
  const digest = createHash('sha256')
    .update(`close-cycle-kickoff:v1:${tenantId}:${entityId}:${periodLabel}`)
    .digest('hex');
  return `close-cycle-${digest}`;
}

export async function scanConfiguredCloseCycles(options?: {
  now?: Date;
  dependencies?: CloseCycleSchedulerDependencies;
}): Promise<CloseCycleScanResult> {
  const now = options?.now ?? new Date();
  const deps = options?.dependencies ?? defaultDependencies();
  const result: CloseCycleScanResult = {
    tenantsScanned: 0,
    jobsInserted: 0,
    jobsAlreadyQueued: 0,
    cursorsAdvanced: 0,
    notDue: 0,
    errors: [],
  };

  const tenantIds = await deps.listTenantIds();
  for (const tenantId of tenantIds) {
    result.tenantsScanned += 1;
    try {
      const pool = await deps.getTenantPool(tenantId);
      const config = await deps.getConfig(tenantId, pool);
      if (
        !config?.autoStartEnabled ||
        !config.entityId ||
        !config.connectionId ||
        !config.nextPeriodLabel
      ) {
        continue;
      }

      const schedule = {
        frequency: config.frequency,
        nextPeriodLabel: config.nextPeriodLabel,
        startOffsetDays: config.startOffsetDays,
        startTimeLocal: config.startTimeLocal,
        timezone: config.timezone,
      };
      if (!isCloseCycleDue(schedule, now)) {
        result.notDue += 1;
        continue;
      }

      const periodLabel = config.nextPeriodLabel;
      const jobId = closeCycleKickoffJobId(tenantId, config.entityId, periodLabel);
      const scheduledStartAt = getCloseCycleStartAt(schedule).toISOString();
      const queued = await deps.enqueue(jobId, {
        type: 'close_cycle_kickoff',
        payload: {
          tenantId,
          entityId: config.entityId,
          connectionId: config.connectionId,
          periodLabel,
          profileId: config.profileId,
          frequency: config.frequency,
          scheduledStartAt,
        },
        maxAttempts: 5,
      });
      if (queued.inserted) result.jobsInserted += 1;
      else result.jobsAlreadyQueued += 1;

      const nextPeriod = nextClosePeriodLabel(periodLabel, config.frequency);
      const advanced = await deps.markDispatched(
        tenantId,
        periodLabel,
        nextPeriod,
        now.toISOString(),
        pool
      );
      if (advanced) result.cursorsAdvanced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ tenantId, message });
      log('error', 'Close-cycle scheduler failed for tenant', { tenantId, error: message });
    }
  }
  return result;
}
