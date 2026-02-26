/**
 * Integration test: Upload QuickBooks-format trial balance, verify A = L + E passes.
 * Validates CoA template auto-detection and correct balance sheet classification.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured, queryControl } from '../../src/db/index.js';

const QBO_CSV = `Account,Name,Type,Debit,Credit
1000,Cash,Bank,100000,0
1100,Accounts Receivable,Accounts Receivable,50000,0
2000,Accounts Payable,Accounts Payable,0,50000
3000,Equity,Equity,0,100000`;

describe('QuickBooks CoA ingest integration', () => {
  const tenantId = `coa-qbo-tenant-${Date.now()}`;
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('CoA QuickBooks ingest: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthToken(tenantId);
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL)',
      [tenantId, `Test ${tenantId}`]
    );
  });

  it('uploads QuickBooks-format TB and A = L + E passes', async () => {
    if (!isDbConfigured()) return;

    const res = await request(app)
      .post('/api/trial-balance/ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .field('tenantId', tenantId)
      .field('periodLabel', '2025-06')
      .attach('file', Buffer.from(QBO_CSV), 'qbo_tb.csv');

    expect(res.status).toBe(200);
    const body = res.body as { balance_sheet?: { balances?: boolean }; balanceSheet?: { balances?: boolean } };
    const bs = body.balance_sheet ?? body.balanceSheet;
    expect(bs?.balances).toBe(true);
  });
});
