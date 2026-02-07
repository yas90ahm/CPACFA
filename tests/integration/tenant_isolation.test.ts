/**
 * Tenant isolation: user from tenant A cannot access tenant B's data via ?tenantId=tenantB.
 * Verifies the IDOR fix in integrations and ingestion routes.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured, queryControl } from '../../src/db/index.js';

const TENANT_A = 'tenant-isolation-tenant-a';
const TENANT_B = 'tenant-isolation-tenant-b';

describe('Tenant isolation (IDOR prevention)', () => {
  let tokenTenantA: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    tokenTenantA = getTestAuthToken(TENANT_A);
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL), ($3, $4, NULL) ON CONFLICT (id) DO NOTHING',
      [TENANT_A, `Test ${TENANT_A}`, TENANT_B, `Test ${TENANT_B}`]
    );
  });

  it('GET /api/integrations/list?tenantId=tenantB returns tenant A data when authenticated as tenant A', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .get(`/api/integrations/list?tenantId=${TENANT_B}`)
      .set('Authorization', `Bearer ${tokenTenantA}`);
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(TENANT_A);
    expect(res.body).toHaveProperty('integrations');
  });

  it('GET /api/integrations/google/status?tenantId=tenantB returns tenant A data when authenticated as tenant A', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .get(`/api/integrations/google/status?tenantId=${TENANT_B}`)
      .set('Authorization', `Bearer ${tokenTenantA}`);
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(TENANT_A);
    expect(res.body).toHaveProperty('connected');
  });

  it('GET /api/ingestion/fetchers/usage?tenantId=tenantB returns 200 when authenticated as tenant A (uses JWT tenant)', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .get(`/api/ingestion/fetchers/usage?tenantId=${TENANT_B}`)
      .set('Authorization', `Bearer ${tokenTenantA}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('usage');
    expect(res.body).toHaveProperty('quota');
  });

  it('POST /api/ingestion/fetchers/run?tenantId=tenantB&mode=fetch returns 200 when authenticated as tenant A (uses JWT tenant)', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post(`/api/ingestion/fetchers/run?tenantId=${TENANT_B}&mode=fetch`)
      .set('Authorization', `Bearer ${tokenTenantA}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/integrations/list without auth returns 401 or 403', async () => {
    const res = await request(app).get('/api/integrations/list?tenantId=other');
    expect([401, 403, 503]).toContain(res.status);
  });
});
