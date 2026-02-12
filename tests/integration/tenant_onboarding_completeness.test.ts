/**
 * Tenant onboarding completeness: POST /api/tenants.
 * - Create tenant without BYOD → uses central DB, migrations run
 * - Create tenant with BYOD (valid URL) → connects, migrations run
 * - Create tenant with invalid database_url → returns 400
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { isDbConfigured, queryControl } from '../../src/db/index.js';

describe('Tenant onboarding — POST /api/tenants', () => {
  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Tenant onboarding: DATABASE_URL not set; skipping.');
    }
  });

  it('creates tenant without BYOD: uses central DB, migrations run', async () => {
    if (!isDbConfigured()) return;

    const res = await request(app)
      .post('/api/tenants')
      .set('Content-Type', 'application/json')
      .send({ name: 'Test Tenant No BYOD' });

    expect(res.status).toBe(201);
    expect(res.body.tenantId).toBeDefined();
    expect(typeof res.body.tenantId).toBe('string');
    expect(res.body.status).toBe('active');
    expect(res.body.databaseConfigured).toBe(false);
    expect(res.body.migrationsRun).toBe(true);

    const r = await queryControl<{ id: string; name: string; database_url: string | null }>(
      'SELECT id, name, database_url FROM tenants WHERE id = $1',
      [res.body.tenantId]
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0]?.name).toBe('Test Tenant No BYOD');
    expect(r.rows[0]?.database_url).toBeNull();
  }, 15000);

  it('creates tenant with BYOD: connects, migrations run', async () => {
    if (!isDbConfigured()) return;

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return;

    const res = await request(app)
      .post('/api/tenants')
      .set('Content-Type', 'application/json')
      .send({
        name: 'Test Tenant BYOD',
        databaseUrl: dbUrl,
      });

    expect(res.status).toBe(201);
    expect(res.body.tenantId).toBeDefined();
    expect(res.body.status).toBe('active');
    expect(res.body.databaseConfigured).toBe(true);
    expect(res.body.migrationsRun).toBe(true);

    const r = await queryControl<{ id: string; database_url: string | null }>(
      'SELECT id, database_url FROM tenants WHERE id = $1',
      [res.body.tenantId]
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0]?.database_url).toBe(dbUrl);
  }, 20000);

  it('creates tenant with invalid database_url: returns 400', async () => {
    if (!isDbConfigured()) return;

    const res = await request(app)
      .post('/api/tenants')
      .set('Content-Type', 'application/json')
      .send({
        name: 'Test Tenant Invalid',
        databaseUrl: 'postgresql://invalid-host-that-does-not-exist:5432/nonexistent',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot connect|connection/);
  }, 10000);

});
