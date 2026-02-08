/**
 * Close session IDOR protection: tenantB cannot access tenantA's close sessions.
 * Creates session under tenantA, attempts access with tenantB JWT.
 * Expects 404 NOT_FOUND (prefer over 403 to avoid enumeration).
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import { isDbConfigured } from '../../src/db/index.js';

const TENANT_A = 'idor-tenant-a';
const TENANT_B = 'idor-tenant-b';
const PERIOD_LABEL = '2025-03';

describe('Close session IDOR protection', () => {
  let tokenA: string;
  let tokenB: string;
  let closeSessionId: string | undefined;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    tokenA = getTestAuthTokenWithRole(TENANT_A, 'preparer');
    tokenB = getTestAuthTokenWithRole(TENANT_B, 'preparer');
  });

  it('creates close session under tenantA', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Content-Type', 'application/json')
      .send({ entityId: 'default', periodLabel: PERIOD_LABEL });
    if (res.status === 503) return;
    expect([200, 201, 400]).toContain(res.status);
    if (res.status === 200 || res.status === 201) {
      closeSessionId = res.body?.closeSessionId ?? res.body?.id ?? res.body?.session?.id;
      expect(closeSessionId).toBeDefined();
    }
  });

  it('GET /api/close/sessions/:id as tenantB returns 404', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const res = await request(app)
      .get(`/api/close/sessions/${closeSessionId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    if (res.status === 503) return;
    expect(res.status).toBe(404);
  });

  it('POST /api/close/sessions/:id/advance as tenantB returns 404', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/advance`)
      .set('Authorization', `Bearer ${tokenB}`)
      .set('Content-Type', 'application/json')
      .send({});
    if (res.status === 503) return;
    expect(res.status).toBe(404);
  });

  it('GET /api/audit/pbc-index?closeSessionId=:id as tenantB returns 404', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const res = await request(app)
      .get(`/api/audit/pbc-index?closeSessionId=${encodeURIComponent(closeSessionId)}`)
      .set('Authorization', `Bearer ${tokenB}`);
    if (res.status === 503) return;
    expect(res.status).toBe(404);
  });
});
