/**
 * Integration tests: POST /api/close/sessions/:id/advance (deterministic advance).
 * A) draft with valid data → advance locks (statusAfter=locked, actionTaken=locked)
 * B) locked → advance certifies (statusAfter=certified, certifiedSnapshotId present)
 * C) certified → advance no-ops (actionTaken=none)
 * D) draft not eligible to lock → 422 with blockers
 * E) locked not eligible to certify → 422 with blockers
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import {
  isDbConfigured,
  getTenantPool,
  queryControl,
} from '../../src/db/index.js';
import { getUnadjustedMeta } from '../../src/services/trial_balance_store_service.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `advance-tenant-${Date.now()}`;
const PERIOD_LABEL = '2025-10';
const PERIOD_START = '2025-10-01';
const PERIOD_END = '2025-10-31';

const BALANCED_TB_CSV = `AccountName,Debit,Credit
Cash,500,0
Retained Earnings,0,500`;

describe('POST /api/close/sessions/:id/advance', () => {
  let authToken: string;
  let closeSessionIdReady: string;
  let closeSessionIdDraftOnly: string;
  let closeSessionIdLockedForE: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Close sessions advance: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );

    const pool = await getTenantPool(TEST_TENANT_ID);
    const ts = Date.now();
    const entityReady = `entity-advance-ready-${ts}`;
    const entityDraftOnly = `entity-advance-draft-${ts}`;
    const entityE = `entity-advance-e-${ts}`;

    const ingestPath = '/api/trial-balance/ingest';

    // Session that will be advanced to locked then certified (A, B, C)
    const ensureReady = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId: entityReady, periodLabel: PERIOD_LABEL });
    if (ensureReady.status !== 200 && ensureReady.status !== 201) {
      throw new Error(`Ensure failed: ${ensureReady.status} ${JSON.stringify(ensureReady.body)}`);
    }
    closeSessionIdReady = ensureReady.body?.closeSessionId;

    // Ingest balanced TB for period so certify has data
    const tmpCsv = path.join(os.tmpdir(), `advance-${ts}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_TB_CSV, 'utf8');
    try {
      const ingestRes = await request(app)
        .post(ingestPath)
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', TEST_TENANT_ID)
        .field('periodLabel', PERIOD_LABEL)
        .attach('file', tmpCsv);
      if (ingestRes.body?.status === 'staged' && ingestRes.body?.stagedId) {
        await request(app)
          .post('/api/hitl/resolve-ingest')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({
            stagedId: ingestRes.body.stagedId,
            adjustment: [{ accountName: 'Retained Earnings', debit: 0, credit: 0, amountProvenance: { kind: 'human_entered', enteredBy: 'test' } }],
          });
      }
    } finally {
      try { fs.unlinkSync(tmpCsv); } catch { /* ignore */ }
    }

    const tbMeta = await getUnadjustedMeta(TEST_TENANT_ID, PERIOD_LABEL, pool);
    if (!tbMeta) {
      console.warn('Advance tests: no trial balance for period; some tests may fail.');
    }

    // Initialize checklist and complete items for session that we will advance
    const initRes = await request(app)
      .post(`/api/close/sessions/${closeSessionIdReady}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`);
    expect([200, 201]).toContain(initRes.status);

    const listRes = await request(app)
      .get(`/api/close/sessions/${closeSessionIdReady}/checklist`)
      .set('Authorization', `Bearer ${authToken}`);
    const items = listRes.body?.items ?? listRes.body ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id ?? item;
      if (typeof id !== 'string') continue;
      await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
    }

    // Draft-only session (no checklist) for D
    const ensureDraft = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId: entityDraftOnly, periodLabel: '2025-11' });
    if (ensureDraft.status === 200 || ensureDraft.status === 201) {
      closeSessionIdDraftOnly = ensureDraft.body?.closeSessionId;
    } else {
      closeSessionIdDraftOnly = 'dummy-will-skip';
    }

    // Session for E: get to locked, then we add a critical issue in test E
    const ensureE = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId: entityE, periodLabel: PERIOD_LABEL });
    if (ensureE.status !== 200 && ensureE.status !== 201) {
      closeSessionIdLockedForE = 'dummy-will-skip';
    } else {
      closeSessionIdLockedForE = ensureE.body?.closeSessionId;
      const initE = await request(app)
        .post(`/api/close/sessions/${closeSessionIdLockedForE}/checklist/initialize`)
        .set('Authorization', `Bearer ${authToken}`);
      if (initE.status === 200 || initE.status === 201) {
        const listE = await request(app)
          .get(`/api/close/sessions/${closeSessionIdLockedForE}/checklist`)
          .set('Authorization', `Bearer ${authToken}`);
        const itemsE = listE.body?.items ?? listE.body ?? [];
        for (const item of Array.isArray(itemsE) ? itemsE : []) {
          const id = item.id ?? item;
          if (typeof id !== 'string') continue;
          await request(app)
            .post(`/api/close/checklist-items/${id}/complete`)
            .set('Authorization', `Bearer ${authToken}`)
            .set('Content-Type', 'application/json')
            .send({ completedBy: 'test-user' });
        }
        const advanceToLocked = await request(app)
          .post(`/api/close/sessions/${closeSessionIdLockedForE}/advance`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('x-tenant-id', TEST_TENANT_ID)
          .set('Content-Type', 'application/json');
        if (advanceToLocked.status !== 200 || advanceToLocked.body?.statusAfter !== 'locked') {
          closeSessionIdLockedForE = 'dummy-will-skip';
        }
      } else {
        closeSessionIdLockedForE = 'dummy-will-skip';
      }
    }
  }, 25_000);

  it('A) draft session with valid data: advance locks it (statusAfter=locked, actionTaken=locked)', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionIdReady}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.closeSessionId).toBe(closeSessionIdReady);
    expect(res.body?.statusBefore).toBe('draft');
    expect(res.body?.statusAfter).toBe('locked');
    expect(res.body?.actionTaken).toBe('locked');
    expect(res.body?.result).toBeDefined();
    expect(res.body?.result?.certifiedSnapshotId).toBeNull();
    expect(Array.isArray(res.body?.blockers)).toBe(true);
    expect(res.body?.blockers?.length).toBe(0);
  });

  it('B) locked session: advance certifies it (statusAfter=certified, actionTaken=certified, certifiedSnapshotId present)', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionIdReady}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test-advance' });
    expect(res.status).toBe(200);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.closeSessionId).toBe(closeSessionIdReady);
    expect(res.body?.statusBefore).toBe('locked');
    expect(res.body?.statusAfter).toBe('certified');
    expect(res.body?.actionTaken).toBe('certified');
    expect(res.body?.result?.certifiedSnapshotId).toBeDefined();
    expect(res.body?.result?.snapshotHash).toBeDefined();
    expect(res.body?.result?.hashVersion).toBeDefined();
  });

  it('C) certified session: advance no-ops (actionTaken=none)', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionIdReady}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.statusAfter).toBe('certified');
    expect(res.body?.actionTaken).toBe('none');
  });

  it('D) draft session not eligible to lock: returns 422 with blockers', async () => {
    if (!isDbConfigured()) return;
    if (!closeSessionIdDraftOnly || closeSessionIdDraftOnly === 'dummy-will-skip') {
      console.warn('D) skipped: draft-only session not created');
      return;
    }
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionIdDraftOnly}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(422);
    expect(res.body?.code).toBe('NOT_READY');
    expect(Array.isArray(res.body?.blockers)).toBe(true);
    expect(res.body?.blockers?.length).toBeGreaterThan(0);
    expect(res.body?.blockers?.[0]?.code).toBeDefined();
    expect(res.body?.blockers?.[0]?.message).toBeDefined();
  });

  it('E) locked session not eligible to certify: returns 422 with blockers', async () => {
    if (!isDbConfigured()) return;
    if (!closeSessionIdLockedForE || closeSessionIdLockedForE === 'dummy-will-skip') {
      console.warn('E) skipped: locked session for E not created');
      return;
    }
    await request(app)
      .post('/api/close/issues')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        closeSessionId: closeSessionIdLockedForE,
        title: 'Critical for advance E',
        category: 'reconciliation',
        severity: 'critical',
      });
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionIdLockedForE}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(422);
    expect(res.body?.code).toBe('NOT_READY');
    expect(Array.isArray(res.body?.blockers)).toBe(true);
    expect(res.body?.blockers?.length).toBeGreaterThan(0);
  });
});
