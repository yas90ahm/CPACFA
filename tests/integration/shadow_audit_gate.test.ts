/**
 * Integration tests for Shadow Auditor pillar: block → 403, ok/warn → post succeeds, findings persisted.
 * Uses AI_MOCK=true with AI_SHADOW_SEVERITY=ok|warn|block.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `shadow-audit-tenant-${Date.now()}`;
const PERIOD_LABEL = '2025-01';
const PERIOD_START = '2025-01-01';
const PERIOD_END = '2025-01-31';
const ENTITY_ID = 'entity-shadow-audit';

describe('Shadow Auditor gate', () => {
  let authToken: string;
  let closeSessionId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('when AI_SHADOW_SEVERITY=block, post JE returns 403 and findings include block', async () => {
    if (!isDbConfigured()) return;

    const prevMock = process.env.AI_MOCK;
    const prevSeverity = process.env.AI_SHADOW_SEVERITY;
    process.env.AI_MOCK = 'true';
    process.env.AI_SHADOW_SEVERITY = 'block';
    try {
      const sessionRes = await request(app)
        .post('/api/close/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          entityId: ENTITY_ID,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          basis: 'accrual',
          standard: 'GAAP',
        });
      expect([200, 201]).toContain(sessionRes.status);
      closeSessionId = sessionRes.body?.id;
      if (!closeSessionId) return;

      const createJeRes = await request(app)
        .post('/api/close/journal-entries')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          closeSessionId,
          source: 'manual',
          lines: [
            { accountRef: 'Cash', debit: 1, credit: 0 },
            { accountRef: 'Revenue', debit: 0, credit: 1 },
          ],
        });
      expect([200, 201]).toContain(createJeRes.status);
      const jeId = createJeRes.body?.id;
      if (!jeId) return;

      await request(app)
        .post(`/api/close/journal-entries/${jeId}/propose`)
        .set('Authorization', `Bearer ${authToken}`);
      await request(app)
        .post(`/api/close/journal-entries/${jeId}/approve`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ approvedBy: 'test-approver' });

      const postRes = await request(app)
        .post(`/api/close/journal-entries/${jeId}/post`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(postRes.status).toBe(403);
      expect(postRes.body?.error).toBeDefined();
      expect(postRes.body?.code).toBe('SHADOW_AUDIT_BLOCK');

      const pool = await getTenantPool(TEST_TENANT_ID);
      const row = await pool.query(
        'SELECT id, severity, findings_json FROM tenant_shadow_audit_findings WHERE tenant_id = $1 AND journal_entry_id = $2 ORDER BY created_at DESC LIMIT 1',
        [TEST_TENANT_ID, jeId]
      );
      expect(row.rows.length).toBeGreaterThanOrEqual(1);
      expect(row.rows[0].severity).toBe('block');
    } finally {
      if (prevMock !== undefined) process.env.AI_MOCK = prevMock;
      else delete process.env.AI_MOCK;
      if (prevSeverity !== undefined) process.env.AI_SHADOW_SEVERITY = prevSeverity;
      else delete process.env.AI_SHADOW_SEVERITY;
    }
  });

  it('when AI_SHADOW_SEVERITY=ok, post JE succeeds and tenant_shadow_audit_findings row persisted', async () => {
    if (!isDbConfigured()) return;

    const prevMock = process.env.AI_MOCK;
    const prevSeverity = process.env.AI_SHADOW_SEVERITY;
    process.env.AI_MOCK = 'true';
    process.env.AI_SHADOW_SEVERITY = 'ok';
    try {
      const sessionRes = await request(app)
        .post('/api/close/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          entityId: ENTITY_ID + '-ok',
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          basis: 'accrual',
          standard: 'GAAP',
        });
      expect([200, 201]).toContain(sessionRes.status);
      const sessionId = sessionRes.body?.id;
      if (!sessionId) return;

      const createJeRes = await request(app)
        .post('/api/close/journal-entries')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          closeSessionId: sessionId,
          source: 'manual',
          lines: [
            { accountRef: 'Cash', debit: 1, credit: 0 },
            { accountRef: 'Revenue', debit: 0, credit: 1 },
          ],
        });
      expect([200, 201]).toContain(createJeRes.status);
      const jeId = createJeRes.body?.id;
      if (!jeId) return;

      await request(app)
        .post(`/api/close/journal-entries/${jeId}/propose`)
        .set('Authorization', `Bearer ${authToken}`);
      await request(app)
        .post(`/api/close/journal-entries/${jeId}/approve`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ approvedBy: 'test-approver' });

      const postRes = await request(app)
        .post(`/api/close/journal-entries/${jeId}/post`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(postRes.status).toBe(200);

      const pool = await getTenantPool(TEST_TENANT_ID);
      const row = await pool.query(
        'SELECT id, severity FROM tenant_shadow_audit_findings WHERE tenant_id = $1 AND journal_entry_id = $2 ORDER BY created_at DESC LIMIT 1',
        [TEST_TENANT_ID, jeId]
      );
      expect(row.rows.length).toBeGreaterThanOrEqual(1);
      expect(row.rows[0].severity).toBe('ok');
    } finally {
      if (prevMock !== undefined) process.env.AI_MOCK = prevMock;
      else delete process.env.AI_MOCK;
      if (prevSeverity !== undefined) process.env.AI_SHADOW_SEVERITY = prevSeverity;
      else delete process.env.AI_SHADOW_SEVERITY;
    }
  });
});
