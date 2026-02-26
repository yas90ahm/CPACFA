/**
 * Integration tests: PBC Index endpoint (GET /api/audit/pbc-index).
 * Contract: contractVersion v1, stable shape, deterministic missing[] from evidence.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import { createSnapshotFromTrialBalanceAndEntries } from '../../src/services/ledger_snapshot_service.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'pbc-index-tenant';

describe('PBC Index', () => {
  let authToken: string;
  let closeSessionIdDraft: string | undefined;
  let closeSessionIdLocked: string | undefined;
  let closeSessionIdCertified: string | undefined;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('PBC Index: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthToken(TEST_TENANT_ID);
    try {
      await queryControl(
        'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
        [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
      );
      const pool = await getTenantPool(TEST_TENANT_ID);
      const ts = Date.now();
      const draft = await closeSessionRepo.insertCloseSession(
        pool,
        `sess-draft-${ts}`,
        TEST_TENANT_ID,
        `entity-pbc-${ts}`,
        '2025-03-01',
        '2025-03-31',
        'accrual',
        'GAAP',
        'draft'
      );
      closeSessionIdDraft = draft.id;
      const locked = await closeSessionRepo.insertCloseSession(
        pool,
        `sess-locked-${ts}`,
        TEST_TENANT_ID,
        `entity-pbc-${ts}`,
        '2025-04-01',
        '2025-04-30',
        'accrual',
        'GAAP',
        'locked'
      );
      closeSessionIdLocked = locked.id;
      const certified = await closeSessionRepo.insertCloseSession(
        pool,
        `sess-cert-${ts}`,
        TEST_TENANT_ID,
        `entity-pbc-${ts}`,
        '2025-05-01',
        '2025-05-31',
        'accrual',
        'GAAP',
        'certified'
      );
      closeSessionIdCertified = certified.id;
      const snapshot = await createSnapshotFromTrialBalanceAndEntries(pool, {
        tenantId: TEST_TENANT_ID,
        periodLabel: '2025-05',
        closeSessionId: certified.id,
        createdBy: 'test-setup',
        source: 'close_session',
        trialBalance: {
          entries: [
            { accountName: 'Cash', debit: 200, credit: 0 },
            { accountName: 'Retained Earnings', debit: 0, credit: 200 },
          ],
          totalDebits: 200,
          totalCredits: 200,
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
      console.warn('PBC Index: could not create test sessions; skipping.', e);
    }
  });

  it('returns 400 when closeSessionId is missing', async () => {
    const res = await request(app)
      .get('/api/audit/pbc-index')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('VALIDATION');
  });

  it('returns 404 when close session is not found', async () => {
    const res = await request(app)
      .get('/api/audit/pbc-index')
      .query({ closeSessionId: 'non-existent-session-id' })
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(404);
    expect(res.body?.code).toBe('NOT_FOUND');
  });

  it('returns contractVersion v1 and stable response shape including evidenceSummary', async () => {
    if (!closeSessionIdDraft) return;
    const res = await request(app)
      .get('/api/audit/pbc-index')
      .query({ closeSessionId: closeSessionIdDraft })
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.closeSessionId).toBe(closeSessionIdDraft);
    expect(res.body).toHaveProperty('tenantId');
    expect(res.body).toHaveProperty('periodLabel');
    expect(res.body?.status).toHaveProperty('isLocked');
    expect(res.body?.status).toHaveProperty('isCertified');
    expect(res.body?.status).toHaveProperty('certifiedSnapshotId');
    expect(typeof res.body?.status?.isLocked).toBe('boolean');
    expect(typeof res.body?.status?.isCertified).toBe('boolean');
    expect(res.body?.status?.certifiedSnapshotId === null || typeof res.body?.status?.certifiedSnapshotId === 'string').toBe(true);
    expect(res.body?.evidence?.snapshot).toBeDefined();
    expect(typeof res.body?.evidence?.snapshot?.exists).toBe('boolean');
    expect(res.body?.evidence?.auditLedgerChain).toBeDefined();
    expect(['boolean', 'object']).toContain(typeof res.body?.evidence?.auditLedgerChain?.verified);
    expect(res.body?.evidence?.certifiedStatements?.source).toMatch(/^(certified_snapshot|session_snapshot|legacy|none)$/);
    expect(res.body?.evidence?.binder?.endpoints).toBeDefined();
    expect(typeof res.body?.evidence?.binder?.endpoints?.json).toBe('string');
    expect(res.body?.evidence?.binder?.endpoints?.json).toMatch(/^\/api\//);
    expect(res.body?.evidence?.exports?.certifiedPdf?.endpoint).toMatch(/^\/api\//);
    expect(Array.isArray(res.body?.missing)).toBe(true);
    expect(res.body?.evidenceSummary).toBeDefined();
    expect(['off', 'warn_only', 'hard_block']).toContain(res.body?.evidenceSummary?.enforcementMode);
    expect(typeof res.body?.evidenceSummary?.totalJournalEntries).toBe('number');
    expect(Array.isArray(res.body?.evidenceSummary?.missingEvidenceDetails)).toBe(true);
  });

  it('returns relative URLs by default (no absoluteUrls)', async () => {
    if (!closeSessionIdDraft) return;
    const res = await request(app)
      .get('/api/audit/pbc-index')
      .query({ closeSessionId: closeSessionIdDraft })
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.evidence?.binder?.endpoints?.json).toMatch(/^\/api\//);
    expect(res.body?.evidence?.binder?.endpoints?.pdf).toMatch(/^\/api\//);
    expect(res.body?.evidence?.exports?.certifiedPdf?.endpoint).toMatch(/^\/api\//);
  });

  it('returns absolute URLs when absoluteUrls=1', async () => {
    if (!closeSessionIdDraft) return;
    const res = await request(app)
      .get('/api/audit/pbc-index')
      .query({ closeSessionId: closeSessionIdDraft, absoluteUrls: '1' })
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.evidence?.binder?.endpoints?.json).toMatch(/^https?:\/\//);
    expect(res.body?.evidence?.exports?.certifiedPdf?.endpoint).toMatch(/^https?:\/\//);
  });

  it('for certified session: snapshot.exists true, certifiedStatements.available true, binder.available true, exports certified available true', async () => {
    if (!isDbConfigured() || !closeSessionIdCertified) return;
    const res = await request(app)
      .get('/api/audit/pbc-index')
      .query({ closeSessionId: closeSessionIdCertified })
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.evidence?.snapshot?.exists).toBe(true);
    expect(res.body?.evidence?.certifiedStatements?.available).toBe(true);
    expect(res.body?.evidence?.binder?.available).toBe(true);
    expect(res.body?.evidence?.exports?.certifiedPdf?.available).toBe(true);
    expect(res.body?.evidence?.exports?.certifiedCsv?.available).toBe(true);
    expect(res.body?.evidence?.certifiedStatements?.source).toBe('certified_snapshot');
  });

  it('for locked but not certified session: certifiedStatements.available false, missing includes CERTIFICATION_REQUIRED', async () => {
    if (!isDbConfigured() || !closeSessionIdLocked) return;
    const res = await request(app)
      .get('/api/audit/pbc-index')
      .query({ closeSessionId: closeSessionIdLocked })
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.status?.isLocked).toBe(true);
    expect(res.body?.status?.isCertified).toBe(false);
    expect(res.body?.evidence?.certifiedStatements?.available).toBe(false);
    const codes = (res.body?.missing ?? []).map((m: { code: string }) => m.code);
    expect(codes).toContain('CERTIFICATION_REQUIRED');
  });

  it('for draft (unlocked, uncertified) session: missing includes LOCK_REQUIRED and CERTIFICATION_REQUIRED', async () => {
    if (!isDbConfigured() || !closeSessionIdDraft) return;
    const res = await request(app)
      .get('/api/audit/pbc-index')
      .query({ closeSessionId: closeSessionIdDraft })
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.status?.isLocked).toBe(false);
    expect(res.body?.status?.isCertified).toBe(false);
    const codes = (res.body?.missing ?? []).map((m: { code: string }) => m.code);
    expect(codes).toContain('LOCK_REQUIRED');
    expect(codes).toContain('CERTIFICATION_REQUIRED');
  });
});
