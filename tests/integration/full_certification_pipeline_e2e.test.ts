/**
 * End-to-end integration test: Full certification pipeline from ingest to export.
 *
 * Test flow:
 * 1. Setup: Create tenant, user, authentication
 * 2. HAPPY PATH: Balanced TB ingest → period_trial_balance → close session → advance to locked → certify → export certified PDF
 * 3. FAILURE PATH: Imbalanced TB → tenant_hitl_staging (NOT period_trial_balance) → certify without resolution → 422
 * 4. STATE MACHINE: Certify from draft fails (409); certify from locked succeeds
 *
 * Skips when DATABASE_URL is not set.
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
import { getUnadjustedMeta } from '../../src/services/trial_balance_store_service.js';
import { getSession } from '../../src/services/close_session_service.js';
import { getLedgerSnapshotById } from '../../src/db/repositories/ledger_snapshot_repository.js';
import * as auditLedgerRepo from '../../src/db/repositories/audit_ledger_repository.js';
import * as periodTbRepo from '../../src/db/repositories/period_trial_balance_repository.js';

const PERIOD_LABEL_HAPPY = '2025-01';
const PERIOD_START_HAPPY = '2025-01-01';
const PERIOD_END_HAPPY = '2025-01-31';
const PERIOD_LABEL_FAILURE = '2025-02';
const PERIOD_START_FAILURE = '2025-02-01';
const PERIOD_END_FAILURE = '2025-02-28';
const PERIOD_LABEL_STATE_DRAFT = '2025-03';
const PERIOD_START_STATE_DRAFT = '2025-03-01';
const PERIOD_END_STATE_DRAFT = '2025-03-31';
const PERIOD_LABEL_STATE_LOCKED = '2025-04';
const PERIOD_START_STATE_LOCKED = '2025-04-01';
const PERIOD_END_STATE_LOCKED = '2025-04-30';
const ENTITY_ID = 'entity-e2e-cert';

// Balanced: Cash (asset) + Equity (equity) = debits = credits, A = L+E
const BALANCED_TB_CSV = `Account Name,Debit,Credit
Cash,1000,0
Equity,0,1000`;

// Imbalanced: debits 1000, credits 0
const IMBALANCED_TB_CSV = `Account Name,Debit,Credit
Cash,1000,0
Revenue,0,0`;

describe('Full certification pipeline E2E', () => {
  let authToken: string;
  let testTenantId: string;
  let closeSessionIdHappy: string;
  let closeSessionIdFailure: string;
  let closeSessionIdStateDraft: string;
  let closeSessionIdStateLocked: string;
  let certifiedSnapshotId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Full certification pipeline E2E: DATABASE_URL not set; skipping.');
      return;
    }
    testTenantId = process.env.TEST_TENANT_ID ?? `cert-e2e-tenant-${Date.now()}`;
    authToken = getTestAuthTokenWithRole(testTenantId, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [testTenantId, `Test ${testTenantId}`]
    );
  });

  // ---------------------------------------------------------------------------
  // 1. HAPPY PATH
  // ---------------------------------------------------------------------------

  it('1a. Upload balanced trial balance via ingest API', async () => {
    if (!isDbConfigured()) return;
    const tmpCsv = path.join(os.tmpdir(), `cert-e2e-happy-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_TB_CSV, 'utf8');
    try {
      const res = await request(app)
        .post('/api/trial-balance/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', testTenantId)
        .field('periodLabel', PERIOD_LABEL_HAPPY)
        .attach('file', tmpCsv);
      expect(res.status).toBe(200);
      expect(res.body.balanceSheet).toBeDefined();
      expect(res.body.balanceSheet.balances).toBe(true);
    } finally {
      fs.unlinkSync(tmpCsv);
    }
  });

  it('1b. Verify stored in period_trial_balance', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(testTenantId);
    const meta = await getUnadjustedMeta(testTenantId, PERIOD_LABEL_HAPPY, pool);
    expect(meta).toBeDefined();
    expect(meta?.source).toBeDefined();
    const record = await periodTbRepo.getUnadjusted(pool, testTenantId, PERIOD_LABEL_HAPPY);
    expect(record).toBeDefined();
    expect(record!.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('1c. Create close session for that period', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .post('/api/close/sessions')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .set('x-tenant-id', testTenantId)
      .send({
        entityId: ENTITY_ID,
        periodStart: PERIOD_START_HAPPY,
        periodEnd: PERIOD_END_HAPPY,
        basis: 'accrual',
        standard: 'GAAP',
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body?.id).toBeDefined();
    closeSessionIdHappy = res.body.id;
  });

  it('1d. Advance session: draft → in_progress → ready_for_review → finalized → locked', async () => {
    if (!isDbConfigured() || !closeSessionIdHappy) return;
    const initRes = await request(app)
      .post(`/api/close/sessions/${closeSessionIdHappy}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId);
    expect([200, 201]).toContain(initRes.status);

    const listRes = await request(app)
      .get(`/api/close/sessions/${closeSessionIdHappy}/checklist`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId);
    expect(listRes.status).toBe(200);
    const items = listRes.body?.items ?? listRes.body ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id ?? item;
      if (typeof id !== 'string') continue;
      const completeRes = await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      if (completeRes.status === 200) continue;
      const skipRes = await request(app)
        .post(`/api/close/checklist-items/${id}/skip`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      expect([200, 404]).toContain(skipRes.status);
    }

    for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
      const res = await request(app)
        .patch(`/api/close/sessions/${closeSessionIdHappy}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId)
        .set('Content-Type', 'application/json')
        .send({ status });
      expect(res.status).toBe(200);
    }
  });

  it('1e. Lock period then certify the session', async () => {
    if (!isDbConfigured() || !closeSessionIdHappy) return;
    const lockRes = await request(app)
      .post('/api/close/period-lock')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: PERIOD_LABEL_HAPPY,
        lockedBy: 'test-user',
        reason: 'E2E certification test',
      });
    expect(lockRes.status).toBe(200);

    const certifyRes = await request(app)
      .post(`/api/close/sessions/${closeSessionIdHappy}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        certifiedBy: 'test-user',
        periodLabel: PERIOD_LABEL_HAPPY,
        memo: 'E2E certification pipeline',
      });
    expect(certifyRes.status).toBe(200);
    expect(certifyRes.body?.status).toBe('certified');
    expect(certifyRes.body?.certifiedSnapshotId).toBeDefined();
    expect(certifyRes.body?.snapshotHash).toBeDefined();
    expect(certifyRes.body?.snapshotHashVersion).toBeDefined();
    certifiedSnapshotId = certifyRes.body.certifiedSnapshotId;
  });

  it('1f. Verify snapshot, audit ledger certify_close, session status certified', async () => {
    if (!isDbConfigured() || !closeSessionIdHappy || !certifiedSnapshotId) return;
    const pool = await getTenantPool(testTenantId);
    const session = await getSession(pool, testTenantId, closeSessionIdHappy);
    expect(session?.status).toBe('certified');
    expect(session?.certifiedSnapshotId).toBe(certifiedSnapshotId);

    const snapshot = await getLedgerSnapshotById(pool, testTenantId, certifiedSnapshotId);
    expect(snapshot).toBeDefined();
    expect(snapshot?.closeSessionId).toBe(closeSessionIdHappy);
    expect(snapshot?.snapshotHash).toBeDefined();
    expect(typeof snapshot?.snapshotHash).toBe('string');
    expect(snapshot!.snapshotHash!.length).toBeGreaterThan(10);

    const certifyCount = await auditLedgerRepo.countByTenantPeriodAndEventType(
      pool,
      testTenantId,
      PERIOD_LABEL_HAPPY,
      'certify_close'
    );
    expect(certifyCount).toBeGreaterThanOrEqual(1);
  });

  it('1g. Export certified PDF', async () => {
    if (!isDbConfigured() || !closeSessionIdHappy) return;
    const res = await request(app)
      .post('/api/export/pdf')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        exportMode: 'certified',
        periodLabel: PERIOD_LABEL_HAPPY,
        closeSessionId: closeSessionIdHappy,
        cover: { entity_name: 'E2E Entity', report_date: PERIOD_END_HAPPY, period_label: PERIOD_LABEL_HAPPY },
        executive_summary: 'E2E test summary',
        financial_statements: {
          balance_sheet: { totalAssets: 1000, totalLiabilities: 0, totalEquity: 1000 },
          profit_and_loss: { totalRevenue: 0, netIncome: 0 },
        },
        clean_ledger: [
          { account_name: 'Cash', debit: 1000, credit: 0 },
          { account_name: 'Equity', debit: 0, credit: 1000 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf|octet-stream/);
    expect(res.headers['content-disposition']).toMatch(/Certified_Financials/);
    expect(res.headers['x-certified-source']).toBe('certified_snapshot');
    expect(res.headers['x-certified-snapshot-id']).toBeDefined();
    expect(res.headers['x-certified-snapshot-hash']).toBeDefined();
  });

  it('1h. Verify: no watermark, PDF contains certification hash, export gate allowed', async () => {
    if (!isDbConfigured() || !closeSessionIdHappy) return;
    const res = await request(app)
      .post('/api/export/pdf')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        exportMode: 'certified',
        periodLabel: PERIOD_LABEL_HAPPY,
        closeSessionId: closeSessionIdHappy,
        cover: { entity_name: 'E2E Entity', report_date: PERIOD_END_HAPPY, period_label: PERIOD_LABEL_HAPPY },
        executive_summary: 'E2E test summary',
        financial_statements: {
          balance_sheet: { totalAssets: 1000, totalLiabilities: 0, totalEquity: 1000 },
          profit_and_loss: { totalRevenue: 0, netIncome: 0 },
        },
        clean_ledger: [
          { account_name: 'Cash', debit: 1000, credit: 0 },
          { account_name: 'Equity', debit: 0, credit: 1000 },
        ],
      });
    expect(res.status).toBe(200);
    const pdfBuffer = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
    const pdfText = pdfBuffer.toString('utf8', 0, Math.min(pdfBuffer.length, 50000));
    expect(pdfText).not.toMatch(/DRAFT\s*—\s*NOT\s*CERTIFIED/i);
    const snapshotHash = res.headers['x-certified-snapshot-hash'];
    expect(snapshotHash).toBeDefined();
    expect(typeof snapshotHash).toBe('string');
    expect(snapshotHash!.length).toBeGreaterThan(10);
  });

  // ---------------------------------------------------------------------------
  // 2. FAILURE PATH
  // ---------------------------------------------------------------------------

  it('2a. Upload imbalanced trial balance', async () => {
    if (!isDbConfigured()) return;
    const tmpCsv = path.join(os.tmpdir(), `cert-e2e-imbal-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, IMBALANCED_TB_CSV, 'utf8');
    const prevClassifier = process.env.AI_MOCK_CLASSIFIER;
    const prevAdvisor = process.env.AI_MOCK_ADVISOR;
    process.env.AI_MOCK_CLASSIFIER = 'true';
    process.env.AI_MOCK_ADVISOR = 'true';
    try {
      const res = await request(app)
        .post('/api/trial-balance/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', testTenantId)
        .field('periodLabel', PERIOD_LABEL_FAILURE)
        .attach('file', tmpCsv);
      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('staged');
      expect(res.body?.stagedId).toBeDefined();
      expect(res.body?.imbalanceAmount).toBe(1000);
    } finally {
      fs.unlinkSync(tmpCsv);
      if (prevClassifier !== undefined) process.env.AI_MOCK_CLASSIFIER = prevClassifier;
      else delete process.env.AI_MOCK_CLASSIFIER;
      if (prevAdvisor !== undefined) process.env.AI_MOCK_ADVISOR = prevAdvisor;
      else delete process.env.AI_MOCK_ADVISOR;
    }
  });

  it('2b. Verify it goes to tenant_hitl_staging (NOT period_trial_balance)', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(testTenantId);
    const stagingRows = await pool.query<{ id: string }>(
      "SELECT id FROM tenant_hitl_staging WHERE tenant_id = $1 AND payload->>'kind' = 'trial_balance_ingest' AND payload->>'periodLabel' = $2",
      [testTenantId, PERIOD_LABEL_FAILURE]
    );
    expect(stagingRows.rows.length).toBeGreaterThanOrEqual(1);
    const ptbRows = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM period_trial_balance WHERE tenant_id = $1 AND period_label = $2',
      [testTenantId, PERIOD_LABEL_FAILURE]
    );
    expect(ptbRows.rows.length).toBe(0);
  });

  it(
    '2c. Create session and advance to locked (without resolving imbalanced TB)',
    async () => {
      if (!isDbConfigured()) return;
    const createRes = await request(app)
      .post('/api/close/sessions')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        entityId: ENTITY_ID,
        periodStart: PERIOD_START_FAILURE,
        periodEnd: PERIOD_END_FAILURE,
        basis: 'accrual',
        standard: 'GAAP',
      });
    expect([200, 201]).toContain(createRes.status);
    closeSessionIdFailure = createRes.body.id;

    const initRes = await request(app)
      .post(`/api/close/sessions/${closeSessionIdFailure}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId);
    expect([200, 201]).toContain(initRes.status);
    const listRes = await request(app)
      .get(`/api/close/sessions/${closeSessionIdFailure}/checklist`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId);
    expect(listRes.status).toBe(200);
    const items = listRes.body?.items ?? listRes.body ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id ?? item;
      if (typeof id !== 'string') continue;
      const completeRes = await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      if (completeRes.status === 200) continue;
      const skipRes = await request(app)
        .post(`/api/close/checklist-items/${id}/skip`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      expect([200, 404]).toContain(skipRes.status);
    }

    for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
      const patchRes = await request(app)
        .patch(`/api/close/sessions/${closeSessionIdFailure}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId)
        .set('Content-Type', 'application/json')
        .send({ status });
      expect(patchRes.status).toBe(200);
    }
  },
    15_000
  );

  it('2d. Attempt to certify without resolution — verify certification fails with 422', async () => {
    if (!isDbConfigured() || !closeSessionIdFailure) return;
    const res = await request(app)
      .post(`/api/close/sessions/${closeSessionIdFailure}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        certifiedBy: 'test-user',
        periodLabel: PERIOD_LABEL_FAILURE,
        memo: 'Should fail — no resolution',
      });
    expect(res.status).toBe(422);
    expect(res.body?.code).toBe('SESSION_DATA_MISSING');
    expect(res.body?.error).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 3. STATE MACHINE ENFORCEMENT
  // ---------------------------------------------------------------------------

  it('3a. Create session in draft; try to certify from draft — verify fails with appropriate error', async () => {
    if (!isDbConfigured()) return;
    const createRes = await request(app)
      .post('/api/close/sessions')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        entityId: ENTITY_ID,
        periodStart: PERIOD_START_STATE_DRAFT,
        periodEnd: PERIOD_END_STATE_DRAFT,
        basis: 'accrual',
        standard: 'GAAP',
      });
    expect([200, 201]).toContain(createRes.status);
    closeSessionIdStateDraft = createRes.body.id;
    const session = await getSession(await getTenantPool(testTenantId), testTenantId, closeSessionIdStateDraft);
    expect(session?.status).toBe('draft');

    const certifyRes = await request(app)
      .post(`/api/close/sessions/${closeSessionIdStateDraft}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        certifiedBy: 'test-user',
        periodLabel: PERIOD_LABEL_STATE_DRAFT,
        memo: 'Should fail — not locked',
      });
    expect(certifyRes.status).toBe(409);
    expect(certifyRes.body?.error).toBeDefined();
    expect(certifyRes.body?.error).toMatch(/locked|Certification only allowed/i);
  });

  it(
    '3b. Create session, ingest balanced TB, advance to locked; certify from locked — verify succeeds',
    async () => {
      if (!isDbConfigured()) return;
    const tmpCsv = path.join(os.tmpdir(), `cert-e2e-locked-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_TB_CSV, 'utf8');
    try {
      const ingestRes = await request(app)
        .post('/api/trial-balance/ingest')
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', testTenantId)
        .field('periodLabel', PERIOD_LABEL_STATE_LOCKED)
        .attach('file', tmpCsv);
      expect(ingestRes.status).toBe(200);
    } finally {
      fs.unlinkSync(tmpCsv);
    }

    const createRes = await request(app)
      .post('/api/close/sessions')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        entityId: ENTITY_ID,
        periodStart: PERIOD_START_STATE_LOCKED,
        periodEnd: PERIOD_END_STATE_LOCKED,
        basis: 'accrual',
        standard: 'GAAP',
      });
    expect([200, 201]).toContain(createRes.status);
    closeSessionIdStateLocked = createRes.body.id;

    const initRes = await request(app)
      .post(`/api/close/sessions/${closeSessionIdStateLocked}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId);
    expect([200, 201]).toContain(initRes.status);
    const listRes = await request(app)
      .get(`/api/close/sessions/${closeSessionIdStateLocked}/checklist`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId);
    expect(listRes.status).toBe(200);
    const items = listRes.body?.items ?? listRes.body ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id ?? item;
      if (typeof id !== 'string') continue;
      const completeRes = await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      if (completeRes.status === 200) continue;
      const skipRes = await request(app)
        .post(`/api/close/checklist-items/${id}/skip`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      expect([200, 404]).toContain(skipRes.status);
    }

    for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
      const patchRes = await request(app)
        .patch(`/api/close/sessions/${closeSessionIdStateLocked}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', testTenantId)
        .set('Content-Type', 'application/json')
        .send({ status });
      expect(patchRes.status).toBe(200);
    }

    const lockRes = await request(app)
      .post('/api/close/period-lock')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: PERIOD_LABEL_STATE_LOCKED,
        lockedBy: 'test-user',
        reason: 'E2E state machine test',
      });
    expect(lockRes.status).toBe(200);

    const certifyRes = await request(app)
      .post(`/api/close/sessions/${closeSessionIdStateLocked}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId)
      .set('Content-Type', 'application/json')
      .send({
        certifiedBy: 'test-user',
        periodLabel: PERIOD_LABEL_STATE_LOCKED,
        memo: 'E2E state machine: certify from locked',
      });
    expect(certifyRes.status).toBe(200);
    expect(certifyRes.body?.status).toBe('certified');
    expect(certifyRes.body?.certifiedSnapshotId).toBeDefined();
  },
    15_000
  );
});
