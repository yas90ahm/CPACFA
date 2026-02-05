/**
 * Integration test: Advisor proposals created for staged rows; nothing posted automatically.
 * Uses AI_MOCK_ADVISOR=true; proposals stored in tenant_ai_proposals only; ledger unchanged.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';
import * as aiProposalsRepo from '../../src/db/repositories/tenant_ai_proposals_repository.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `advisor-proposals-tenant-${Date.now()}`;
const PERIOD_LABEL = '2025-01';
const IMBALANCED_CSV = `AccountName,Debit,Credit
Cash,1000,0
Revenue,0,400`;

describe('Advisor proposals (draft only)', () => {
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('after staged ingest with AI_MOCK_ADVISOR=true, tenant_ai_proposals row exists; no JE posted', async () => {
    if (!isDbConfigured()) return;

    const prevMock = process.env.AI_MOCK_ADVISOR;
    process.env.AI_MOCK_ADVISOR = 'true';
    const ingestPath =
      process.env.NODE_ENV === 'production' ? '/api/trial-balance/ingest' : '/api-dev/trial-balance/ingest';
    const tmpCsv = path.join(os.tmpdir(), `advisor-ingest-${Date.now()}.csv`);
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
      if (prevMock !== undefined) process.env.AI_MOCK_ADVISOR = prevMock;
      else delete process.env.AI_MOCK_ADVISOR;
    }

    if (!stagedId) return;
    const pool = await getTenantPool(TEST_TENANT_ID);
    const proposals = await aiProposalsRepo.listProposalsByStaging(pool, TEST_TENANT_ID, stagedId);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals[0].proposal).toBeDefined();
    const payload = proposals[0].proposal as { proposals?: unknown[] };
    expect(Array.isArray(payload?.proposals)).toBe(true);
    expect((payload?.proposals ?? []).length).toBeGreaterThanOrEqual(1);

    const jeCount = await pool.query(
      'SELECT count(*)::int AS n FROM journal_entries WHERE tenant_id = $1',
      [TEST_TENANT_ID]
    );
    expect(jeCount.rows[0]?.n ?? 0).toBe(0);
  });
});
