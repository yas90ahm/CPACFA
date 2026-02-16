/**
 * Deterministic concurrency control for close session transitions.
 * Fires two certify/advance calls simultaneously and asserts exactly one success, one 409.
 * Run with: npm test -- integration/close_session_concurrency.test.ts --runInBand
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { isDbConfigured, getTenantPool } from '../../src/db/index.js';
import { getSession } from '../../src/services/close_session_service.js';
import { createTenant, teardown } from '../helpers/integrationHarness.js';

const BALANCED_CSV = `AccountName,Debit,Credit
Cash,100,0
Retained Earnings,0,100`;

describe('Close session concurrency — deterministic row lock', () => {
  let tenantId: string;
  let authToken: string;
  let closeSessionId: string;
  const PERIOD_LABEL = '2025-12';

  beforeAll(async () => {
    if (!isDbConfigured()) return;

    const ctx = await createTenant('close-concurrency');
    tenantId = ctx.tenantId;
    authToken = ctx.authTokenWithRole('approver');

    // Ingest balanced TB
    const tmpCsv = path.join(os.tmpdir(), `concurrency-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_CSV, 'utf8');
    try {
      const ingestRes = await request(app)
        .post('/api/trial-balance/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', tenantId)
        .field('tenantId', tenantId)
        .field('periodLabel', PERIOD_LABEL)
        .attach('file', tmpCsv);
      if (ingestRes.body?.status === 'staged' && ingestRes.body?.stagedId) {
        await request(app)
          .post('/api/hitl/resolve-ingest')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .set('x-tenant-id', tenantId)
          .send({
            stagedId: ingestRes.body.stagedId,
            adjustment: [
              {
                accountName: 'Retained Earnings',
                debit: 0,
                credit: 0,
                amountProvenance: { kind: 'human_entered', enteredBy: 'test' },
              },
            ],
          });
      }
    } finally {
      try {
        fs.unlinkSync(tmpCsv);
      } catch {}
    }

    const ensureRes = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', tenantId)
      .set('Content-Type', 'application/json')
      .send({ entityId: 'concurrency-entity', periodLabel: PERIOD_LABEL });
    if (ensureRes.status !== 200 && ensureRes.status !== 201) return;
    closeSessionId = ensureRes.body?.closeSessionId;

    const initRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', tenantId);
    if (initRes.status !== 200 && initRes.status !== 201) return;

    const listRes = await request(app)
      .get(`/api/close/sessions/${closeSessionId}/checklist`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', tenantId);
    const items = listRes.body?.items ?? listRes.body ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id ?? item;
      if (typeof id !== 'string') continue;
      await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .set('x-tenant-id', tenantId)
        .send({ completedBy: 'test-user' });
    }

    const advanceRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', tenantId)
      .set('Content-Type', 'application/json');
    if (advanceRes.status !== 200 || advanceRes.body?.statusAfter !== 'locked') {
      closeSessionId = '';
    }
  }, 30000);

  afterAll(async () => {
    if (tenantId) await teardown(tenantId);
  }, 15000);

  it('Two concurrent certify calls yield exactly one 200 and one 409', async () => {
    if (!isDbConfigured() || !closeSessionId) return;

    await request(app).get('/health').catch(() => {});

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/close/sessions/${closeSessionId}/certify`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .set('x-tenant-id', tenantId)
        .send({ certifiedBy: 'concurrency-1', periodLabel: PERIOD_LABEL })
        .timeout(20000),
      request(app)
        .post(`/api/close/sessions/${closeSessionId}/certify`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .set('x-tenant-id', tenantId)
        .send({ certifiedBy: 'concurrency-2', periodLabel: PERIOD_LABEL })
        .timeout(20000),
    ]);

    if (res1.status === 400 || res2.status === 400) {
      const body = res1.status === 400 ? res1.body : res2.body;
      throw new Error(`Unexpected 400: ${JSON.stringify(body)}`);
    }
    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const success = res1.status === 200 ? res1 : res2;
    const conflict = res1.status === 409 ? res1 : res2;
    expect(success.body?.status).toBe('certified');
    expect(conflict.body?.code).toBe('INVALID_TRANSITION');

    const pool = await getTenantPool(tenantId);
    const session = await getSession(pool, tenantId, closeSessionId);
    expect(session?.status).toBe('certified');

    const r = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM audit_ledger
       WHERE tenant_id = $1 AND event_type = 'certify_close'
       AND deterministic_flag_snapshot->>'closeSessionId' = $2`,
      [tenantId, closeSessionId]
    );
    expect(r.rows.length).toBe(1);
  }, 25000);

  it('Two concurrent advance (locked→certified) calls yield exactly one 200 and one 409', async () => {
    if (!isDbConfigured()) return;

    // Create a second session for this test (first is already certified)
    const ensureRes = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', tenantId)
      .set('Content-Type', 'application/json')
      .send({ entityId: 'concurrency-entity-2', periodLabel: '2026-01' });
    if (ensureRes.status !== 200 && ensureRes.status !== 201) return;
    const sessionId2 = ensureRes.body?.closeSessionId;

    const initRes = await request(app)
      .post(`/api/close/sessions/${sessionId2}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', tenantId);
    if (initRes.status !== 200 && initRes.status !== 201) return;

    const listRes = await request(app)
      .get(`/api/close/sessions/${sessionId2}/checklist`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', tenantId);
    const items = listRes.body?.items ?? listRes.body ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id ?? item;
      if (typeof id !== 'string') continue;
      await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .set('x-tenant-id', tenantId)
        .send({ completedBy: 'test-user' });
    }

    // Need TB for 2026-01 - ingest
    const tmpCsv = path.join(os.tmpdir(), `concurrency-2026-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_CSV, 'utf8');
    try {
      const ingestRes = await request(app)
        .post('/api/trial-balance/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', tenantId)
        .field('tenantId', tenantId)
        .field('periodLabel', '2026-01')
        .attach('file', tmpCsv);
      if (ingestRes.body?.status === 'staged' && ingestRes.body?.stagedId) {
        await request(app)
          .post('/api/hitl/resolve-ingest')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .set('x-tenant-id', tenantId)
          .send({
            stagedId: ingestRes.body.stagedId,
            adjustment: [{ accountName: 'Retained Earnings', debit: 0, credit: 0, amountProvenance: { kind: 'human_entered', enteredBy: 'test' } }],
          });
      }
    } finally {
      try {
        fs.unlinkSync(tmpCsv);
      } catch {}
    }

    const advanceToLocked = await request(app)
      .post(`/api/close/sessions/${sessionId2}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', tenantId)
      .set('Content-Type', 'application/json');
    if (advanceToLocked.status !== 200 || advanceToLocked.body?.statusAfter !== 'locked') return;

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/close/sessions/${sessionId2}/advance`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .set('x-tenant-id', tenantId)
        .send({ certifiedBy: 'advance-race-1' })
        .timeout(20000),
      request(app)
        .post(`/api/close/sessions/${sessionId2}/advance`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .set('x-tenant-id', tenantId)
        .send({ certifiedBy: 'advance-race-2' })
        .timeout(20000),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const success = res1.status === 200 ? res1 : res2;
    expect(success.body?.actionTaken).toBe('certified');
    expect(success.body?.statusAfter).toBe('certified');

    const conflict = res1.status === 409 ? res1 : res2;
    expect(conflict.body?.code).toBe('INVALID_TRANSITION');

    const pool = await getTenantPool(tenantId);
    const session = await getSession(pool, tenantId, sessionId2);
    expect(session?.status).toBe('certified');
  }, 45000);
});
