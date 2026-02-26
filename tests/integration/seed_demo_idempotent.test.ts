/**
 * Integration test: seed_demo is idempotent.
 * - Creates tenant, user, trial balance, close session without errors
 * - Running twice does not duplicate data
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { seedDemo } from '../../src/scripts/seed_demo.js';
import { isDbConfigured, getTenantPoolWithMigrations } from '../../src/db/index.js';
import * as periodTbRepo from '../../src/db/repositories/period_trial_balance_repository.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import * as jeRepo from '../../src/db/repositories/journal_entry_repository.js';

const DEMO_TENANT_ID = 'demo-cloudmetrics';
const DEMO_PERIOD = '2025-01';
const SESSION_ID = 'demo-session-2025-01';

describe('seed_demo idempotent', () => {
  beforeAll(async () => {
    if (!isDbConfigured()) return;
  });

  it('seed_demo runs without errors', async () => {
    if (!isDbConfigured()) return;
    await expect(seedDemo()).resolves.not.toThrow();
  });

  it('running seed_demo twice does not duplicate data', async () => {
    if (!isDbConfigured()) return;

    await seedDemo();
    const pool = await getTenantPoolWithMigrations(DEMO_TENANT_ID);

    const tbBefore = await periodTbRepo.getUnadjusted(pool, DEMO_TENANT_ID, DEMO_PERIOD);
    const sessionBefore = await closeSessionRepo.getCloseSessionById(pool, DEMO_TENANT_ID, SESSION_ID);
    const jesBefore = sessionBefore
      ? await jeRepo.listJournalEntries(pool, DEMO_TENANT_ID, { closeSessionId: SESSION_ID, limit: 100 })
      : [];

    await seedDemo();

    const tbAfter = await periodTbRepo.getUnadjusted(pool, DEMO_TENANT_ID, DEMO_PERIOD);
    const sessionAfter = await closeSessionRepo.getCloseSessionById(pool, DEMO_TENANT_ID, SESSION_ID);
    const jesAfter = sessionAfter
      ? await jeRepo.listJournalEntries(pool, DEMO_TENANT_ID, { closeSessionId: SESSION_ID, limit: 100 })
      : [];

    expect(tbAfter).toBeDefined();
    expect(sessionAfter).toBeDefined();
    expect(tbAfter?.entries?.length).toBe(tbBefore?.entries?.length ?? 0);
    expect(jesAfter.length).toBe(jesBefore.length);
  });
});
