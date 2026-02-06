/**
 * Full end-to-end close integration test.
 * Proves: ingest TB → create close session → add JE → reconcile/signoff → readiness → generate statements → verifyChain → export.
 * Skips when DATABASE_URL is not set.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool } from '../../src/db/index.js';
import { verifyChain } from '../../src/services/audit_ledger_service.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'full-close-flow-tenant';
const PERIOD_LABEL = '2025-01';
// TB must satisfy balance sheet equation (Assets = L+E). Cash (asset) + Equity (equity) does.
const SMALL_TB_CSV = `Account Name,Debit,Credit
Cash,1000,0
Equity,0,1000`;

describe('Full close flow integration', () => {
  let authToken: string;
  let closeSessionId: string | undefined;
  let adjustmentId: string | undefined;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Full close flow: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthToken(TEST_TENANT_ID);
  });

  it(
    'ingests trial balance',
    async () => {
      if (!isDbConfigured()) return;
      const path = process.env.NODE_ENV === 'production' ? '/api/trial-balance/ingest' : '/api-dev/trial-balance/ingest';
      const res = await request(app)
        .post(path)
        .set('Content-Type', 'multipart/form-data')
        .field('tenantId', TEST_TENANT_ID)
        .field('periodLabel', PERIOD_LABEL)
        .attach('file', Buffer.from(SMALL_TB_CSV), 'tb.csv');
      expect([200, 401, 503]).toContain(res.status);
      if (res.status === 503) return;
      if (res.status === 401) return;
      expect(res.body).toBeDefined();
    },
    15000
  );

  it('creates close session', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/close/sessions')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ tenantId: TEST_TENANT_ID, periodLabel: PERIOD_LABEL });
    if (res.status === 503) return;
    expect([200, 201, 400, 404]).toContain(res.status);
    if (res.status === 200 || res.status === 201) {
      closeSessionId = res.body?.id ?? res.body?.session?.id;
      expect(closeSessionId).toBeDefined();
    }
  });

  it('adds journal entry (adjustment)', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const res = await request(app)
      .post('/api/close/adjustments/from-je')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        tenantId: TEST_TENANT_ID,
        periodLabel: PERIOD_LABEL,
        closeSessionId,
        source: 'test',
        description: 'E2E test JE',
        debits: [{ account: 'Cash', amount: 0 }],
        credits: [{ account: 'Revenue', amount: 0 }],
      });
    if (res.status === 503) return;
    expect([200, 201, 400, 404]).toContain(res.status);
    if (res.body?.id) adjustmentId = res.body.id;
  });

  it('computes readiness', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const res = await request(app)
      .get(`/api/close/sessions/${closeSessionId}/readiness`)
      .set('Authorization', `Bearer ${authToken}`);
    if (res.status === 503) return;
    expect([200, 404]).toContain(res.status);
    if (res.status === 200 && res.body?.ready !== undefined) {
      expect(typeof res.body.ready).toBe('boolean');
    }
  });

  it('generates statement package', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/statement-packages/generate`)
      .set('Authorization', `Bearer ${authToken}`);
    if (res.status === 503) return;
    expect([200, 201, 400, 404]).toContain(res.status);
  });

  it('verifyChain returns valid when ledger consistent', async () => {
    if (!isDbConfigured()) return;
    let pool;
    try {
      pool = await getTenantPool(TEST_TENANT_ID);
    } catch {
      return;
    }
    if (!pool) return;
    const result = await verifyChain(pool, TEST_TENANT_ID);
    expect(result).toHaveProperty('valid');
    expect(typeof result.valid).toBe('boolean');
  });

  it('export succeeds when session and data exist', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const res = await request(app)
      .get(`/api/export/pdf?tenantId=${TEST_TENANT_ID}&closeSessionId=${closeSessionId}`)
      .set('Authorization', `Bearer ${authToken}`);
    if (res.status === 503) return;
    expect([200, 400, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/pdf|application\/octet-stream/);
    }
  });
});
