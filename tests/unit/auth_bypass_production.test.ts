/**
 * Auth bypass impossible in production.
 * - In MODE=prod, useRequireAuthForApi() is always true (REQUIRE_AUTH cannot disable).
 * - No path-based bypass exists in main router (removed).
 * - Dev-only diagnostics router is mounted only when MODE=dev.
 *
 * Run production app tests with:
 *   TEST_AUTH_PRODUCTION=1 MODE=prod NODE_ENV=production npx jest tests/unit/auth_bypass_production.test.ts --runInBand
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import request from 'supertest';
import { app, useRequireAuthForApi } from '../../src/server.js';
import { resetModeCache } from '../../src/lib/runtime_mode.js';

const isProduction = process.env.MODE === 'prod' || process.env.NODE_ENV === 'production';

describe('Auth bypass impossible in production', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMode = process.env.MODE;
  const originalRequireAuth = process.env.REQUIRE_AUTH;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalMode !== undefined) process.env.MODE = originalMode;
    else delete process.env.MODE;
    process.env.REQUIRE_AUTH = originalRequireAuth;
    resetModeCache();
  });

  it('useRequireAuthForApi returns true when MODE=prod', () => {
    process.env.MODE = 'prod';
    process.env.NODE_ENV = 'production';
    process.env.REQUIRE_AUTH = 'false';
    resetModeCache();
    expect(useRequireAuthForApi()).toBe(true);
  });

  it('useRequireAuthForApi returns true when MODE=prod and REQUIRE_AUTH unset', () => {
    process.env.MODE = 'prod';
    process.env.NODE_ENV = 'production';
    delete process.env.REQUIRE_AUTH;
    resetModeCache();
    expect(useRequireAuthForApi()).toBe(true);
  });

  it('unauthenticated POST /api/trial-balance/ingest returns 401', async () => {
    if (!isProduction) return;
    const res = await request(app)
      .post('/api/trial-balance/ingest')
      .set('Content-Type', 'multipart/form-data')
      .field('tenantId', 'test-tenant')
      .field('periodLabel', '2025-01')
      .attach('file', Buffer.from('Account,Debit,Credit\nCash,100,0\nRevenue,0,100'), 'tb.csv');
    expect(res.status).toBe(401);
  });

  it('unauthenticated POST /api/supervisor/chat returns 401', async () => {
    if (!isProduction) return;
    const res = await request(app)
      .post('/api/supervisor/chat')
      .set('Content-Type', 'application/json')
      .send({ message: 'test' });
    expect(res.status).toBe(401);
  });

  it('unauthenticated GET /api/supervisor/session/:id/trace returns 401', async () => {
    if (!isProduction) return;
    const res = await request(app).get('/api/supervisor/session/any-session-id/trace');
    expect(res.status).toBe(401);
  });

  it('POST /api-dev/trial-balance/ingest returns 404 when MODE=prod (dev API never mounted in prod)', async () => {
    if (!isProduction) return;
    const res = await request(app)
      .post('/api-dev/trial-balance/ingest')
      .set('Content-Type', 'multipart/form-data')
      .field('tenantId', 'test-tenant')
      .attach('file', Buffer.from('a,b,c'), 'x.csv');
    expect(res.status).toBe(404);
  });
});
