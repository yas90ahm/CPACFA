/**
 * Integration tests: GET /api/verification/snapshots/:snapshotId
 * Auditor verification surface — read-only snapshot hash verification.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import { createSnapshotFromTrialBalanceAndEntries } from '../../src/services/ledger_snapshot_service.js';
import { getSession } from '../../src/services/close_session_service.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'snapshot-verification-tenant';

describe('GET /api/verification/snapshots/:snapshotId', () => {
  let authToken: string;
  let certifiedSnapshotId: string | undefined;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Snapshot verification: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthToken(TEST_TENANT_ID);
    try {
      await queryControl(
        'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
        [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
      );
      const pool = await getTenantPool(TEST_TENANT_ID);
      const ts = Date.now();
      const certified = await closeSessionRepo.insertCloseSession(
        pool,
        `sess-verify-${ts}`,
        TEST_TENANT_ID,
        `entity-verify-${ts}`,
        '2025-08-01',
        '2025-08-31',
        'accrual',
        'GAAP',
        'certified'
      );
      const snapshot = await createSnapshotFromTrialBalanceAndEntries(pool, {
        tenantId: TEST_TENANT_ID,
        periodLabel: '2025-08',
        closeSessionId: certified.id,
        createdBy: 'test-setup',
        source: 'close_session',
        trialBalance: {
          entries: [
            { accountName: 'Cash', debit: 400, credit: 0 },
            { accountName: 'Retained Earnings', debit: 0, credit: 400 },
          ],
          totalDebits: 400,
          totalCredits: 400,
        },
      });
      await closeSessionRepo.updateCertification(
        pool,
        TEST_TENANT_ID,
        certified.id,
        'test@test.com',
        new Date().toISOString(),
        'Setup',
        snapshot.id
      );
      certifiedSnapshotId = snapshot.id;
    } catch (e) {
      console.warn('Snapshot verification: could not create test session; skipping.', e);
    }
  });

  it('A) Unknown snapshotId returns 404', async () => {
    const res = await request(app)
      .get('/api/verification/snapshots/non-existent-snapshot-id')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(404);
    expect(res.body?.code).toBe('NOT_FOUND');
    expect(res.body?.error).toBe('Snapshot not found');
  });

  it('B) Certified session snapshot: hashMatches === true, recomputedHash === storedHash', async () => {
    if (!isDbConfigured() || !certifiedSnapshotId) return;
    const res = await request(app)
      .get(`/api/verification/snapshots/${certifiedSnapshotId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.snapshot).toBeDefined();
    expect(res.body?.snapshot?.snapshotId).toBe(certifiedSnapshotId);
    expect(res.body?.snapshot?.hashMatches).toBe(true);
    expect(res.body?.snapshot?.recomputedHash).toBe(res.body?.snapshot?.storedHash);
    expect(res.body?.snapshot?.snapshotPayloadJson).toBeUndefined();
    expect(res.body?.snapshot?.trialBalance).toBeUndefined();
    expect(res.body?.snapshot?.evidenceManifest).toBeUndefined();
  });

  it('C) Tamper simulation: stored hash wrong → hashMatches === false', async () => {
    if (!isDbConfigured() || !certifiedSnapshotId) return;
    const pool = await getTenantPool(TEST_TENANT_ID);
    await pool.query(
      'UPDATE ledger_snapshots SET snapshot_hash = $1 WHERE id = $2',
      ['tampered_hash_value_12345', certifiedSnapshotId]
    );
    const res = await request(app)
      .get(`/api/verification/snapshots/${certifiedSnapshotId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.snapshot?.hashMatches).toBe(false);
    expect(res.body?.snapshot?.recomputedHash).not.toBe(res.body?.snapshot?.storedHash);
    expect(res.body?.snapshot?.storedHash).toBe('tampered_hash_value_12345');
  });
});
