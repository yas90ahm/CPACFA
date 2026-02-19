/**
 * Integration tests: GL HITL staging — imbalanced GL entries staged, resolve via API.
 *
 * Tests:
 * 1. Upload GL with imbalanced entry → stagedIds returned
 * 2. Staging item in DB with payload.kind = gl_ingest
 * 3. Resolve with apply_correction → entry saved to general_ledger
 * 4. TB re-derived
 * 5. Staging status = approved
 * 6. Resolve with skip → status = rejected, entry not saved
 * 7. Invalid correction (still imbalanced) → 422
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { createTenant, teardown } from '../helpers/integrationHarness.js';
import {
  isDbConfigured,
  getTenantPool,
} from '../../src/db/index.js';
import * as persistence from '../../src/services/persistence_service.js';
import * as glRepository from '../../src/db/repositories/general_ledger_repository.js';

const PERIOD_LABEL = '2024-Q1';

const GL_IMBALANCED_CSV = `entry_id,entry_date,account_code,debit,credit,description
JE-001,2024-03-01,1000,50000,0,Initial capital
JE-001,2024-03-01,3000,0,50000,Initial capital
JE-002,2024-03-05,1100,10000,0,Sale to Customer A
JE-002,2024-03-05,4000,0,10000,Sale to Customer A
JE-003,2024-03-10,1500,5000,0,Equipment purchase
JE-003,2024-03-10,1000,0,4500,Equipment purchase payment`;

const GL_IMBALANCED_SKIP_CSV = `entry_id,entry_date,account_code,debit,credit,description
JE-004,2024-03-15,5000,1000,0,Expense
JE-004,2024-03-15,1000,0,900,Expense payment`;

describe('GL HITL staging', () => {
  let ctx: Awaited<ReturnType<typeof createTenant>> | undefined;
  let tenantId: string;
  let authToken: string;
  let stagedId1: string;
  let stagedId2: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('GL HITL: DATABASE_URL not set; skipping.');
      return;
    }
    try {
      ctx = await createTenant('gl-hitl');
      tenantId = ctx.tenantId;
      authToken = ctx.authToken;
    } catch (e) {
      console.warn('GL HITL: createTenant failed (DB unavailable or schema not migrated):', (e as Error).message);
      ctx = undefined;
    }
  });

  afterAll(async () => {
    if (ctx && tenantId) await teardown(tenantId);
  });

  it('0. Upload COA so GL validation passes', async () => {
    if (!isDbConfigured() || !ctx) return;
    const coaPath = path.join(process.cwd(), 'test_data', 'sample_coa.csv');
    if (!fs.existsSync(coaPath)) {
      console.warn('sample_coa.csv not found; COA upload skipped');
      return;
    }
    const res = await request(app)
      .post('/api/coa/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', coaPath);
    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
  });

  it('1. Upload GL with imbalanced entry → stagedIds returned', async () => {
    if (!isDbConfigured() || !ctx) return;
    const tmpCsv = path.join(os.tmpdir(), `gl-imbalance-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, GL_IMBALANCED_CSV, 'utf8');
    try {
      const res = await request(app)
        .post(`/api/gl/ingest?period=${PERIOD_LABEL}`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', tmpCsv);

      expect(res.status).toBe(207);
      expect(res.body?.status).toBe('partial');
      expect(res.body?.balancedCount).toBe(2);
      expect(res.body?.imbalancedCount).toBe(1);
      expect(res.body?.stagedIds).toBeDefined();
      expect(Array.isArray(res.body.stagedIds)).toBe(true);
      expect(res.body.stagedIds.length).toBe(1);
      expect(res.body?.imbalancedEntries?.length).toBe(1);
      expect(res.body.imbalancedEntries[0]?.entry_id).toBe('JE-003');
      expect(res.body.imbalancedEntries[0]?.totalDebits).toBe(5000);
      expect(res.body.imbalancedEntries[0]?.totalCredits).toBe(4500);
      expect(res.body.imbalancedEntries[0]?.imbalance).toBe(500);

      stagedId1 = res.body.stagedIds[0];
    } finally {
      fs.unlinkSync(tmpCsv);
    }
  });

  it('2. Staging item exists with payload.kind = gl_ingest and pattern_detection', async () => {
    if (!isDbConfigured() || !ctx) return;
    const pool = await getTenantPool(tenantId);
    const item = await persistence.getStagingItem(pool, tenantId, stagedId1);
    expect(item).toBeDefined();
    expect(item?.status).toBe('pending');
    expect(item?.type).toBe('journal_entry');
    const payload = item?.payload as Record<string, unknown>;
    expect(payload?.kind).toBe('gl_ingest');
    expect(payload?.entry_id).toBe('JE-003');
    expect(payload?.periodLabel).toBe(PERIOD_LABEL);
    expect(payload?.imbalance).toBe(500);
    expect(payload?.pattern_detection).toBeDefined();
    const pd = payload?.pattern_detection as Record<string, unknown>;
    expect(pd?.primary_pattern).toBeDefined();
    expect(pd?.requires_ai).toBeDefined();
    expect(item?.justification).toContain('Pattern:');
  });

  it('3. Resolve with apply_correction → entry saved to general_ledger', async () => {
    if (!isDbConfigured() || !ctx) return;
    const res = await request(app)
      .post('/api/hitl/resolve-gl-ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        stagedId: stagedId1,
        resolution: {
          action: 'apply_correction',
          correctedLines: [
            { line_number: 1, account_code: '1500', debit: 5000, credit: 0, description: 'Equipment purchase' },
            { line_number: 2, account_code: '1000', debit: 0, credit: 5000, description: 'Equipment purchase payment - CORRECTED' },
          ],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(res.body?.message).toContain('corrected');
    expect(res.body?.entry_id).toBe('JE-003');
    expect(res.body?.linesInserted).toBe(2);
  });

  it('4. Corrected entry in general_ledger', async () => {
    if (!isDbConfigured() || !ctx) return;
    const pool = await getTenantPool(tenantId);
    const lines = await glRepository.getGLEntry(pool, tenantId, PERIOD_LABEL, 'JE-003');
    expect(lines.length).toBe(2);
    const totalDebits = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredits = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    expect(totalDebits).toBe(5000);
    expect(totalCredits).toBe(5000);
    const line2 = lines.find((l) => l.line_number === 2);
    expect(line2?.credit).toBe(5000);
  });

  it('5. TB re-derived with totals 65000', async () => {
    if (!isDbConfigured() || !ctx) return;
    const res = await request(app)
      .get(`/api/gl/trial-balance?period=${PERIOD_LABEL}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body?.status).toBe('valid');
    expect(res.body?.derivedTB?.total_debits).toBe(65000);
    expect(res.body?.derivedTB?.total_credits).toBe(65000);
    const { assets, liabilities, equity } = res.body.derivedTB?.balance_sheet_totals ?? {};
    expect(Math.abs(assets - (liabilities + equity))).toBeLessThanOrEqual(0.01);
  });

  it('6. Staging status = approved', async () => {
    if (!isDbConfigured() || !ctx) return;
    const pool = await getTenantPool(tenantId);
    const item = await persistence.getStagingItem(pool, tenantId, stagedId1);
    expect(item?.status).toBe('approved');
    expect(item?.approvedAt).toBeDefined();
    expect(item?.approvedBy).toBeDefined();
  });

  it('7. Upload another imbalanced entry and resolve with skip', async () => {
    if (!isDbConfigured() || !ctx) return;
    const tmpCsv = path.join(os.tmpdir(), `gl-skip-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, GL_IMBALANCED_SKIP_CSV, 'utf8');
    try {
      const uploadRes = await request(app)
        .post(`/api/gl/ingest?period=${PERIOD_LABEL}`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', tmpCsv);

      expect(uploadRes.status).toBe(207);
      expect(uploadRes.body?.stagedIds?.length).toBe(1);
      stagedId2 = uploadRes.body.stagedIds[0];

      const resolveRes = await request(app)
        .post('/api/hitl/resolve-gl-ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          stagedId: stagedId2,
          resolution: { action: 'skip' },
        });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body?.success).toBe(true);
      expect(resolveRes.body?.message).toContain('skipped');
    } finally {
      fs.unlinkSync(tmpCsv);
    }
  });

  it('8. Skip: staging status = rejected, entry not in GL', async () => {
    if (!isDbConfigured() || !ctx) return;
    const pool = await getTenantPool(tenantId);
    const item = await persistence.getStagingItem(pool, tenantId, stagedId2);
    expect(item?.status).toBe('rejected');

    const lines = await glRepository.getGLEntry(pool, tenantId, PERIOD_LABEL, 'JE-004');
    expect(lines.length).toBe(0);
  });

  it('9. Invalid correction (still imbalanced) → 422', async () => {
    if (!isDbConfigured() || !ctx) return;
    const tmpCsv = path.join(os.tmpdir(), `gl-invalid-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, GL_IMBALANCED_CSV, 'utf8');
    let badStagedId: string;
    try {
      const uploadRes = await request(app)
        .post(`/api/gl/ingest?period=${PERIOD_LABEL}`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', tmpCsv);
      if (uploadRes.body?.stagedIds?.length > 0) {
        badStagedId = uploadRes.body.stagedIds[0];
      } else {
        badStagedId = stagedId1;
      }
    } finally {
      fs.unlinkSync(tmpCsv);
    }
    const res = await request(app)
      .post('/api/hitl/resolve-gl-ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        stagedId: badStagedId,
        resolution: {
          action: 'apply_correction',
          correctedLines: [
            { account_code: '1500', debit: 5000, credit: 0 },
            { account_code: '1000', debit: 0, credit: 4000 },
          ],
        },
      });

    expect(res.status).toBe(422);
    expect(res.body?.error).toContain('imbalanced');
    expect(res.body?.totalDebits).toBe(5000);
    expect(res.body?.totalCredits).toBe(4000);
    expect(res.body?.imbalance).toBe(1000);
  });
});
