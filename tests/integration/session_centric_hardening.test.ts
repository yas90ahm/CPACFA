/**
 * Session-centric flow hardening: integration tests.
 *
 * A) Certify without anchored TB → 422 SESSION_DATA_MISSING
 * B) Export without session snapshot → blocked (422 NO_CERTIFIED_SOURCE)
 * C) Happy path: ingest bound to session → advance → certify → export succeeds (covered by certification_pipeline.test.ts)
 *
 * Legacy trust path hardening:
 * B2) Binder default strict: no snapshot, no allowLegacy → 422 NO_CERTIFIED_SOURCE
 * B3) Binder explicit legacy: allowLegacyCertifiedSource=1 + registered statements → 200 + headers
 * B4) Audit ledger: legacy call records LEGACY_CERTIFIED_SOURCE_USED
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import {
  isDbConfigured,
  getTenantPool,
  queryControl,
} from '../../src/db/index.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import { upsertPeriodExportChecks } from '../../src/db/repositories/period_export_checks_repository.js';
import { initializeChecklistTemplate } from '../../src/services/close_checklist_readiness_service.js';
import * as itemRepo from '../../src/db/repositories/close_checklist_item_repository.js';

const TEST_TENANT_ID =
  process.env.TEST_TENANT_ID ?? `session-centric-hardening-${Date.now()}`;
const PERIOD_LABEL = '2030-01'; // Use future period to avoid collision with other tests
const PERIOD_START = '2030-01-01';
const PERIOD_END = '2030-01-31';
const ENTITY_ID = 'entity-session-centric';

describe('Session-centric hardening', () => {
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Session-centric hardening: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  it('A) Certify without anchored TB returns 422 SESSION_DATA_MISSING', async () => {
    if (!isDbConfigured()) return;

    const pool = await getTenantPool(TEST_TENANT_ID);
    // Ensure no period_trial_balance for this period (delete if present from prior run)
    await pool.query(
      'DELETE FROM period_trial_balance WHERE tenant_id = $1 AND period_label = $2',
      [TEST_TENANT_ID, PERIOD_LABEL]
    );

    // Create close session
    const createRes = await request(app)
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
    expect([200, 201]).toContain(createRes.status);
    const closeSessionId = createRes.body?.id;
    expect(closeSessionId).toBeDefined();

    // Initialize checklist and complete/skip items so readiness passes before finalized/locked
    await request(app)
      .post(`/api/close/sessions/${closeSessionId}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`);

    const listRes = await request(app)
      .get(`/api/close/sessions/${closeSessionId}/checklist`)
      .set('Authorization', `Bearer ${authToken}`);
    const items = listRes.body?.items ?? listRes.body ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id ?? item;
      if (typeof id !== 'string') continue;
      await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      await request(app)
        .post(`/api/close/checklist-items/${id}/skip`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
    }

    // Advance to locked (draft → in_progress → ready_for_review → finalized → locked)
    for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
      const patchRes = await request(app)
        .patch(`/api/close/sessions/${closeSessionId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ status });
      expect(patchRes.status).toBe(200);
    }

    // Lock period
    const lockRes = await request(app)
      .post('/api/close/period-lock')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: PERIOD_LABEL,
        lockedBy: 'test-user',
        reason: 'Session-centric hardening test',
      });
    expect(lockRes.status).toBe(200);

    // Attempt certify — no TB for period → expect 422 SESSION_DATA_MISSING
    const certifyRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        certifiedBy: 'test-user',
        periodLabel: PERIOD_LABEL,
        memo: 'Session-centric hardening',
      });

    expect(certifyRes.status).toBe(422);
    expect(certifyRes.body?.code).toBe('SESSION_DATA_MISSING');
    expect(certifyRes.body?.error).toMatch(/trial balance|anchored|session/);
  }, 15000);

  it('B) Binder without session snapshot returns 422 NO_CERTIFIED_SOURCE', async () => {
    if (!isDbConfigured()) return;

    const pool = await getTenantPool(TEST_TENANT_ID);
    // Create certified session without snapshot (status=certified, certified_snapshot_id=null)
    const sessionId = `sess-no-snapshot-${Date.now()}`;
    await closeSessionRepo.insertCloseSession(
      pool,
      sessionId,
      TEST_TENANT_ID,
      ENTITY_ID,
      '2030-02-01',
      '2030-02-28',
      'accrual',
      'GAAP',
      'certified'
    );
    // Ensure certified_snapshot_id stays null (insert does not set it)
    const sess = await closeSessionRepo.getCloseSessionById(pool, TEST_TENANT_ID, sessionId);
    expect(sess?.status).toBe('certified');
    expect(sess?.certifiedSnapshotId).toBeUndefined();

    // Satisfy export gate: period_export_checks must exist (materiality from DB)
    await upsertPeriodExportChecks(pool, TEST_TENANT_ID, '2030-02', {
      roundingGapExceedsMateriality: false,
      aggregateRoundingExceedsMateriality: false,
    });

    // Attempt binder — no snapshot, no allowLegacy → expect 422 NO_CERTIFIED_SOURCE
    const res = await request(app)
      .get(
        `/api/audit/binder?periodStart=2030-02-01&periodEnd=2030-02-28&closeSessionId=${sessionId}`
      )
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);

    expect(res.status).toBe(422);
    expect(res.body?.code).toBe('NO_CERTIFIED_SOURCE');
  });

  it('B2) Export PDF without session snapshot returns 422 NO_CERTIFIED_SOURCE', async () => {
    if (!isDbConfigured()) return;

    const pool = await getTenantPool(TEST_TENANT_ID);
    const sessionId = `sess-export-no-snap-${Date.now()}`;
    await closeSessionRepo.insertCloseSession(
      pool,
      sessionId,
      TEST_TENANT_ID,
      ENTITY_ID,
      '2030-03-01',
      '2030-03-31',
      'accrual',
      'GAAP',
      'certified'
    );
    // Init checklist and complete items so export readiness passes
    await initializeChecklistTemplate(pool, TEST_TENANT_ID, sessionId);
    const items = await itemRepo.listChecklistItemsBySessionId(pool, TEST_TENANT_ID, sessionId);
    for (const item of items) {
      await itemRepo.updateChecklistItemStatus(pool, TEST_TENANT_ID, item.id, 'completed', { completedBy: 'test-user' });
    }

    // Satisfy export gate: period_export_checks must exist
    await upsertPeriodExportChecks(pool, TEST_TENANT_ID, '2030-03', {
      roundingGapExceedsMateriality: false,
      aggregateRoundingExceedsMateriality: false,
    });

    const res = await request(app)
      .post('/api/export/pdf')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .set('x-tenant-id', TEST_TENANT_ID)
      .send({
        exportMode: 'certified',
        periodLabel: '2030-03',
        closeSessionId: sessionId,
        cover: { entity_name: 'E', report_date: '2030-03-31', period_label: '2030-03' },
        executive_summary: 'Summary',
        financial_statements: {},
        clean_ledger: [
          { account_name: 'A', debit: 100, credit: 0 },
          { account_name: 'B', debit: 0, credit: 100 },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body?.code).toBe('NO_CERTIFIED_SOURCE');
  });

  it('B3) Binder with allowLegacyCertifiedSource=1 returns 200 and legacy headers when statements registered', async () => {
    if (!isDbConfigured()) return;

    const pool = await getTenantPool(TEST_TENANT_ID);
    const sessionId = `sess-legacy-${Date.now()}`;
    await closeSessionRepo.insertCloseSession(
      pool,
      sessionId,
      TEST_TENANT_ID,
      ENTITY_ID,
      '2030-04-01',
      '2030-04-30',
      'accrual',
      'GAAP',
      'certified'
    );

    // Register balanced statements (legacy source)
    const regRes = await request(app)
      .post('/api/audit/register-statements')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .set('x-tenant-id', TEST_TENANT_ID)
      .send({
        statements: {
          trialBalance: {
            entries: [
              { accountName: 'Cash', debit: 100, credit: 0 },
              { accountName: 'Retained Earnings', debit: 0, credit: 100 },
            ],
            totalDebits: 100,
            totalCredits: 100,
          },
          balanceSheet: {
            reportDate: '2030-04-30',
            totalAssets: 100,
            totalLiabilities: 50,
            totalEquity: 50,
            assets: [],
            liabilities: [],
            equity: [],
            balances: true,
            codificationRef: { framework: 'FASB', citation: 'ASC 210-10-45' },
          },
          profitAndLoss: {
            reportDate: '2030-04-30',
            revenue: [],
            expenses: [],
            totalRevenue: 0,
            totalExpenses: 0,
            netIncome: 0,
            codificationRef: { framework: 'FASB', citation: 'ASC 220-10-45' },
          },
        },
      }    );
    expect(regRes.status).toBe(200);

    // Satisfy export gate: period_export_checks must exist
    await upsertPeriodExportChecks(pool, TEST_TENANT_ID, '2030-04', {
      roundingGapExceedsMateriality: false,
      aggregateRoundingExceedsMateriality: false,
    });

    const res = await request(app)
      .get(
        `/api/audit/binder?periodStart=2030-04-01&periodEnd=2030-04-30&closeSessionId=${sessionId}&allowLegacyCertifiedSource=1`
      )
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);

    expect(res.status).toBe(200);
    expect(res.headers['x-certified-source']).toBe('legacy');
    expect(res.headers['x-legacy-certified-source']).toBe('true');
  });

  it('B4) Legacy binder call records LEGACY_CERTIFIED_SOURCE_USED in audit ledger', async () => {
    if (!isDbConfigured()) return;

    const pool = await getTenantPool(TEST_TENANT_ID);
    const sessionId = `sess-audit-legacy-${Date.now()}`;
    await closeSessionRepo.insertCloseSession(
      pool,
      sessionId,
      TEST_TENANT_ID,
      ENTITY_ID,
      '2030-05-01',
      '2030-05-31',
      'accrual',
      'GAAP',
      'certified'
    );

    await request(app)
      .post('/api/audit/register-statements')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .set('x-tenant-id', TEST_TENANT_ID)
      .send({
        statements: {
          trialBalance: {
            entries: [
              { accountName: 'Cash', debit: 200, credit: 0 },
              { accountName: 'Retained Earnings', debit: 0, credit: 200 },
            ],
            totalDebits: 200,
            totalCredits: 200,
          },
          balanceSheet: {
            reportDate: '2030-05-31',
            totalAssets: 200,
            totalLiabilities: 100,
            totalEquity: 100,
            assets: [],
            liabilities: [],
            equity: [],
            balances: true,
            codificationRef: { framework: 'FASB', citation: 'ASC 210-10-45' },
          },
          profitAndLoss: {
            reportDate: '2030-05-31',
            revenue: [],
            expenses: [],
            totalRevenue: 0,
            totalExpenses: 0,
            netIncome: 0,
            codificationRef: { framework: 'FASB', citation: 'ASC 220-10-45' },
          },
        },
      });

    // Satisfy export gate: period_export_checks must exist
    await upsertPeriodExportChecks(pool, TEST_TENANT_ID, '2030-05', {
      roundingGapExceedsMateriality: false,
      aggregateRoundingExceedsMateriality: false,
    });

    await request(app)
      .get(
        `/api/audit/binder?periodStart=2030-05-01&periodEnd=2030-05-31&closeSessionId=${sessionId}&allowLegacyCertifiedSource=1`
      )
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);

    const r = await pool.query<{ event_type: string; deterministic_flag_snapshot: unknown }>(
      `SELECT event_type, deterministic_flag_snapshot FROM audit_ledger
       WHERE tenant_id = $1 AND event_type = 'legacy_certified_source_used'
       AND deterministic_flag_snapshot->>'closeSessionId' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [TEST_TENANT_ID, sessionId]
    );
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows[0].event_type).toBe('legacy_certified_source_used');
    const snap = r.rows[0].deterministic_flag_snapshot as Record<string, unknown>;
    expect(snap?.closeSessionId).toBe(sessionId);
    expect(snap?.resolvedSource).toBe('legacy');
  });

  it('D) Advance through all states: audit ledger has entry for every transition', async () => {
    if (!isDbConfigured()) return;

    const pool = await getTenantPool(TEST_TENANT_ID);
    const periodLabel = '2030-06';
    const periodStart = '2030-06-01';
    const periodEnd = '2030-06-30';

    const createRes = await request(app)
      .post('/api/close/sessions')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        entityId: ENTITY_ID,
        periodStart,
        periodEnd,
        basis: 'accrual',
        standard: 'GAAP',
      });
    expect([200, 201]).toContain(createRes.status);
    const closeSessionId = createRes.body?.id;
    expect(closeSessionId).toBeDefined();

    await request(app)
      .post(`/api/close/sessions/${closeSessionId}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`);

    const listRes = await request(app)
      .get(`/api/close/sessions/${closeSessionId}/checklist`)
      .set('Authorization', `Bearer ${authToken}`);
    const items = listRes.body?.items ?? listRes.body ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id ?? item;
      if (typeof id !== 'string') continue;
      await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      await request(app)
        .post(`/api/close/checklist-items/${id}/skip`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
    }

    // Advance via PATCH: draft → in_progress → ready_for_review → finalized → locked
    for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
      const patchRes = await request(app)
        .patch(`/api/close/sessions/${closeSessionId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ status });
      expect(patchRes.status).toBe(200);
    }

    // Query audit ledger: close_session_transition events for this session
    const transitionRows = await pool.query<{ event_type: string; deterministic_flag_snapshot: unknown }>(
      `SELECT event_type, deterministic_flag_snapshot FROM audit_ledger
       WHERE tenant_id = $1 AND event_type = 'close_session_transition'
       AND deterministic_flag_snapshot->>'sessionId' = $2
       ORDER BY created_at`,
      [TEST_TENANT_ID, closeSessionId]
    );

    // Expect 4 transitions: draft→in_progress, in_progress→ready_for_review, ready_for_review→finalized, finalized→locked
    expect(transitionRows.rows.length).toBe(4);
    const fromTo = transitionRows.rows.map(
      (r) => (r.deterministic_flag_snapshot as Record<string, unknown>)?.from + '→' + (r.deterministic_flag_snapshot as Record<string, unknown>)?.to
    );
    expect(fromTo).toContain('draft→in_progress');
    expect(fromTo).toContain('in_progress→ready_for_review');
    expect(fromTo).toContain('ready_for_review→finalized');
    expect(fromTo).toContain('finalized→locked');
  }, 20000);
});
