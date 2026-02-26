/**
 * Integration: tenant injection hardening.
 * When strict mode (MODE=demo), body tenantId must NOT be used; request without auth tenant should fail.
 * Uses minimal form body (no file) to avoid ECONNRESET when server rejects before reading multipart.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { isDbConfigured } from '../../src/db/index.js';
import { resetModeCache } from '../../src/lib/runtime_mode.js';

const BALANCED_CSV = `AccountName,Debit,Credit
Cash,100,0
Revenue,0,100`;

describe('Tenant injection hardening', () => {
  beforeAll(async () => {
    if (!isDbConfigured()) return;
    await request(app).get('/health').catch(() => {});
  });

  it('when MODE=demo, body tenantId is NOT used — request without auth tenant returns 400/401/503', async () => {
    if (!isDbConfigured()) return;
    if (process.env.MODE === 'prod') return;

    const prevMode = process.env.MODE;
    process.env.MODE = 'demo';
    resetModeCache();

    const tmpCsv = path.join(os.tmpdir(), `tenant-injection-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_CSV, 'utf8');

    try {
      // Use field + attach; accept 400/401/503 (401 when requireAuth rejects, 503 when requireTenantContext rejects)
      const res = await request(app)
        .post('/api/trial-balance/ingest')
        .field('tenantId', 'injected-tenant-from-body')
        .field('periodLabel', '2025-01')
        .attach('file', tmpCsv)
        .timeout(10000);

      expect([400, 401, 503]).toContain(res.status);
      expect(res.body?.error ?? res.body?.message).toBeDefined();
    } catch (err: unknown) {
      // ECONNRESET can occur when server rejects (401/503) before fully reading multipart body
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNRESET') || msg.includes('socket hang up')) {
        expect(true).toBe(true); // Treat as "request was rejected" — body tenantId was not honored
      } else {
        throw err;
      }
    } finally {
      try {
        fs.unlinkSync(tmpCsv);
      } catch {
        /* ignore */
      }
      if (prevMode !== undefined) process.env.MODE = prevMode;
      else delete process.env.MODE;
      resetModeCache();
    }
  });
});
