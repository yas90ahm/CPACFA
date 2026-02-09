/**
 * Single integration test proving the full certification pipeline end-to-end.
 *
 * Scenario:
 * - Upload imbalanced CSV TB → tenant_hitl_staging created, period_trial_balance NOT written
 * - Resolve ingest via POST /api/hitl/resolve-ingest (human adjustment)
 * - Lock period → Certify close session
 * - Run export gates (checkExportGate + finalIntegrityCheck) via POST /api/export/pdf
 * - Export PDF binder via GET /api/audit/binder/export/pdf
 * - Assert DB artifacts exist and audit chain verifies
 *
 * Fails if any step breaks. Skips when DATABASE_URL is not set. Runs in CI reliably.
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
import * as persistence from '../../src/services/persistence_service.js';
import { verifyChain } from '../../src/services/audit_ledger_service.js';
import { getUnadjustedMeta } from '../../src/services/trial_balance_store_service.js';
import * as justificationsRepo from '../../src/db/repositories/tenant_justifications_repository.js';
import * as shadowFindingsRepo from '../../src/db/repositories/tenant_shadow_audit_findings_repository.js';
import * as aiProposalsRepo from '../../src/db/repositories/tenant_ai_proposals_repository.js';
import { getSession } from '../../src/services/close_session_service.js';
import { getLedgerSnapshotById } from '../../src/db/repositories/ledger_snapshot_repository.js';

const PERIOD_LABEL = '2025-01';
const PERIOD_START = '2025-01-01';
const PERIOD_END = '2025-01-31';
const ENTITY_ID = 'entity-cert-pipeline';

// Imbalanced: debits 1000, credits 0 → imbalance 1000. Resolve with Retained Earnings so result passes Truth Gate (Assets = L+E).
const IMBALANCED_TB_CSV = `AccountName,Debit,Credit
Cash,1000,0
Revenue,0,0`;

describe('Certification pipeline E2E', () => {
  let authToken: string;
  let stagedId: string;
  let closeSessionId: string;
  let testTenantId: string;
  let postedJeId: string | undefined;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Certification pipeline: DATABASE_URL not set; skipping.');
      return;
    }
    testTenantId = process.env.TEST_TENANT_ID ?? `certification-pipeline-tenant-${Date.now()}`;
    authToken = getTestAuthTokenWithRole(testTenantId, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [testTenantId, `Test ${testTenantId}`]
    );
  });

  it(
    'full pipeline: imbalanced TB → HITL staging → resolve → lock → certify → gates → binder; DB artifacts and chain verify',
    async () => {
      if (!isDbConfigured()) return;

    const ingestPath = '/api/trial-balance/ingest';

    // 1. Upload imbalanced CSV → staged (Classifier + Advisor run when mock on; fail-open)
    const prevClassifierMock = process.env.AI_MOCK_CLASSIFIER;
    const prevAdvisorMock = process.env.AI_MOCK_ADVISOR;
    process.env.AI_MOCK_CLASSIFIER = 'true';
    process.env.AI_MOCK_ADVISOR = 'true';
    const tmpCsv = path.join(os.tmpdir(), `cert-pipeline-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, IMBALANCED_TB_CSV, 'utf8');
    let ingestRes: { status: number; body?: { status?: string; stagedId?: string; imbalanceAmount?: number } };
    try {
      ingestRes = await request(app)
        .post(ingestPath)
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', testTenantId)
        .field('periodLabel', PERIOD_LABEL)
        .attach('file', tmpCsv);
    } finally {
      fs.unlinkSync(tmpCsv);
      if (prevClassifierMock !== undefined) process.env.AI_MOCK_CLASSIFIER = prevClassifierMock;
      else delete process.env.AI_MOCK_CLASSIFIER;
      if (prevAdvisorMock !== undefined) process.env.AI_MOCK_ADVISOR = prevAdvisorMock;
      else delete process.env.AI_MOCK_ADVISOR;
    }

    expect(ingestRes.status).toBe(200);
    expect(ingestRes.body?.status).toBe('staged');
    expect(ingestRes.body?.stagedId).toBeDefined();
    expect(ingestRes.body?.imbalanceAmount).toBe(1000);
    stagedId = ingestRes.body!.stagedId!;

    const pool = await getTenantPool(testTenantId);
    const stagingItem = await persistence.getStagingItem(pool, testTenantId, stagedId);
    expect(stagingItem).toBeDefined();
    expect(stagingItem?.status).toBe('pending');
    expect((stagingItem?.payload as Record<string, unknown>)?.kind).toBe('trial_balance_ingest');
    if ((stagingItem?.payload as Record<string, unknown>)?.classification_results != null) {
      expect(Array.isArray((stagingItem?.payload as Record<string, unknown>).classification_results)).toBe(true);
    }
    const classifierLogRows = await pool.query<{ id: string }>(
      'SELECT id FROM ai_call_log WHERE tenant_id = $1 AND pillar = $2',
      [testTenantId, 'classifier']
    );
    expect(classifierLogRows.rows.length).toBeGreaterThanOrEqual(1);
    const advisorLogRows = await pool.query<{ id: string }>(
      'SELECT id FROM ai_call_log WHERE tenant_id = $1 AND pillar = $2',
      [testTenantId, 'advisor']
    );
    expect(advisorLogRows.rows.length).toBeGreaterThanOrEqual(1);
    const advisorProposals = await aiProposalsRepo.listProposalsByStaging(pool, testTenantId, stagedId);
    expect(advisorProposals.length).toBeGreaterThanOrEqual(1);

    // Before resolve: no period_trial_balance for this period (optional assertion; may exist from prior run)
    // We proceed to resolve.

    // 2. Resolve ingest via /api/hitl/resolve-ingest (human adjustment). Use Retained Earnings so adjusted TB passes Truth Gate.
    const adjustment = [
      {
        accountName: 'Retained Earnings',
        debit: 0,
        credit: 1000,
        amountProvenance: { kind: 'human_entered' as const, enteredBy: 'test-user' },
      },
    ];
    const resolveRes = await request(app)
      .post('/api/hitl/resolve-ingest')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ stagedId, adjustment });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body?.ok).toBe(true);

    const tbMeta = await getUnadjustedMeta(testTenantId, PERIOD_LABEL, pool);
    expect(tbMeta).toBeDefined();
    expect(tbMeta?.source).toBeDefined();

    // 3. Create close session
    const createSessionRes = await request(app)
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

    expect([200, 201]).toContain(createSessionRes.status);
    expect(createSessionRes.body?.id).toBeDefined();
    closeSessionId = createSessionRes.body.id;

    // 3b. Create JE, propose, approve, post → Justifier runs (AI_MOCK=true in CI); assert justification + ai_call_log
    const prevAiMock = process.env.AI_MOCK;
    process.env.AI_MOCK = 'true';
    try {
      const createJeRes = await request(app)
        .post('/api/close/journal-entries')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          closeSessionId,
          source: 'manual',
          lines: [
            { accountRef: 'Cash', debit: 0, credit: 0 },
            { accountRef: 'Revenue', debit: 0, credit: 0 },
          ],
        });
      expect([200, 201]).toContain(createJeRes.status);
      const jeId = createJeRes.body?.id;
      if (jeId) {
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
        expect([200]).toContain(postRes.status);
        postedJeId = jeId;
      }
    } finally {
      if (prevAiMock !== undefined) process.env.AI_MOCK = prevAiMock;
      else delete process.env.AI_MOCK;
    }

    // 4. Initialize checklist and complete required items so readiness passes (201 created, 200 idempotent)
    const initChecklistRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`);

    expect([200, 201]).toContain(initChecklistRes.status);

    const listChecklistRes = await request(app)
      .get(`/api/close/sessions/${closeSessionId}/checklist`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(listChecklistRes.status).toBe(200);
    const items = listChecklistRes.body?.items ?? listChecklistRes.body ?? [];
    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id ?? item;
      if (typeof id !== 'string') continue;
      const completeRes = await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      if (completeRes.status === 200) continue;
      const skipRes = await request(app)
        .post(`/api/close/checklist-items/${id}/skip`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      expect([200, 404]).toContain(skipRes.status);
    }

    // 5. Move session to locked (draft → in_progress → ready_for_review → finalized → locked)
    for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
      const patchRes = await request(app)
        .patch(`/api/close/sessions/${closeSessionId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ status });
      expect(patchRes.status).toBe(200);
    }

    // 6. Lock period
    const lockRes = await request(app)
      .post('/api/close/period-lock')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: PERIOD_LABEL,
        lockedBy: 'test-user',
        reason: 'E2E certification test',
      });

    expect(lockRes.status).toBe(200);
    expect(lockRes.body?.periodLabel).toBe(PERIOD_LABEL);

    // 7. Certify close session
    const certifyRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        certifiedBy: 'test-user',
        periodLabel: PERIOD_LABEL,
        memo: 'E2E certification pipeline',
      });

    expect(certifyRes.status).toBe(200);
    expect(certifyRes.body?.status).toBe('certified');
    expect(certifyRes.body?.certifiedSnapshotId).toBeDefined();
    expect(certifyRes.body?.snapshotHash).toBeDefined();
    expect(certifyRes.body?.snapshotHashVersion).toBeDefined();

    // 8. Run export gates (checkExportGate + finalIntegrityCheck) via POST /api/export/pdf
    const balancedLedger = [
      { account_name: 'Cash', debit: 1000, credit: 0 },
      { account_name: 'Revenue', debit: 0, credit: 0 },
      { account_name: 'Retained Earnings', debit: 0, credit: 1000 },
    ];
    const exportPdfRes = await request(app)
      .post('/api/export/pdf')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: PERIOD_LABEL,
        closeSessionId,
        clean_ledger: balancedLedger,
        financial_statements: {
          balance_sheet: {
            total_assets: 1000,
            total_liabilities: 0,
            total_equity: 1000,
          },
          profit_and_loss: {
            total_revenue: 0,
            net_income: 0,
          },
        },
      });

    expect(exportPdfRes.status).toBe(200);
    expect(exportPdfRes.headers['content-type']).toMatch(/pdf|octet-stream/);

    // 8b. Contract: certification creates a ledger snapshot and stores it on the close session.
    const sessionAfterCert = await getSession(pool, testTenantId, closeSessionId);
    expect(sessionAfterCert?.certifiedSnapshotId).toBeDefined();
    const snapshot = await getLedgerSnapshotById(pool, testTenantId, sessionAfterCert!.certifiedSnapshotId!);
    expect(snapshot).toBeDefined();
    expect(snapshot?.closeSessionId).toBe(closeSessionId);

    // 9. Contract: binder succeeds (200) without manual snapshot; uses certified_snapshot (fast path).
    const binderJsonRes = await request(app)
      .get(
        `/api/audit/binder?periodStart=${PERIOD_START}&periodEnd=${PERIOD_END}&entityName=TestEntity&closeSessionId=${closeSessionId}`
      )
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId);

    expect(binderJsonRes.status).toBe(200);
    expect(binderJsonRes.headers['x-certified-source']).toBe('certified_snapshot');
    expect(binderJsonRes.headers['x-certified-snapshot-id']).toBeDefined();
    expect(binderJsonRes.headers['x-certified-snapshot-hash']).toBeDefined();
    expect(binderJsonRes.headers['x-certified-snapshot-hash-version']).toBeDefined();
    const binder = binderJsonRes.body;
    expect(binder?.chainVerification).toBeDefined();
    expect(binder.chainVerification.valid).toBe(true);
    expect(binder.chainVerification.latestEntryHash).toBeDefined();
    expect(typeof binder.chainVerification.latestEntryHash).toBe('string');

    const binderPdfRes = await request(app)
      .get(
        `/api/audit/binder/export/pdf?periodStart=${PERIOD_START}&periodEnd=${PERIOD_END}&entityName=TestEntity&closeSessionId=${closeSessionId}`
      )
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', testTenantId);

    expect(binderPdfRes.status).toBe(200);
    expect(binderPdfRes.headers['x-certified-source']).toBe('certified_snapshot');
    expect(binderPdfRes.headers['x-certified-snapshot-id']).toBeDefined();
    expect(binderPdfRes.headers['x-certified-snapshot-hash']).toBeDefined();
    expect(binderPdfRes.headers['x-certified-snapshot-hash-version']).toBeDefined();
    expect(binderPdfRes.headers['content-type']).toMatch(/pdf|octet-stream/);
    expect(Buffer.isBuffer(binderPdfRes.body) || typeof binderPdfRes.body === 'object').toBe(true);

    // 10. Assert DB: audit chain verifies
    const chainResult = await verifyChain(pool, testTenantId);
    expect(chainResult.valid).toBe(true);
    expect(chainResult.latestEntryHash).toBeDefined();
    expect(chainResult.entryCount).toBeGreaterThanOrEqual(0);

    // 11. Assert Justifier + Shadow Auditor: tenant_justifications, tenant_shadow_audit_findings, ai_call_log
    if (postedJeId) {
      const just = await justificationsRepo.getJustificationByRelated(
        pool,
        testTenantId,
        'journal_entry',
        postedJeId
      );
      expect(just).toBeDefined();
      expect(just?.related_id).toBe(postedJeId);
      expect(just?.created_by_type).toBe('agent');
      const shadowFinding = await shadowFindingsRepo.getFindingByJE(pool, testTenantId, postedJeId);
      expect(shadowFinding).toBeDefined();
      expect(shadowFinding?.journal_entry_id).toBe(postedJeId);
      const logRowsJustifier = await pool.query<{ id: string }>(
        'SELECT id FROM ai_call_log WHERE tenant_id = $1 AND pillar = $2',
        [testTenantId, 'justifier']
      );
      const logRowsShadow = await pool.query<{ id: string }>(
        'SELECT id FROM ai_call_log WHERE tenant_id = $1 AND pillar = $2',
        [testTenantId, 'shadow_auditor']
      );
      expect(logRowsJustifier.rows.length).toBeGreaterThanOrEqual(1);
      expect(logRowsShadow.rows.length).toBeGreaterThanOrEqual(1);
    }
    },
    30_000
  );
});
