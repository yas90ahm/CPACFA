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
    const freshTenantId = 'audit-chain-verified-tenant-' + Date.now();
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [freshTenantId, `Test ${freshTenantId}`]
    );
    const pool = await getTenantPool(freshTenantId);
    await recordMaterialEvent(pool, {
      tenantId: freshTenantId,
      periodLabel: '2025-09',
      eventType: 'certify_close',
      deterministicFlagSnapshot: { closeSessionId: 'sess-audit-chain-test', periodLabel: '2025-09' },
      createdBy: 'test-setup',
    });

    const freshAuthToken = getTestAuthToken(freshTenantId);
    const res = await request(app)
      .get('/api/verification/audit-chain')
      .set('Authorization', `Bearer ${freshAuthToken}`)
      .set('x-tenant-id', freshTenantId);
    expect(res.status).toBe(200);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.auditChain).toBeDefined();
    expect(res.body?.auditChain?.tenantId).toBe(freshTenantId);
    expect(res.body?.auditChain?.verified).toBe(true);
    expect(res.body?.auditChain?.entryCount).toBeGreaterThanOrEqual(1);
    expect(res.body?.auditChain?.verifiedAt).toBeDefined();
    expect(res.body?.auditChain?.lastEntryId).toBeDefined();
    expect(res.body?.auditChain?.lastEntryHash).toBeDefined();
    expect(res.body?.auditChain?.error).toBeUndefined();
    expect(res.body?.dbEnforcement).toBeDefined();
    expect(typeof res.body?.dbEnforcement?.appendOnlyTrigger).toBe('boolean');
    expect(typeof res.body?.dbEnforcement?.snapshotImmutabilityTrigger).toBe('boolean');
  });

  it('C) Broken chain simulation → 200 verified:false with error', async () => {
    if (!isDbConfigured()) return;
    const brokenTenantId = 'audit-chain-broken-tenant-' + Date.now();
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL)',
      [brokenTenantId, `Test ${brokenTenantId}`]
    );
    const pool = await getTenantPool(brokenTenantId);
    await recordMaterialEvent(pool, {
      tenantId: brokenTenantId,
      periodLabel: '2025-11',
      eventType: 'certify_close',
      deterministicFlagSnapshot: { closeSessionId: 'sess-broken-test', periodLabel: '2025-11' },
      createdBy: 'test',
    });
    const r = await pool.query<{ id: string; entry_hash: string }>(
      'SELECT id, entry_hash FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
      [brokenTenantId]
    );
    const lastEntry = r.rows[0];
    if (!lastEntry) {
      console.warn('Audit chain broken test: no entries; skipping.');
      return;
    }
    // Insert a row with wrong previous_entry_hash to create a broken chain (no UPDATE - triggers block that)
    const brokenId = 'al-broken-chain-test-' + Date.now();
    await pool.query(
      `INSERT INTO audit_ledger (
        id, tenant_id, period_label, event_type, deterministic_flag_snapshot,
        user_prompt_rationale, previous_entry_hash, entry_hash, created_at, hash_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 2)`,
      [
        brokenId,
        brokenTenantId,
        '2025-11',
        'bridge_command',
        '{}',
        'Broken chain test',
        'tampered_previous_hash_wrong', // wrong - does not match lastEntry.entry_hash
        'a'.repeat(64), // fake hash
      ]
    );

    const brokenAuthToken = getTestAuthToken(brokenTenantId);
    const res = await request(app)
      .get('/api/verification/audit-chain')
      .set('Authorization', `Bearer ${brokenAuthToken}`)
      .set('x-tenant-id', brokenTenantId);
    expect(res.status).toBe(200);
    expect(res.body?.auditChain?.verified).toBe(false);
    expect(res.body?.auditChain?.error).toBeDefined();
    expect(res.body?.auditChain?.error?.code).toBe('CHAIN_BROKEN');
    expect(res.body?.auditChain?.error?.message).toBeDefined();
    expect(res.body?.auditChain?.error?.brokenAtEntryId).toBe(brokenId);
  });
});
