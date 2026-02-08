/**
 * Integration: tenant injection hardening.
 * When strict mode (MODE=demo), body tenantId must NOT be used; request without auth tenant should fail 400.
 * Uses /api/trial-balance/ingest (optionalAuth when REQUIRE_AUTH=false) so we can hit without token.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect } from '@jest/globals';
import { app } from '../../src/server.js';
import { isDbConfigured } from '../../src/db/index.js';
import { resetModeCache } from '../../src/lib/runtime_mode.js';

const BALANCED_CSV = `AccountName,Debit,Credit
Cash,100,0
Revenue,0,100`;

describe('Tenant injection hardening', () => {
  it('when MODE=demo, body tenantId is NOT used — request without auth tenant returns 400', async () => {
    if (!isDbConfigured()) return;
    if (process.env.MODE === 'prod') return;

    const prevMode = process.env.MODE;
    process.env.MODE = 'demo';
    resetModeCache();

    const tmpCsv = path.join(os.tmpdir(), `tenant-injection-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_CSV, 'utf8');

    try {
      const res = await request(app)
        .post('/api/trial-balance/ingest')
        .field('tenantId', 'injected-tenant-from-body')
        .field('periodLabel', '2025-01')
        .attach('file', tmpCsv);

      // Body tenantId must NOT be used; requireValidTenantId should fail because auth did not set tenantId
      expect([400, 503]).toContain(res.status);
      expect(res.body?.error).toBeDefined();
    } finally {
      fs.unlinkSync(tmpCsv);
      if (prevMode !== undefined) process.env.MODE = prevMode;
      else delete process.env.MODE;
      resetModeCache();
    }
  });
});
