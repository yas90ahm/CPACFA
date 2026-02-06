/**
 * Integration tests: POST journal-entries/:id/post error responses always include stable `code`.
 * - Shadow audit block → code=SHADOW_AUDIT_BLOCK (covered in shadow_audit_gate.test.ts).
 * - Unknown/service error → code=SERVICE.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `je-post-codes-tenant-${Date.now()}`;
const PERIOD_START = '2025-01-01';
const PERIOD_END = '2025-01-31';
const ENTITY_ID = 'entity-je-post-codes';

describe('JE post error response codes', () => {
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('when bridge throws, post returns 500 with code=SERVICE', async () => {
    if (!isDbConfigured()) return;

    const bridge = await import('../../src/bridge/index.js');
    const originalExecute = bridge.executeBridgeCommand;
    const mockExecute = jest.spyOn(bridge, 'executeBridgeCommand').mockImplementation(async (ctx, cmd) => {
      if ((cmd as { commandType?: string })?.commandType === 'PostJE') throw new Error('boom');
      return originalExecute(ctx, cmd);
    });

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
      const closeSessionId = sessionRes.body?.id;
      if (!closeSessionId) return;

      const createJeRes = await request(app)
        .post('/api/close/journal-entries')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          closeSessionId,
          source: 'manual',
          lines: [
            { accountRef: 'Cash', debit: 1, credit: 0, amountProvenance: { kind: 'human_entered', enteredBy: 'test-user' } },
            { accountRef: 'Revenue', debit: 0, credit: 1, amountProvenance: { kind: 'human_entered', enteredBy: 'test-user' } },
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

      expect(postRes.status).toBe(500);
      expect(postRes.body?.error).toBeDefined();
      expect(postRes.body?.code).toBe('SERVICE');
    } finally {
      mockExecute.mockRestore();
    }
  });
});
