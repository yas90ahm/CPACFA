/**
 * Integration tests: APP_MODE=demo auth enforcement.
 * - Unauthenticated request returns 401
 * - Demo user can authenticate and access API
 *
 * IMPORTANT: APP_MODE must be set before server import so auth middleware uses demo mode.
 */
process.env.APP_MODE = 'demo';
process.env.MODE = 'demo';
process.env.REQUIRE_AUTH = 'true';

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { isDbConfigured } from '../../src/db/index.js';
import { resetModeCache } from '../../src/lib/runtime_mode.js';
import { getUserByEmail } from '../../src/db/repositories/user_repository.js';
import { seedDemo } from '../../src/scripts/seed_demo.js';

const DEMO_TENANT_ID = 'demo-cloudmetrics';
const DEMO_EMAIL = 'demo@cpacfa.com';
const DEMO_PASSWORD = 'demo-password-change-me';

describe('APP_MODE=demo auth', () => {
  const origEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    ['APP_MODE', 'MODE', 'REQUIRE_AUTH'].forEach((k) => {
      origEnv[k] = process.env[k];
    });
    process.env.APP_MODE = 'demo';
    process.env.MODE = 'demo';
    process.env.REQUIRE_AUTH = 'true';
    resetModeCache();
    if (isDbConfigured()) {
      await seedDemo();
    }
  });

  afterAll(() => {
    Object.entries(origEnv).forEach(([k, v]) => {
      if (v !== undefined) process.env[k] = v;
      else delete process.env[k];
    });
    resetModeCache();
  });

  it('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .get('/api/close/journal-entries')
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(401);
    expect(res.body?.error).toBe('Unauthorized');
  });

  it('demo user can authenticate and access API', async () => {
    if (!isDbConfigured()) return;

    const user = await getUserByEmail(DEMO_TENANT_ID, DEMO_EMAIL);
    if (!user) {
      console.warn('[app_mode_demo_auth] Demo user not seeded; run seed:demo or start server in demo mode first.');
      return;
    }

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({
        tenantId: DEMO_TENANT_ID,
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });

    expect(loginRes.status).toBe(200);
    const token = loginRes.body?.token;
    expect(token).toBeDefined();

    const apiRes = await request(app)
      .get('/api/close/journal-entries')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json');

    expect(apiRes.status).toBe(200);
    expect(apiRes.body?.journalEntries).toBeDefined();
  });
});
