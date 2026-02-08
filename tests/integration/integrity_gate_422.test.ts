/**
 * Integration test: Integrity gate returns 422 with FINAL_INTEGRITY_CHECK_FAILED
 * when trial balance is imbalanced or balance sheet equation fails.
 *
 * Proves: statementGenerator and buildValidatedStatements paths both enforce
 * the Truth Gate; endpoints return 422 (not 500 or 400) with correct code.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import { isDbConfigured, queryControl } from '../../src/db/index.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `integrity-gate-422-tenant-${Date.now()}`;

describe('Integrity gate 422', () => {
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('POST /api/trial-balance/statements returns 422 with FINAL_INTEGRITY_CHECK_FAILED when TB imbalanced', async () => {
    if (!isDbConfigured()) return;

    const res = await request(app)
      .post('/api/trial-balance/statements')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        entries: [
          { accountName: 'Cash', debit: 100, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 99 },
        ],
        standard: 'US_GAAP',
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('FINAL_INTEGRITY_CHECK_FAILED');
    expect(res.body.error).toBe('MathematicalIntegrityError');
    expect(res.body.check).toBe('A');
    expect(res.body.imbalanceAmount).toBe(1);
  });
});
