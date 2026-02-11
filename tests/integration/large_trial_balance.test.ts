/**
 * Performance tests: Large trial balance upload.
 *
 * Tests:
 * - 1,000 rows: Should be fast
 * - 10,000 rows: Should complete within 30s; save; certify; export
 * - 50,000 rows: Should work or fail gracefully with clear error
 * - 100,001 rows: Exceeds MAX_TB_ROWS (default 100k), should reject with 413
 *
 * PERFORMANCE RESULTS (typical run, DATABASE_URL set, AI_MOCK=true):
 * - 1,000 rows:  ~3s   (baseline)
 * - 10,000 rows: ~6s ingest, full certify+export OK
 * - 50,000 rows: ~104s (bottleneck: statement build, classification, or DB upsert)
 * - 100,001 rows: ~1s rejection (413, correct)
 *
 * BOTTLENECKS: 50k ingest is slow; consider batching, streaming, or pagination.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import {
  isDbConfigured,
  getTenantPool,
  queryControl,
} from '../../src/db/index.js';
import * as periodTbRepo from '../../src/db/repositories/period_trial_balance_repository.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `large-tb-tenant-${Date.now()}`;
const ENTITY_ID = `entity-large-tb-${Date.now()}`;
const PERIOD_LABEL = '2025-01';
const PERIOD_START = '2025-01-01';
const PERIOD_END = '2025-01-31';

/** Generate balanced CSV. Half rows debit, half credit; amounts sum to equal totals. */
function generateBalancedCsv(rowCount: number): string {
  const half = Math.floor(rowCount / 2);
  const amountPerRow = 100;
  const lines: string[] = ['Account Name,Debit,Credit'];
  for (let i = 0; i < half; i++) {
    lines.push(`Account-${i},${amountPerRow},0`);
  }
  for (let i = half; i < rowCount; i++) {
    lines.push(`Account-${i},0,${amountPerRow}`);
  }
  return lines.join('\n');
}

