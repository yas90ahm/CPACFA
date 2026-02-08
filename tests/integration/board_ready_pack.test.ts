/**
 * Integration tests: POST /api/precheck/board-ready-pack.
 * Composes precheck + optional PBC index and trust tokens when closeSessionId provided.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import { createSnapshotFromTrialBalanceAndEntries } from '../../src/services/ledger_snapshot_service.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'board-ready-pack-tenant';

const BALANCED_TB = [
  { accountName: 'Cash', debit: 500, credit: 0 },
  { accountName: 'Retained Earnings', debit: 0, credit: 500 },
];

describe('POST /api/precheck/board-ready-pack', () => {
  let authToken: string;
  let closeSessionIdDraft: string | undefined;
  let closeSessionIdCertified: string | undefined;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Board-ready-pack: DATABASE_URL not set; skipping.');
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
      const entityId = `entity-pack-${ts}`;
      const ensureRes = await request(app)
        .post('/api/close/sessions/ensure')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .set('Content-Type', 'application/json')
        .send({ entityId, periodLabel: '2025-06' });
      if (ensureRes.status === 200 || ensureRes.status === 201) {
        closeSessionIdDraft = ensureRes.body?.closeSessionId;
      }
      const certified = await closeSessionRepo.insertCloseSession(
        pool,
        `sess-cert-${ts}`,
        TEST_TENANT_ID,
        entityId,
        '2025-07-01',
        '2025-07-31',
        'accrual',
        'GAAP',
        'certified'
      );
      closeSessionIdCertified = certified.id;
      const snapshot = await createSnapshotFromTrialBalanceAndEntries(pool, {
        tenantId: TEST_TENANT_ID,
        periodLabel: '2025-07',
        closeSessionId: certified.id,
        createdBy: 'test-setup',
        source: 'close_session',
        trialBalance: {
          entries: [
            { accountName: 'Cash', debit: 300, credit: 0 },
            { accountName: 'Retained Earnings', debit: 0, credit: 300 },
          ],
          totalDebits: 300,
          totalCredits: 300,
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
      console.warn('Board-ready-pack: could not create test sessions; skipping.', e);
    }
  });

  it('A) pack without closeSessionId returns precheck + null pbcIndex, trustTokens certifiedSource none, evidenceSummary null', async () => {
    const res = await request(app)
      .post('/api/precheck/board-ready-pack')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-01',
        trialBalance: BALANCED_TB,
      });
    expect(res.status).toBe(200);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.precheck).toBeDefined();
    expect(res.body?.precheck?.periodLabel).toBe('2025-01');
    expect(res.body?.precheck?.status).toBe('ready');
    expect(res.body?.pbcIndex).toBeNull();
    expect(res.body?.evidenceSummary).toBeNull();
    expect(res.body?.trustTokens).toEqual({
      certifiedSnapshotId: null,
      snapshotHash: null,
      hashVersion: null,
      certifiedSource: 'none',
    });
  });

  it('B) pack with certified closeSessionId returns precheck + pbcIndex + trustTokens + evidenceSummary', async () => {
    if (!isDbConfigured() || !closeSessionIdCertified) return;
    const res = await request(app)
      .post('/api/precheck/board-ready-pack')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-07',
        trialBalance: BALANCED_TB,
        closeSessionId: closeSessionIdCertified,
      });
    expect(res.status).toBe(200);
    expect(res.body?.contractVersion).toBe('v1');
    expect(res.body?.precheck).toBeDefined();
    expect(res.body?.pbcIndex).toBeDefined();
    expect(res.body?.pbcIndex?.closeSessionId).toBe(closeSessionIdCertified);
    expect(res.body?.pbcIndex?.status?.isCertified).toBe(true);
    expect(res.body?.pbcIndex?.evidence?.snapshot?.exists).toBe(true);
    expect(res.body?.trustTokens).toBeDefined();
    expect(res.body?.trustTokens?.certifiedSnapshotId).toBeTruthy();
    expect(res.body?.trustTokens?.snapshotHash).toBeTruthy();
    expect(res.body?.trustTokens?.certifiedSource).toBe('certified_snapshot');
    expect(res.body?.pbcIndex?.evidence?.binder?.endpoints?.json).toMatch(/^\/api\//);
    expect(res.body?.evidenceSummary).toBeDefined();
    expect(['off', 'warn_only', 'hard_block']).toContain(res.body?.evidenceSummary?.enforcementMode);
    expect(typeof res.body?.evidenceSummary?.totalJournalEntries).toBe('number');
    expect(typeof res.body?.evidenceSummary?.materialJournalEntries).toBe('number');
    expect(Array.isArray(res.body?.evidenceSummary?.missingEvidenceDetails)).toBe(true);
  });

  it('pack with closeSessionId returns relative URLs by default', async () => {
    if (!isDbConfigured() || !closeSessionIdCertified) return;
    const res = await request(app)
      .post('/api/precheck/board-ready-pack')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-07',
        trialBalance: BALANCED_TB,
        closeSessionId: closeSessionIdCertified,
      });
    expect(res.status).toBe(200);
    expect(res.body?.pbcIndex?.evidence?.binder?.endpoints?.json).toMatch(/^\/api\//);
    expect(res.body?.pbcIndex?.evidence?.exports?.certifiedPdf?.endpoint).toMatch(/^\/api\//);
  });

  it('pack with absoluteUrls=1 returns absolute URLs in pbcIndex', async () => {
    if (!isDbConfigured() || !closeSessionIdCertified) return;
    const res = await request(app)
      .post('/api/precheck/board-ready-pack')
      .query({ absoluteUrls: '1' })
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-07',
        trialBalance: BALANCED_TB,
        closeSessionId: closeSessionIdCertified,
      });
    expect(res.status).toBe(200);
    expect(res.body?.pbcIndex?.evidence?.binder?.endpoints?.json).toMatch(/^https?:\/\//);
    expect(res.body?.pbcIndex?.evidence?.exports?.certifiedPdf?.endpoint).toMatch(/^https?:\/\//);
  });

  it('C) pack with draft session returns pbcIndex with missing LOCK_REQUIRED and CERTIFICATION_REQUIRED', async () => {
    if (!isDbConfigured() || !closeSessionIdDraft) return;
    const res = await request(app)
      .post('/api/precheck/board-ready-pack')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-06',
        trialBalance: BALANCED_TB,
        closeSessionId: closeSessionIdDraft,
      });
    expect(res.status).toBe(200);
    expect(res.body?.pbcIndex).toBeDefined();
    const codes = (res.body?.pbcIndex?.missing ?? []).map((m: { code: string }) => m.code);
    expect(codes).toContain('LOCK_REQUIRED');
    expect(codes).toContain('CERTIFICATION_REQUIRED');
  });

  it('returns 404 when closeSessionId is provided but session not found', async () => {
    const res = await request(app)
      .post('/api/precheck/board-ready-pack')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: '2025-01',
        trialBalance: BALANCED_TB,
        closeSessionId: 'non-existent-session-id',
      });
    expect(res.status).toBe(404);
    expect(res.body?.code).toBe('NOT_FOUND');
  });
});
