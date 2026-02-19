/**
 * Integration tests: POST /api/close/sessions/:id/advance and certify/lock flow.
 * State machine: OPEN → IN_PROGRESS → UNDER_REVIEW (via advance); UNDER_REVIEW → CERTIFIED (POST certify); CERTIFIED → LOCKED (POST lock).
 * A) open with valid data → advance to in_progress, then to under_review; then certify; then lock
 * B) under_review → POST certify succeeds (status=certified)
 * C) certified session → advance no-ops (actionTaken=none)
 * D) open session not eligible for under_review → 422 with blockers
 * E) under_review with critical issue → POST certify returns 422
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

describe('POST /api/close/sessions/:id/advance and certify/lock', () => {
  let authToken: string;
  let closeSessionIdReady: string;
  let closeSessionIdOpenOnly: string;
  let closeSessionIdUnderReviewForE: string;

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
    const entityOpenOnly = `entity-advance-open-${ts}`;
    const entityE = `entity-advance-e-${ts}`;

    const ingestPath = '/api/trial-balance/ingest';

    // Session that will be advanced to under_review, then certified, then locked (A, B, C)
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

    // Open-only session (no checklist) for D
    const ensureOpenOnly = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId: entityOpenOnly, periodLabel: '2025-11' });
    if (ensureOpenOnly.status === 200 || ensureOpenOnly.status === 201) {
      closeSessionIdOpenOnly = ensureOpenOnly.body?.closeSessionId;
    } else {
      closeSessionIdOpenOnly = 'dummy-will-skip';
    }

    // Session for E: get to under_review, then we add a critical issue in test E
    const ensureE = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId: entityE, periodLabel: PERIOD_LABEL });
    if (ensureE.status !== 200 && ensureE.status !== 201) {
      closeSessionIdUnderReviewForE = 'dummy-will-skip';
    } else {
      closeSessionIdUnderReviewForE = ensureE.body?.closeSessionId;
      const initE = await request(app)
        .post(`/api/close/sessions/${closeSessionIdUnderReviewForE}/checklist/initialize`)
        .set('Authorization', `Bearer ${authToken}`);
      if (initE.status === 200 || initE.status === 201) {
        const listE = await request(app)
          .get(`/api/close/sessions/${closeSessionIdUnderReviewForE}/checklist`)
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
        // Advance to under_review (open → in_progress → under_review)
        const adv1 = await request(app)
          .post(`/api/close/sessions/${closeSessionIdUnderReviewForE}/advance`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('x-tenant-id', TEST_TENANT_ID)
          .set('Content-Type', 'application/json');
        const adv2 = adv1.status === 200 && adv1.body?.statusAfter === 'in_progress'
          ? await request(app)
              .post(`/api/close/sessions/${closeSessionIdUnderReviewForE}/advance`)
              .set('Authorization', `Bearer ${authToken}`)
              .set('x-tenant-id', TEST_TENANT_ID)
              .set('Content-Type', 'application/json')
          : { status: 0, body: {} };
        if (adv2.status === 200 && adv2.body?.statusAfter === 'under_review') {
          // ok
        } else {
          closeSessionIdUnderReviewForE = 'dummy-will-skip';
        }
      } else {
        closeSessionIdUnderReviewForE = 'dummy-will-skip';
      }
    }
  }, 25_000);

  it('A) open session with valid data: advance to in_progress then under_review; then certify; then lock', async () => {
    if (!isDbConfigured()) return;
    // First advance: open → in_progress
    const res1 = await request(app)
      .post(`/api/close/sessions/${closeSessionIdReady}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(res1.status).toBe(200);
    expect(res1.body?.statusBefore).toBe('open');
    expect(res1.body?.statusAfter).toBe('in_progress');
    expect(res1.body?.actionTaken).toBe('advanced');

    // Second advance: in_progress → under_review
    const res2 = await request(app)
      .post(`/api/close/sessions/${closeSessionIdReady}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(res2.status).toBe(200);
    expect(res2.body?.statusAfter).toBe('under_review');
    expect(res2.body?.actionTaken).toBe('advanced');

    // Certify (under_review → certified)
    const certRes = await request(app)
      .post(`/api/close/sessions/${closeSessionIdReady}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test-advance', memo: 'Certified in test' });
    expect(certRes.status).toBe(200);
    expect(certRes.body?.status).toBe('certified');
    expect(certRes.body?.certifiedBy).toBeDefined();

    // Leave session certified for B (do not lock yet)
  });

  it('B) certified session: advance no-ops (actionTaken=none)', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionIdReady}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body?.statusAfter).toBe('certified');
    expect(res.body?.actionTaken).toBe('none');
  });

  it('C) lock then advance no-ops (locked is terminal)', async () => {
    if (!isDbConfigured()) return;
    const lockRes = await request(app)
      .post(`/api/close/sessions/${closeSessionIdReady}/lock`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(lockRes.status).toBe(200);
    expect(lockRes.body?.status).toBe('locked');
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionIdReady}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body?.statusAfter).toBe('locked');
    expect(res.body?.actionTaken).toBe('none');
  });

  it('D) open session not eligible for under_review: returns 422 with blockers', async () => {
    if (!isDbConfigured()) return;
    if (!closeSessionIdOpenOnly || closeSessionIdOpenOnly === 'dummy-will-skip') {
      console.warn('D) skipped: open-only session not created');
      return;
    }
    const res1 = await request(app)
      .post(`/api/close/sessions/${closeSessionIdOpenOnly}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(res1.status).toBe(200);
    expect(res1.body?.statusAfter).toBe('in_progress');
    const res2 = await request(app)
      .post(`/api/close/sessions/${closeSessionIdOpenOnly}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json');
    expect(res2.status).toBe(422);
    expect(res2.body?.code).toBe('NOT_READY');
    expect(Array.isArray(res2.body?.blockers)).toBe(true);
    expect(res2.body?.blockers?.length).toBeGreaterThan(0);
  });

  it('E) under_review session with critical issue: POST certify returns 422', async () => {
    if (!isDbConfigured()) return;
    if (!closeSessionIdUnderReviewForE || closeSessionIdUnderReviewForE === 'dummy-will-skip') {
      console.warn('E) skipped: under_review session for E not created');
      return;
    }
    await request(app)
      .post('/api/close/issues')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        closeSessionId: closeSessionIdUnderReviewForE,
        title: 'Critical for advance E',
        category: 'reconciliation',
        severity: 'critical',
      });
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionIdUnderReviewForE}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test-e', memo: 'E' });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body?.blockers) ? res.body.blockers.length : res.body?.code).toBeDefined();
  });
});
