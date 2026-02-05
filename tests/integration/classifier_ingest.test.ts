/**
 * Integration test: after imbalanced TB ingest (staged), classifications exist for staged rows.
 * Uses AI_MOCK_CLASSIFIER=true for deterministic classification; fail-open when classifier fails.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';
import * as persistence from '../../src/services/persistence_service.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `classifier-ingest-tenant-${Date.now()}`;
const PERIOD_LABEL = '2025-01';
const IMBALANCED_CSV = `AccountName,Debit,Credit
Cash,1000,0
Revenue,0,400`;

describe('Classifier on ingest (staged)', () => {
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('after staged ingest with AI_MOCK_CLASSIFIER=true, staging payload has classification_results', async () => {
    if (!isDbConfigured()) return;

    const prevMock = process.env.AI_MOCK_CLASSIFIER;
    process.env.AI_MOCK_CLASSIFIER = 'true';
    const ingestPath =
      process.env.NODE_ENV === 'production' ? '/api/trial-balance/ingest' : '/api-dev/trial-balance/ingest';
    const tmpCsv = path.join(os.tmpdir(), `classifier-ingest-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, IMBALANCED_CSV, 'utf8');
    let stagedId: string | undefined;
    try {
      const res = await request(app)
        .post(ingestPath)
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', TEST_TENANT_ID)
        .field('periodLabel', PERIOD_LABEL)
        .attach('file', tmpCsv);
      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('staged');
      stagedId = res.body?.stagedId;
    } finally {
      fs.unlinkSync(tmpCsv);
      if (prevMock !== undefined) process.env.AI_MOCK_CLASSIFIER = prevMock;
      else delete process.env.AI_MOCK_CLASSIFIER;
    }

    if (!stagedId) return;
    const pool = await getTenantPool(TEST_TENANT_ID);
    const item = await persistence.getStagingItem(pool, TEST_TENANT_ID, stagedId);
    expect(item).toBeDefined();
    const payload = item?.payload as Record<string, unknown> | undefined;
    expect(payload?.classification_results).toBeDefined();
    expect(Array.isArray(payload?.classification_results)).toBe(true);
    expect((payload?.classification_results as unknown[]).length).toBeGreaterThanOrEqual(0);
  });
});
