/**
 * Dev API isolation: /api-dev must NOT mount when MODE=demo, MODE=prod, or without ENABLE_DEV_API.
 * Single canonical API: /api. Dev routes require MODE=dev AND ENABLE_DEV_API=true.
 *
 * Mount decision is made at server load; run with ENABLE_DEV_API=true for smoke test C:
 *   ENABLE_DEV_API=true npm test -- dev_api_isolation
 */

import request from 'supertest';
import { describe, it, expect, afterEach } from '@jest/globals';
import { app, isDevApiMounted } from '../../src/server.js';
import { resetModeCache } from '../../src/lib/runtime_mode.js';

/** Set at load: app mount was decided when server.ts was first imported. */
const devApiMountedAtLoad = process.env.ENABLE_DEV_API === 'true' && process.env.MODE === 'dev';

describe('Dev API isolation', () => {
  const originalMode = process.env.MODE;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnableDevApi = process.env.ENABLE_DEV_API;

  afterEach(() => {
    if (originalMode !== undefined) process.env.MODE = originalMode;
    else delete process.env.MODE;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalEnableDevApi !== undefined) process.env.ENABLE_DEV_API = originalEnableDevApi;
    else delete process.env.ENABLE_DEV_API;
  });

  it('A) With MODE=demo: GET /api-dev/trial-balance/supported returns 404 (route not mounted)', async () => {
    if (devApiMountedAtLoad) return; // App was loaded with dev API; skip (can't unmount)
    process.env.MODE = 'demo';
    process.env.NODE_ENV = 'test';
    resetModeCache();
    expect(isDevApiMounted()).toBe(false);
    const res = await request(app).get('/api-dev/trial-balance/supported');
    expect(res.status).toBe(404);
  });

  it('B) With MODE=prod: /api-dev/trial-balance/ingest returns 404', async () => {
    if (devApiMountedAtLoad) return; // App was loaded with dev API; skip
    process.env.MODE = 'prod';
    process.env.NODE_ENV = 'production';
    resetModeCache();
    expect(isDevApiMounted()).toBe(false);
    const res = await request(app)
      .post('/api-dev/trial-balance/ingest')
      .set('Content-Type', 'multipart/form-data')
      .field('tenantId', 'test')
      .field('periodLabel', '2025-01')
      .attach('file', Buffer.from('Account,Debit,Credit\nCash,100,0\nEquity,0,100'), 'tb.csv');
    expect(res.status).toBe(404);
  });

  it('C) With ENABLE_DEV_API=true at load: /api-dev/trial-balance/supported works (smoke)', async () => {
    if (!devApiMountedAtLoad) {
      expect(isDevApiMounted()).toBe(false);
      const res = await request(app).get('/api-dev/trial-balance/supported');
      expect(res.status).toBe(404);
      return;
    }
    expect(isDevApiMounted()).toBe(true);
    const res = await request(app).get('/api-dev/trial-balance/supported');
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('D) Without ENABLE_DEV_API: /api-dev returns 404', async () => {
    if (devApiMountedAtLoad) return; // App was loaded with dev API; skip
    expect(isDevApiMounted()).toBe(false);
    const res = await request(app).get('/api-dev/trial-balance/supported');
    expect(res.status).toBe(404);
  });
});