describe('Large trial balance upload', () => {
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Large trial balance: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('1,000 rows: completes quickly (baseline)', async () => {
    if (!isDbConfigured()) return;
    const periodLabel = `2025-01-1k-${Date.now()}`;
    const csv = generateBalancedCsv(1000);
    const tmpCsv = path.join(os.tmpdir(), `large-tb-1k-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, csv, 'utf8');
    const start = Date.now();
    try {
      const res = await request(app)
        .post('/api/trial-balance/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', TEST_TENANT_ID)
        .field('periodLabel', periodLabel)
        .attach('file', tmpCsv);
      const elapsed = Date.now() - start;
      expect(res.status).toBe(200);
      expect(res.body?.balanceSheet?.balances).toBe(true);
      expect(elapsed).toBeLessThan(15000);
      console.log(`[PERF] 1,000 rows: ${elapsed}ms`);
    } finally {
      fs.unlinkSync(tmpCsv);
    }
  }, 20000);

  it(
    '10,000 rows: completes within 30s, saves to period_trial_balance, can certify and export',
    async () => {
      if (!isDbConfigured()) return;
      const periodLabel = PERIOD_LABEL;
      const csv = generateBalancedCsv(10000);
      const tmpCsv = path.join(os.tmpdir(), `large-tb-10k-${Date.now()}.csv`);
      fs.writeFileSync(tmpCsv, csv, 'utf8');

      const startIngest = Date.now();
      let res: { status: number; body?: unknown };
      try {
        res = await request(app)
          .post('/api/trial-balance/ingest')
          .set('Authorization', `Bearer ${authToken}`)
          .field('tenantId', TEST_TENANT_ID)
          .field('periodLabel', periodLabel)
          .attach('file', tmpCsv);
      } finally {
        fs.unlinkSync(tmpCsv);
      }
      const ingestMs = Date.now() - startIngest;

      expect(res.status).toBe(200);
      expect((res.body as { balanceSheet?: { balances?: boolean } })?.balanceSheet?.balances).toBe(true);
      expect(ingestMs).toBeLessThan(30000);
      console.log(`[PERF] 10,000 rows ingest: ${ingestMs}ms`);

      const pool = await getTenantPool(TEST_TENANT_ID);
      const record = await periodTbRepo.getUnadjusted(pool, TEST_TENANT_ID, periodLabel);
      expect(record).toBeDefined();
      expect(record!.entries.length).toBe(10000);

      const createRes = await request(app)
        .post('/api/close/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .set('Content-Type', 'application/json')
        .send({
          entityId: ENTITY_ID,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          basis: 'accrual',
          standard: 'GAAP',
        });
      expect([200, 201]).toContain(createRes.status);
      const closeSessionId = createRes.body?.id;
      if (!closeSessionId) return;

      const initRes = await request(app)
        .post(`/api/close/sessions/${closeSessionId}/checklist/initialize`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID);
      expect([200, 201]).toContain(initRes.status);

      const listRes = await request(app)
        .get(`/api/close/sessions/${closeSessionId}/checklist`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID);
      expect(listRes.status).toBe(200);
      const items = listRes.body?.items ?? listRes.body ?? [];
      for (const item of Array.isArray(items) ? items : []) {
        const id = item.id ?? item;
        if (typeof id !== 'string') continue;
        const skipRes = await request(app)
          .post(`/api/close/checklist-items/${id}/skip`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('x-tenant-id', TEST_TENANT_ID)
          .set('Content-Type', 'application/json')
          .send({ completedBy: 'test-user' });
        expect([200, 404]).toContain(skipRes.status);
      }

      for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
        const patchRes = await request(app)
          .patch(`/api/close/sessions/${closeSessionId}/status`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('x-tenant-id', TEST_TENANT_ID)
          .set('Content-Type', 'application/json')
          .send({ status });
        expect(patchRes.status).toBe(200);
      }

      const lockRes = await request(app)
        .post('/api/close/period-lock')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .set('Content-Type', 'application/json')
        .send({
          periodLabel,
          lockedBy: 'test-user',
          reason: 'Large TB perf test',
        });
      expect(lockRes.status).toBe(200);

      const certifyRes = await request(app)
        .post(`/api/close/sessions/${closeSessionId}/certify`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .set('Content-Type', 'application/json')
        .send({
          certifiedBy: 'test-user',
          periodLabel,
          memo: 'Large TB perf test',
        });
      expect(certifyRes.status).toBe(200);
      expect(certifyRes.body?.status).toBe('certified');

      const exportRes = await request(app)
        .post('/api/export/pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .set('Content-Type', 'application/json')
        .send({
          exportMode: 'certified',
          periodLabel,
          closeSessionId,
          cover: { entity_name: 'E', report_date: PERIOD_END, period_label: periodLabel },
          executive_summary: 'Summary',
          financial_statements: { balance_sheet: { totalAssets: 500000, totalLiabilities: 0, totalEquity: 500000 } },
          clean_ledger: [{ account_name: 'A', debit: 500000, credit: 0 }, { account_name: 'B', debit: 0, credit: 500000 }],
        });
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers['content-type']).toMatch(/pdf|octet-stream/);
      console.log(`[PERF] 10,000 rows full flow: ingest ${ingestMs}ms + certify + export OK`);
    },
    60000
  );

  it(
    '50,000 rows: works or fails gracefully with clear error',
    async () => {
      if (!isDbConfigured()) return;
      const periodLabel = `2025-01-50k-${Date.now()}`;
      const csv = generateBalancedCsv(50000);
      const tmpCsv = path.join(os.tmpdir(), `large-tb-50k-${Date.now()}.csv`);
      fs.writeFileSync(tmpCsv, csv, 'utf8');
      const start = Date.now();
      try {
        const res = await request(app)
          .post('/api/trial-balance/ingest')
          .set('Authorization', `Bearer ${authToken}`)
          .field('tenantId', TEST_TENANT_ID)
          .field('periodLabel', periodLabel)
          .attach('file', tmpCsv);
        const elapsed = Date.now() - start;
        if (res.status === 200) {
          expect(res.body?.balanceSheet?.balances).toBe(true);
          const pool = await getTenantPool(TEST_TENANT_ID);
          const record = await periodTbRepo.getUnadjusted(pool, TEST_TENANT_ID, periodLabel);
          expect(record?.entries.length).toBe(50000);
          console.log(`[PERF] 50,000 rows: ${elapsed}ms (success)`);
        } else if (res.status === 413) {
          expect(res.body?.error).toBeDefined();
          expect(res.body?.rowCount).toBe(50000);
          expect(res.body?.maxAllowed).toBeDefined();
          console.log(`[PERF] 50,000 rows: rejected (413) in ${elapsed}ms`);
        } else {
          expect(res.status).toBe(200);
        }
      } finally {
        fs.unlinkSync(tmpCsv);
      }
    },
    120000
  );

  it('100,001 rows: exceeds MAX_TB_ROWS, rejects with 413', async () => {
    if (!isDbConfigured()) return;
    const periodLabel = `2025-01-100k-${Date.now()}`;
    const csv = generateBalancedCsv(100001);
    const tmpCsv = path.join(os.tmpdir(), `large-tb-100k-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, csv, 'utf8');
    const start = Date.now();
    try {
      const res = await request(app)
        .post('/api/trial-balance/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', TEST_TENANT_ID)
        .field('periodLabel', periodLabel)
        .attach('file', tmpCsv);
      const elapsed = Date.now() - start;
      expect(res.status).toBe(413);
      expect(res.body?.error).toBe('Trial balance too large');
      expect(res.body?.rowCount).toBe(100001);
      expect(res.body?.maxAllowed).toBeLessThanOrEqual(100001);
      expect(res.body?.message).toMatch(/exceeds maximum|Set MAX_TB_ROWS/);
      console.log(`[PERF] 100,001 rows: rejected in ${elapsed}ms`);
    } finally {
      fs.unlinkSync(tmpCsv);
    }
  }, 30000);
});
