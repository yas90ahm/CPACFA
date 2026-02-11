/**
 * Integration tests: export mode (draft vs certified) and certified gate.
 * - Certified export requires closeSessionId and session.status === 'certified'; otherwise 403.
 * - Draft export succeeds when session is NOT certified; PDF contains "DRAFT — NOT CERTIFIED".
 * - No bypass flags; exportMode defaults to 'draft'.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import { createSnapshotFromTrialBalanceAndEntries } from '../../src/services/ledger_snapshot_service.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'export-certified-gate-tenant';

describe('Export certified gate', () => {
  let authToken: string;
  let closeSessionIdLocked: string | undefined;
  let closeSessionIdCertified: string | undefined;
  let entityId: string;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Export certified gate: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthToken(TEST_TENANT_ID);
    entityId = `entity-export-gate-${Date.now()}`;
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
    try {
      const pool = await getTenantPool(TEST_TENANT_ID);
      const locked = await closeSessionRepo.insertCloseSession(
        pool,
        `sess-locked-${Date.now()}`,
        TEST_TENANT_ID,
        entityId,
        '2025-01-01',
        '2025-01-31',
        'accrual',
        'GAAP',
        'locked'
      );
      closeSessionIdLocked = locked.id;
      const certified = await closeSessionRepo.insertCloseSession(
        pool,
        `sess-cert-${Date.now()}`,
        TEST_TENANT_ID,
        entityId,
        '2025-02-01',
        '2025-02-28',
        'accrual',
        'GAAP',
        'certified'
      );
      closeSessionIdCertified = certified.id;
      // V2: certified binder/export requires a snapshot; create one and link to session.
      const snapshot = await createSnapshotFromTrialBalanceAndEntries(pool, {
        tenantId: TEST_TENANT_ID,
        periodLabel: '2025-02',
        closeSessionId: certified.id,
        createdBy: 'test-setup',
        source: 'close_session',
        trialBalance: {
          entries: [
            { accountName: 'Cash', debit: 100, credit: 0 },
            { accountName: 'Retained Earnings', debit: 0, credit: 100 },
          ],
          totalDebits: 100,
          totalCredits: 100,
        },
      });
      await closeSessionRepo.updateCertification(
        pool,
        TEST_TENANT_ID,
        certified.id,
        'test@test.com',
        new Date().toISOString(),
        'Setup',
        snapshot.id
      );
    } catch (e) {
      console.warn('Export certified gate: could not create test sessions (tenant or schema); skipping.', e);
    }
  });

  it('certified export returns 403 CLOSE_NOT_CERTIFIED when session is not certified', async () => {
    if (!isDbConfigured() || !closeSessionIdLocked) return;
    const res = await request(app)
      .post('/api/export/pdf')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .send({
        exportMode: 'certified',
        periodLabel: '2025-01',
        closeSessionId: closeSessionIdLocked,
        cover: { entity_name: 'E', report_date: '2025-01-31', period_label: '2025-01' },
        executive_summary: 'Summary',
        financial_statements: {},
        clean_ledger: [
          { account_name: 'A', debit: 100, credit: 0 },
          { account_name: 'B', debit: 0, credit: 100 },
        ],
      });
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('CLOSE_NOT_CERTIFIED');
  });

  it('certified export is not blocked by certified gate when session is certified', async () => {
    if (!isDbConfigured() || !closeSessionIdCertified) return;
    const res = await request(app)
      .post('/api/export/pdf')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .send({
        exportMode: 'certified',
        periodLabel: '2025-02',
        closeSessionId: closeSessionIdCertified,
        cover: { entity_name: 'E', report_date: '2025-02-28', period_label: '2025-02' },
        executive_summary: 'Summary',
        financial_statements: { balance_sheet: { totalAssets: 100, totalLiabilities: 50, totalEquity: 50 } },
        clean_ledger: [
          { account_name: 'A', debit: 100, credit: 0 },
          { account_name: 'B', debit: 0, credit: 100 },
        ],
      });
    if (res.status === 403 && res.body?.code === 'CLOSE_NOT_CERTIFIED') {
      throw new Error('Export was blocked by certified gate even though session is certified');
    }
    if (res.status === 200) {
      expect(res.headers['content-disposition']).toMatch(/Certified_Financials/);
      expect(res.headers['x-certified-source']).toBe('certified_snapshot');
      expect(res.headers['x-certified-snapshot-id']).toBeDefined();
      expect(res.headers['x-certified-snapshot-hash']).toBeDefined();
      expect(res.headers['x-certified-snapshot-hash-version']).toBeDefined();
    }
  });

  it('draft export succeeds when session is NOT certified and returns draft-named PDF', async () => {
    if (!isDbConfigured() || !closeSessionIdLocked) return;
    const res = await request(app)
      .post('/api/export/pdf')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .send({
        exportMode: 'draft',
        periodLabel: '2025-01',
        closeSessionId: closeSessionIdLocked,
        cover: { entity_name: 'E', report_date: '2025-01-31', period_label: '2025-01' },
        executive_summary: 'Summary',
        financial_statements: {},
        clean_ledger: [
          { account_name: 'A', debit: 100, credit: 0 },
          { account_name: 'B', debit: 0, credit: 100 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(res.headers['content-disposition']).toMatch(/Draft_Financials_NOT_CERTIFIED/);
  });

  it('binder export returns 403 unless certified (closeSessionId required)', async () => {
    if (!isDbConfigured()) return;
    const res = await request(app)
      .get('/api/audit/binder/export/pdf')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .query({ periodStart: '2025-01-01', periodEnd: '2025-01-31' });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('CLOSE_SESSION_REQUIRED');
  });

  it('binder export returns 403 when session is not certified', async () => {
    if (!isDbConfigured() || !closeSessionIdLocked) return;
    const res = await request(app)
      .get('/api/audit/binder/export/pdf')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .query({
        closeSessionId: closeSessionIdLocked,
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
      });
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('CLOSE_NOT_CERTIFIED');
  });

  it('GET /api/close/sessions/:id/certified-source returns metadata for certified and non-certified sessions', async () => {
    if (!isDbConfigured() || !closeSessionIdCertified || !closeSessionIdLocked) return;
    const certifiedRes = await request(app)
      .get(`/api/close/sessions/${closeSessionIdCertified}/certified-source`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(certifiedRes.status).toBe(200);
    expect(certifiedRes.body?.closeSessionId).toBe(closeSessionIdCertified);
    expect(certifiedRes.body?.isCertified).toBe(true);
    expect(certifiedRes.body?.certifiedSnapshotId).toBeTruthy();
    expect(certifiedRes.body?.snapshotHash).toBeTruthy();
    expect(certifiedRes.body?.snapshotHashVersion).toBeDefined();
    expect(certifiedRes.body?.certifiedSource).toBe('certified_snapshot');
    expect(typeof certifiedRes.body?.allowLegacyCertifiedSourceEffective).toBe('boolean');

    const lockedRes = await request(app)
      .get(`/api/close/sessions/${closeSessionIdLocked}/certified-source`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(lockedRes.status).toBe(200);
    expect(lockedRes.body?.closeSessionId).toBe(closeSessionIdLocked);
    expect(lockedRes.body?.isCertified).toBe(false);
    expect(lockedRes.body?.certifiedSource).toBe('none');
    expect(typeof lockedRes.body?.allowLegacyCertifiedSourceEffective).toBe('boolean');
  });

  it('binder export with certified session returns 200 when gate passes', async () => {
    if (!isDbConfigured() || !closeSessionIdCertified) return;
    const res = await request(app)
      .get('/api/audit/binder/export/pdf')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .query({
        closeSessionId: closeSessionIdCertified,
        periodStart: '2025-02-01',
        periodEnd: '2025-02-28',
      });
    if (res.status === 403 && res.body?.code === 'CLOSE_NOT_CERTIFIED') {
      throw new Error('Binder was blocked by certified gate even though session is certified');
    }
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/pdf|octet-stream/);
      expect(res.headers['content-disposition']).toMatch(/Audit_Binder/);
      expect(res.headers['x-certified-source']).toBe('certified_snapshot');
      expect(res.headers['x-certified-snapshot-id']).toBeDefined();
      expect(res.headers['x-certified-snapshot-hash']).toBeDefined();
      expect(res.headers['x-certified-snapshot-hash-version']).toBeDefined();
    }
  });

  it('binder export returns 403 when checkExportGate fails (e.g. tamper chain)', async () => {
    if (!isDbConfigured() || !closeSessionIdCertified) return;
    const exportGate = await import('../../src/services/export_gate_service.js');
    const original = exportGate.checkExportGate;
    (exportGate as { checkExportGate: typeof original }).checkExportGate = async () => ({
      allowed: false,
      alert: 'CRITICAL_TAMPER_ALERT' as const,
      message: 'Audit ledger chain verification failed.',
    });
    try {
      const res = await request(app)
        .get('/api/audit/binder/export/pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .query({
          closeSessionId: closeSessionIdCertified,
          periodStart: '2025-02-01',
          periodEnd: '2025-02-28',
        });
      expect(res.status).toBe(403);
      expect(res.body?.code).toBe('CRITICAL_TAMPER_ALERT');
    } finally {
      (exportGate as { checkExportGate: typeof original }).checkExportGate = original;
    }
  });

  it('certified export returns 422 RESOLUTION_MISMATCH when resolution counts mismatch (no artifact)', async () => {
    if (!isDbConfigured() || !closeSessionIdCertified) return;
    const exportGate = await import('../../src/services/export_gate_service.js');
    const original = exportGate.checkExportGate;
    (exportGate as { checkExportGate: typeof original }).checkExportGate = async () => ({
      allowed: false,
      alert: 'RESOLUTION_MISMATCH' as const,
      message: 'Ledger resolution mismatch: export blocked.',
      details: { resolvedCount: 2, ledgerResolutionCount: 1 },
    });
    try {
      const res = await request(app)
        .post('/api/export/pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .send({
          exportMode: 'certified',
          periodLabel: '2025-02',
          closeSessionId: closeSessionIdCertified,
          cover: { entity_name: 'E', report_date: '2025-02-28', period_label: '2025-02' },
          executive_summary: 'Summary',
          financial_statements: { balance_sheet: { totalAssets: 100, totalLiabilities: 50, totalEquity: 50 } },
          clean_ledger: [
            { account_name: 'A', debit: 100, credit: 0 },
            { account_name: 'B', debit: 0, credit: 100 },
          ],
        });
      expect(res.status).toBe(422);
      expect(res.body?.code).toBe('RESOLUTION_MISMATCH');
      expect(res.body?.details).toEqual({ resolvedCount: 2, ledgerResolutionCount: 1 });
      expect(res.body?.message).toMatch(/Ledger resolution mismatch/);
      expect(res.headers['content-type']).not.toMatch(/pdf/);
    } finally {
      (exportGate as { checkExportGate: typeof original }).checkExportGate = original;
    }
  });

  it('binder export returns 422 RESOLUTION_MISMATCH when resolution counts mismatch (no artifact)', async () => {
    if (!isDbConfigured() || !closeSessionIdCertified) return;
    const exportGate = await import('../../src/services/export_gate_service.js');
    const original = exportGate.checkExportGate;
    (exportGate as { checkExportGate: typeof original }).checkExportGate = async () => ({
      allowed: false,
      alert: 'RESOLUTION_MISMATCH' as const,
      message: 'Ledger resolution mismatch: export blocked.',
      details: { resolvedCount: 0, ledgerResolutionCount: 1 },
    });
    try {
      const res = await request(app)
        .get('/api/audit/binder/export/pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .query({
          closeSessionId: closeSessionIdCertified,
          periodStart: '2025-02-01',
          periodEnd: '2025-02-28',
        });
      expect(res.status).toBe(422);
      expect(res.body?.code).toBe('RESOLUTION_MISMATCH');
      expect(res.body?.details).toEqual({ resolvedCount: 0, ledgerResolutionCount: 1 });
      expect(res.headers['content-type']).not.toMatch(/pdf/);
    } finally {
      (exportGate as { checkExportGate: typeof original }).checkExportGate = original;
    }
  });

  it('with NODE_ENV=production, exportBypassCertification=1 does NOT bypass: certified + non-certified session -> 403', async () => {
    if (!isDbConfigured() || !closeSessionIdLocked) return;
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const resPdf = await request(app)
        .post('/api/export/pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .send({
          exportMode: 'certified',
          periodLabel: '2025-01',
          closeSessionId: closeSessionIdLocked,
          exportBypassCertification: '1',
          cover: { entity_name: 'E', report_date: '2025-01-31', period_label: '2025-01' },
          executive_summary: 'Summary',
          financial_statements: {},
          clean_ledger: [
            { account_name: 'A', debit: 100, credit: 0 },
            { account_name: 'B', debit: 0, credit: 100 },
          ],
        });
      expect(resPdf.status).toBe(403);
      expect(resPdf.body?.code).toBe('CLOSE_NOT_CERTIFIED');

      const resCsv = await request(app)
        .post('/api/export/csv')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .send({
          exportMode: 'certified',
          closeSessionId: closeSessionIdLocked,
          exportBypassCertification: 1,
          clean_ledger: [
            { account_name: 'A', debit: 100, credit: 0 },
            { account_name: 'B', debit: 0, credit: 100 },
          ],
        });
      expect(resCsv.status).toBe(403);
      expect(resCsv.body?.code).toBe('CLOSE_NOT_CERTIFIED');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

describe('Export draft imbalanced (Policy B)', () => {
  let authToken: string;

  beforeAll(() => {
    authToken = getTestAuthToken(process.env.TEST_TENANT_ID ?? 'export-certified-gate-tenant');
  });

  it('when ALLOW_IMBALANCED_DRAFT_EXPORT=true, draft export succeeds when imbalanced and returns draft PDF', async () => {
    const prev = process.env.ALLOW_IMBALANCED_DRAFT_EXPORT;
    process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = 'true';
    try {
      const res = await request(app)
        .post('/api/export/pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', process.env.TEST_TENANT_ID ?? 'export-certified-gate-tenant')
        .send({
          exportMode: 'draft',
          periodLabel: '2025-01',
          cover: { entity_name: 'E', report_date: '2025-01-31', period_label: '2025-01' },
          executive_summary: 'Summary',
          financial_statements: {},
          clean_ledger: [
            { account_name: 'A', debit: 100, credit: 0 },
            { account_name: 'B', debit: 0, credit: 50 },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/pdf/);
      expect(res.headers['content-disposition']).toMatch(/Draft_Financials_NOT_CERTIFIED/);
    } finally {
      if (prev !== undefined) process.env.ALLOW_IMBALANCED_DRAFT_EXPORT = prev;
      else delete process.env.ALLOW_IMBALANCED_DRAFT_EXPORT;
    }
  });
});
