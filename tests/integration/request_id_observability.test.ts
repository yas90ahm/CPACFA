/**
 * Integration tests: request ID observability.
 * - X-Request-Id header on success (board-ready-pack) and on 422 (advance NOT_READY).
 * - requestId present in error JSON bodies.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken, getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'request-id-observability-tenant';

describe('Request ID observability', () => {
  let authToken: string;
  let authTokenApprover: string;
  let closeSessionIdDraft: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Request ID observability: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthToken(TEST_TENANT_ID);
    authTokenApprover = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
    const ensureRes = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId: 'entity-req-id', periodLabel: '2025-12' });
    if (ensureRes.status === 200 || ensureRes.status === 201) {
      closeSessionIdDraft = ensureRes.body?.closeSessionId;
    } else {
      closeSessionIdDraft = '';
    }
  });

  it('X-Request-Id header on board-ready-pack success', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/precheck/board-ready-pack')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-01',
        trialBalance: [
          { accountName: 'Cash', debit: 100, credit: 0 },
          { accountName: 'Retained Earnings', debit: 0, credit: 100 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect((res.headers['x-request-id'] as string).length).toBeGreaterThan(0);
  });

  it('X-Request-Id header on advance 422 NOT_READY', async () => {
    if (!isDbConfigured() || !closeSessionIdDraft) return;
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionIdDraft}/advance`)
      .set('Authorization', `Bearer ${authTokenApprover}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test' });
    expect(res.status).toBe(422);
    expect(res.body?.code).toBe('NOT_READY');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(typeof res.headers['x-request-id']).toBe('string');
  });

  it('requestId in error JSON (400 ensure validation)', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ periodLabel: '2025-01' });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('VALIDATION');
    expect(res.body?.requestId).toBeDefined();
    expect(typeof res.body?.requestId).toBe('string');
    expect(res.body?.requestId?.length).toBeGreaterThan(0);
  });
});
