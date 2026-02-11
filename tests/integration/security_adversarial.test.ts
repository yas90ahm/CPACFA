/**
 * Adversarial security tests — protocol-grade abuse scenarios.
 * Covers: IDOR, tenant spoof, large JSON, MIME spoof, rate limit, race condition.
 * Source: security/ADVERSARIAL_TEST_MATRIX.md. No .md/.txt docs referenced in logic.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken, getTestAuthTokenWithRole } from '../helpers/testHelpers.js';
import {
  isDbConfigured,
  getTenantPool,
  queryControl,
} from '../../src/db/index.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import { createSnapshotFromTrialBalanceAndEntries } from '../../src/services/ledger_snapshot_service.js';
import { insertLedgerSnapshot } from '../../src/db/repositories/ledger_snapshot_repository.js';

const TENANT_A = 'sec-adv-tenant-a';
const TENANT_B = 'sec-adv-tenant-b';
const BALANCED_CSV = `AccountName,Debit,Credit
Cash,100,0
Revenue,0,100`;

describe('Security adversarial — IDOR cross-tenant verification', () => {
  let tokenA: string;
  let tokenB: string;
  let snapshotA: string;
  let snapshotB: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    tokenA = getTestAuthToken(TENANT_A);
    tokenB = getTestAuthToken(TENANT_B);
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL), ($3, $4, NULL) ON CONFLICT (id) DO NOTHING',
      [TENANT_A, `Test ${TENANT_A}`, TENANT_B, `Test ${TENANT_B}`]
    );
    const poolA = await getTenantPool(TENANT_A);
    const poolB = await getTenantPool(TENANT_B);
    const snapA = await insertLedgerSnapshot(poolA, {
      tenantId: TENANT_A,
      periodLabel: '2025-01',
      createdBy: 'test',
      source: 'close_session',
      snapshotPayloadJson: {
        trialBalance: {
          entries: [
            { accountName: 'Cash', debit: 100, credit: 0 },
            { accountName: 'Revenue', debit: 0, credit: 100 },
          ],
          totalDebits: 100,
          totalCredits: 100,
        },
      },
      snapshotHash: 'hash-a',
      hashVersion: 3,
    });
    const snapB = await insertLedgerSnapshot(poolB, {
      tenantId: TENANT_B,
      periodLabel: '2025-01',
      createdBy: 'test',
      source: 'close_session',
      snapshotPayloadJson: {
        trialBalance: {
          entries: [
            { accountName: 'Cash', debit: 200, credit: 0 },
            { accountName: 'Revenue', debit: 0, credit: 200 },
          ],
          totalDebits: 200,
          totalCredits: 200,
        },
      },
      snapshotHash: 'hash-b',
      hashVersion: 3,
    });
    snapshotA = snapA.id;
    snapshotB = snapB.id;
  });

  it('1) IDOR: tenant A with token A cannot access tenant B snapshot via verification endpoint', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .get(`/api/verification/snapshots/${snapshotB}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
    expect(res.body?.code).toBe('NOT_FOUND');
    expect(res.body?.snapshot).toBeUndefined();
  });

  it('2) IDOR: tenant A with token A cannot access tenant B snapshot via evidence-manifest', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .get(`/api/verification/evidence-manifest/${snapshotB}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
    expect(res.body?.code).toBe('NOT_FOUND');
  });

  it('3) IDOR: binder export with cross-tenant closeSessionId returns 403 or 404', async () => {
    if (!isDbConfigured()) return;
    // Use unique period + entity to avoid exclusion constraint (2035 to avoid any collision)
    const ts = Date.now();
    const periodStart = '2035-01-01';
    const periodEnd = '2035-01-31';
    const poolB = await getTenantPool(TENANT_B);
    const sessB = await closeSessionRepo.insertCloseSession(
      poolB,
      `sess-b-idor-${ts}`,
      TENANT_B,
      `entity-b-idor-${ts}`,
      periodStart,
      periodEnd,
      'accrual',
      'GAAP',
      'certified'
    );
    const snap = await createSnapshotFromTrialBalanceAndEntries(poolB, {
      tenantId: TENANT_B,
      periodLabel: '2035-01',
      closeSessionId: sessB.id,
      createdBy: 'test',
      source: 'close_session',
      trialBalance: {
        entries: [
          { accountName: 'Cash', debit: 200, credit: 0 },
          { accountName: 'Revenue', debit: 0, credit: 200 },
        ],
        totalDebits: 200,
        totalCredits: 200,
      },
    });
    await closeSessionRepo.updateCertification(
      poolB,
      TENANT_B,
      sessB.id,
      'test@test.com',
      new Date().toISOString(),
      'Setup',
      snap.id
    );

    const res = await request(app)
      .get('/api/audit/binder/export/pdf')
      .set('Authorization', `Bearer ${tokenA}`)
      .query({
        closeSessionId: sessB.id,
        periodStart,
        periodEnd,
      });
    expect([403, 404]).toContain(res.status);
    if (res.status === 403) {
      expect(res.body?.code).toBeDefined();
    }
  });
});

describe('Security adversarial — tenant spoof body injection', () => {
  beforeAll(async () => {
    if (!isDbConfigured()) return;
    // Warm up app and connection pool to avoid ECONNRESET
    await request(app).get('/health').catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
  });

  it('4) Tenant spoof: body tenantId is NOT used when MODE=demo', async () => {
    if (!isDbConfigured()) return;
    if (process.env.MODE === 'prod') return;

    const ingestPath = '/api/trial-balance/ingest';
    const tmpCsv = path.join(os.tmpdir(), `tenant-spoof-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_CSV, 'utf8');

    const { resetModeCache } = await import('../../src/lib/runtime_mode.js');
    const prevMode = process.env.MODE;
    process.env.MODE = 'demo';
    resetModeCache();
    try {
      const res = await request(app)
        .post(ingestPath)
        .field('tenantId', 'injected-tenant-from-body')
        .field('periodLabel', '2025-01')
        .attach('file', tmpCsv);
      expect([400, 503]).toContain(res.status);
      expect(res.body?.error).toBeDefined();
    } finally {
      fs.unlinkSync(tmpCsv);
      if (prevMode !== undefined) process.env.MODE = prevMode;
      else delete process.env.MODE;
      resetModeCache();
    }
  });

  it('5) Tenant spoof: body tenantId is NOT used when REQUIRE_TENANT_CONTEXT=true', async () => {
    if (!isDbConfigured()) return;
    if (process.env.MODE === 'prod') return;

    const ingestPath = '/api/trial-balance/ingest';
    const tmpCsv = path.join(os.tmpdir(), `tenant-spoof-rtc-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_CSV, 'utf8');

    const prev = process.env.REQUIRE_TENANT_CONTEXT;
    process.env.REQUIRE_TENANT_CONTEXT = 'true';
    try {
      const res = await request(app)
        .post(ingestPath)
        .field('tenantId', 'injected-tenant-from-body')
        .field('periodLabel', '2025-01')
        .attach('file', tmpCsv);
      expect([400, 503]).toContain(res.status);
      expect(res.body?.error).toBeDefined();
    } finally {
      fs.unlinkSync(tmpCsv);
      if (prev !== undefined) process.env.REQUIRE_TENANT_CONTEXT = prev;
      else delete process.env.REQUIRE_TENANT_CONTEXT;
    }
  });
});

describe('Security adversarial — large JSON payload', () => {
  it('6) Large JSON: precheck board-ready rejects or fails when body > 1MB', async () => {
    const token = getTestAuthToken(TENANT_A);
    const bigObj = { accountName: 'X', debit: 0, credit: 0 };
    const trialBalance = Array.from({ length: 100_000 }, () => ({ ...bigObj }));
    const body = JSON.stringify({ periodLabel: '2025-01', trialBalance });
    expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(1_000_000);

    const res = await request(app)
      .post('/api/precheck/board-ready')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(body);

    expect([413, 400, 500]).toContain(res.status);
    if (res.status === 413) {
      expect(res.body?.error).toBeDefined();
    }
  });
});

describe('Security adversarial — file upload MIME spoof', () => {
  it('7) MIME spoof: ingestion agent rejects non-allowed MIME', async () => {
    const token = getTestAuthToken(TENANT_A);
    const exeContent = Buffer.from('MZ'); // Minimal exe-like header
    const res = await request(app)
      .post('/api/ingestion/agent')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', exeContent, { filename: 'malicious.exe', contentType: 'application/x-msdownload' });

    expect([400, 500]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it('8) MIME spoof: JE attachment rejects non-whitelisted MIME when whitelist enabled', async () => {
    if (!isDbConfigured()) return;
    const token = getTestAuthTokenWithRole(TENANT_A, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TENANT_A, `Test ${TENANT_A}`]
    );

    const pool = await getTenantPool(TENANT_A);
    const sessRes = await request(app)
      .post('/api/close/sessions')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send({
        entityId: 'e1',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        basis: 'accrual',
        standard: 'GAAP',
      });
    if (sessRes.status !== 200 && sessRes.status !== 201) return;
    const sessionId = sessRes.body?.id;

    const jeRes = await request(app)
      .post('/api/close/journal-entries')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send({
        closeSessionId: sessionId,
        source: 'manual',
        lines: [
          { accountRef: 'Cash', debit: 0, credit: 0 },
          { accountRef: 'Revenue', debit: 0, credit: 0 },
        ],
      });
    if (jeRes.status !== 200 && jeRes.status !== 201) return;
    const jeId = jeRes.body?.id;

    const exeContent = Buffer.from('MZ');
    const res = await request(app)
      .post(`/api/close/journal-entries/${jeId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', exeContent, { filename: 'malicious.exe', contentType: 'application/x-msdownload' });

    expect([400, 500]).toContain(res.status);
    expect(res.status).not.toBe(201);
  });
});

describe('Security adversarial — rate limit', () => {
  it(
    '9) Rate limit: verification endpoints return 429 when exceeding apiLimiter',
    async () => {
      const token = getTestAuthToken(TENANT_A);
      const threshold = 201;

      let lastStatus = 0;
      for (let i = 0; i < threshold; i++) {
        const res = await request(app)
          .get('/api/verification/audit-chain')
          .set('Authorization', `Bearer ${token}`);
        lastStatus = res.status;
        if (res.status === 429) break;
      }
      expect(lastStatus).toBe(429);
    },
    30000
  );
});

describe('Security adversarial — concurrent certify race', () => {
  let authToken: string;
  let closeSessionId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    await request(app).get('/health').catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
    authToken = getTestAuthTokenWithRole(TENANT_A, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TENANT_A, `Test ${TENANT_A}`]
    );

    const ingestPath = '/api/trial-balance/ingest';
    const tmpCsv = path.join(os.tmpdir(), `race-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_CSV, 'utf8');
    try {
      const ingestRes = await request(app)
        .post(ingestPath)
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', TENANT_A)
        .field('periodLabel', '2025-01')
        .attach('file', tmpCsv);
      if (ingestRes.body?.status === 'staged' && ingestRes.body?.stagedId) {
        await request(app)
          .post('/api/hitl/resolve-ingest')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({
            stagedId: ingestRes.body.stagedId,
            adjustment: [
              {
                accountName: 'Revenue',
                debit: 0,
                credit: 0,
                amountProvenance: { kind: 'human_entered', enteredBy: 'test' },
              },
            ],
          });
      }
    } finally {
      try {
        fs.unlinkSync(tmpCsv);
      } catch {}
    }

    const ensureRes = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ entityId: 'race-entity', periodLabel: '2025-01' });
    if (ensureRes.status !== 200 && ensureRes.status !== 201) return;
    closeSessionId = ensureRes.body?.closeSessionId;

    const initRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/checklist/initialize`)
      .set('Authorization', `Bearer ${authToken}`);
    if (initRes.status !== 200 && initRes.status !== 201) return;

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
    }

    const advanceRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json');
    if (advanceRes.status !== 200 || advanceRes.body?.statusAfter !== 'locked') {
      closeSessionId = '';
    }
  }, 25_000);

  it(
    '10) Race: two concurrent advance (certify) calls yield at most one certified',
    async () => {
      if (!isDbConfigured() || !closeSessionId) return;

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/close/sessions/${closeSessionId}/advance`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({ certifiedBy: 'race-test-1' }),
        request(app)
          .post(`/api/close/sessions/${closeSessionId}/advance`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({ certifiedBy: 'race-test-2' }),
      ]);

      const certified1 = res1.body?.actionTaken === 'certified';
      const certified2 = res2.body?.actionTaken === 'certified';
      expect(certified1 || certified2).toBe(true);
      expect(certified1 && certified2).toBe(false);
    },
    15000
  );
});

describe('Security adversarial — concurrent certify (row-level lock)', () => {
  let authToken: string;
  let closeSessionId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    await request(app).get('/health').catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
    authToken = getTestAuthTokenWithRole(TENANT_A, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TENANT_A, `Test ${TENANT_A}`]
    );
    const ingestPath = '/api/trial-balance/ingest';
    const tmpCsv = path.join(os.tmpdir(), `certify-race-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_CSV, 'utf8');
    try {
      const ingestRes = await request(app)
        .post(ingestPath)
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', TENANT_A)
        .field('periodLabel', '2025-06')
        .attach('file', tmpCsv);
      if (ingestRes.body?.status === 'staged' && ingestRes.body?.stagedId) {
        await request(app)
          .post('/api/hitl/resolve-ingest')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({
            stagedId: ingestRes.body.stagedId,
            adjustment: [
              {
                accountName: 'Revenue',
                debit: 0,
                credit: 0,
                amountProvenance: { kind: 'human_entered', enteredBy: 'test' },
              },
            ],
          });
      }
    } finally {
      try {
        fs.unlinkSync(tmpCsv);
      } catch {}
    }
    const ensureRes = await request(app)
      .post('/api/close/sessions/ensure')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ entityId: 'certify-race-entity', periodLabel: '2025-06' });
    if (ensureRes.status !== 200 && ensureRes.status !== 201) return;
    closeSessionId = ensureRes.body?.closeSessionId;
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
    }
    const advanceRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json');
    if (advanceRes.status !== 200 || advanceRes.body?.statusAfter !== 'locked') {
      closeSessionId = '';
    }
  }, 25_000);

  it('Two concurrent certify calls yield exactly one 200 and one 409', async () => {
    if (!isDbConfigured() || !closeSessionId) return;
    const periodLabel = '2025-06';
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/close/sessions/${closeSessionId}/certify`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ certifiedBy: 'certify-race-1', periodLabel }),
      request(app)
        .post(`/api/close/sessions/${closeSessionId}/certify`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ certifiedBy: 'certify-race-2', periodLabel }),
    ]);
    const okCount = [res1.status, res2.status].filter((s) => s === 200).length;
    const conflictCount = [res1.status, res2.status].filter((s) => s === 409).length;
    expect(okCount).toBe(1);
    expect(conflictCount).toBe(1);
  }, 15000);
});
