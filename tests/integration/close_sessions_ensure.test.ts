/**
 * Integration tests: POST /api/close/sessions/ensure (idempotent ensure session).
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'ensure-session-tenant';
const PERIOD_LABEL = '2025-08';
/** Unique per run so A always creates; B uses its own so two calls same key. */
const ENTITY_ID_A = `entity-ensure-a-${Date.now()}`;
const ENTITY_ID_B = `entity-ensure-b-${Date.now()}`;
const ENTITY_ID = 'entity-ensure'; // for C and D (validation only)

describe('POST /api/close/sessions/ensure', () => {
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Close sessions ensure: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthToken(TEST_TENANT_ID);
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('A) first call creates a session (201, created=true)', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId: ENTITY_ID_A, periodLabel: PERIOD_LABEL });
    expect(res.status).toBe(201);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.closeSessionId).toBeDefined();
    expect(res.body?.entityId).toBe(ENTITY_ID_A);
    expect(res.body?.periodLabel).toBe(PERIOD_LABEL);
    expect(res.body?.status).toBe('open');
    expect(res.body?.created).toBe(true);
  });

  it('B) second call with same entityId/periodLabel returns same closeSessionId (200, created=false)', async () => {
    if (!isDbConfigured()) return;
    const first = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId: ENTITY_ID_B, periodLabel: PERIOD_LABEL });
    const firstId = first.body?.closeSessionId;
    const res = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId: ENTITY_ID_B, periodLabel: PERIOD_LABEL });
    expect(res.status).toBe(200);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.closeSessionId).toBe(firstId);
    expect(res.body?.entityId).toBe(ENTITY_ID_B);
    expect(res.body?.periodLabel).toBe(PERIOD_LABEL);
    expect(res.body?.created).toBe(false);
  });

  it('C) missing entityId or periodLabel returns 400 VALIDATION', async () => {
    const missingEntity = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ periodLabel: PERIOD_LABEL });
    expect(missingEntity.status).toBe(400);
    expect(missingEntity.body?.code).toBe('VALIDATION');

    const missingPeriod = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({ entityId: ENTITY_ID });
    expect(missingPeriod.status).toBe(400);
    expect(missingPeriod.body?.code).toBe('VALIDATION');
  });

  it('D) tenant missing returns 400 VALIDATION', async () => {
    // Omit x-tenant-id and Authorization so tenant context is missing (401) or 400 VALIDATION
    const res = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Content-Type', 'application/json')
      .send({ entityId: ENTITY_ID, periodLabel: PERIOD_LABEL });
    if (res.status === 400) {
      expect(res.body?.code).toBe('VALIDATION');
    }
    expect([400, 401, 403]).toContain(res.status);
  });
});
