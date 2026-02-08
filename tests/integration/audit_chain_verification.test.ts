/**
 * Integration tests: GET /api/verification/audit-chain
 * Auditor verification surface — read-only audit ledger chain integrity.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';
import { recordMaterialEvent } from '../../src/services/audit_ledger_service.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'audit-chain-verification-tenant';

describe('GET /api/verification/audit-chain', () => {
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Audit chain verification: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthToken(TEST_TENANT_ID);
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('A) Missing tenant context → 400 VALIDATION', async () => {
    const res = await request(app).get('/api/verification/audit-chain');
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('VALIDATION');
    expect(res.body?.error).toBe('Tenant context required');
  });

  it('B) Normal chain → 200 verified:true', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);
    await recordMaterialEvent(pool, {
      tenantId: TEST_TENANT_ID,
      periodLabel: '2025-09',
      eventType: 'certify_close',
      deterministicFlagSnapshot: { closeSessionId: 'sess-audit-chain-test', periodLabel: '2025-09' },
      createdBy: 'test-setup',
    });

    const res = await request(app)
      .get('/api/verification/audit-chain')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.auditChain).toBeDefined();
    expect(res.body?.auditChain?.tenantId).toBe(TEST_TENANT_ID);
    expect(res.body?.auditChain?.verified).toBe(true);
    expect(res.body?.auditChain?.entryCount).toBeGreaterThanOrEqual(1);
    expect(res.body?.auditChain?.verifiedAt).toBeDefined();
    expect(res.body?.auditChain?.lastEntryId).toBeDefined();
    expect(res.body?.auditChain?.lastEntryHash).toBeDefined();
    expect(res.body?.auditChain?.error).toBeUndefined();
  });

  it('C) Broken chain simulation → 200 verified:false with error', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(TEST_TENANT_ID);
    const r = await pool.query<{ id: string }>(
      'SELECT id FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1',
      [TEST_TENANT_ID]
    );
    const entryId = r.rows[0]?.id;
    if (!entryId) {
      console.warn('Audit chain broken test: no entries; skipping.');
      return;
    }
    await pool.query(
      'UPDATE audit_ledger SET entry_hash = $1 WHERE id = $2',
      ['tampered_hash_value_12345', entryId]
    );

    const res = await request(app)
      .get('/api/verification/audit-chain')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.auditChain?.verified).toBe(false);
    expect(res.body?.auditChain?.error).toBeDefined();
    expect(res.body?.auditChain?.error?.code).toBe('CHAIN_BROKEN');
    expect(res.body?.auditChain?.error?.message).toBeDefined();
    expect(res.body?.auditChain?.error?.brokenAtEntryId).toBe(entryId);
  });
});
