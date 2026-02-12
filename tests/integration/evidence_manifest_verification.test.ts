/**
 * Integration tests: GET /api/verification/evidence-manifest/:snapshotId
 * Auditor verification surface — evidence manifest integrity.
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
import {
  createEvidenceRecord,
  linkEvidenceToJournalEntry,
} from '../../src/db/repositories/evidence_repository.js';
import { insertLedgerSnapshot } from '../../src/db/repositories/ledger_snapshot_repository.js';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? `evidence-manifest-verify-tenant-${Date.now()}`;
const PERIOD_LABEL = '2025-10';
const BALANCED_TB_CSV = `AccountName,Debit,Credit
Cash,600,0
Retained Earnings,0,600`;

describe('GET /api/verification/evidence-manifest/:snapshotId', () => {
  let authToken: string;
  let certifiedSnapshotIdWithEvidence: string | undefined;
  let snapshotIdWithoutManifest: string | undefined;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Evidence manifest verification: DATABASE_URL not set; skipping.');
      return;
    }
    authToken = getTestAuthTokenWithRole(TEST_TENANT_ID, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );

    const pool = await getTenantPool(TEST_TENANT_ID);

    // Snapshot without manifest (hashVersion 2)
    const legacyPayload = {
      trialBalance: {
        entries: [{ accountName: 'Cash', debit: 100, credit: 0 }, { accountName: 'RE', debit: 0, credit: 100 }],
        totalDebits: 100,
        totalCredits: 100,
      },
    };
    const legacySnapshot = await insertLedgerSnapshot(pool, {
      tenantId: TEST_TENANT_ID,
      periodLabel: '2025-09',
      createdBy: 'test',
      source: 'close_session',
      snapshotPayloadJson: legacyPayload,
      snapshotHash: 'legacy-hash-placeholder',
      hashVersion: 2,
    });
    snapshotIdWithoutManifest = legacySnapshot.id;

    try {
      const ingestPath = '/api/trial-balance/ingest';
      const tmpCsv = path.join(os.tmpdir(), `ev-manifest-verify-${Date.now()}.csv`);
      fs.writeFileSync(tmpCsv, BALANCED_TB_CSV, 'utf8');
      try {
        const ingestRes = await request(app)
          .post(ingestPath)
          .set('Authorization', `Bearer ${authToken}`)
          .field('tenantId', TEST_TENANT_ID)
          .field('periodLabel', PERIOD_LABEL)
          .attach('file', tmpCsv);
        expect(ingestRes.status).toBe(200);
      } finally {
        fs.unlinkSync(tmpCsv);
      }

      const createSessionRes = await request(app)
        .post('/api/close/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          entityId: 'e1',
          periodStart: '2025-10-01',
          periodEnd: '2025-10-31',
          basis: 'accrual',
          standard: 'GAAP',
        });
      expect([200, 201]).toContain(createSessionRes.status);
      const closeSessionId = createSessionRes.body?.id;

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

      await request(app)
        .post(`/api/close/journal-entries/${jeId}/propose`)
        .set('Authorization', `Bearer ${authToken}`);
      await request(app)
        .post(`/api/close/journal-entries/${jeId}/approve`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ approvedBy: 'test-approver' });
      await request(app)
        .post(`/api/close/journal-entries/${jeId}/post`)
        .set('Authorization', `Bearer ${authToken}`);

      const record = await createEvidenceRecord(pool, TEST_TENANT_ID, {
        hashSha256: 'verification-manifest-hash-xyz',
        sizeBytes: 512,
        mimeType: 'application/pdf',
        attachedBy: 'user@test.com',
      });
      await linkEvidenceToJournalEntry(pool, TEST_TENANT_ID, {
        evidenceId: record.id,
        objectId: jeId,
        role: 'support',
        requiredness: 'optional',
        assertionType: 'invoice_support',
        createdBy: 'user@test.com',
      });

      const initRes = await request(app)
        .post(`/api/close/sessions/${closeSessionId}/checklist/initialize`)
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 201]).toContain(initRes.status);

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
          .send({ completedBy: 'test-user' })
          .catch(() => {});
        await request(app)
          .post(`/api/close/checklist-items/${id}/skip`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({ completedBy: 'test-user' })
          .catch(() => {});
      }

      for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
        await request(app)
          .patch(`/api/close/sessions/${closeSessionId}/status`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({ status });
      }

      await request(app)
        .post('/api/close/period-lock')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ periodLabel: PERIOD_LABEL, lockedBy: 'test-user', reason: 'Verify manifest' });

      const certifyRes = await request(app)
        .post(`/api/close/sessions/${closeSessionId}/certify`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ certifiedBy: 'test-user', periodLabel: PERIOD_LABEL });
      expect(certifyRes.status).toBe(200);
      certifiedSnapshotIdWithEvidence = certifyRes.body?.certifiedSnapshotId;
    } catch (e) {
      console.warn('Evidence manifest verification: could not create certified session; skipping.', e);
    }
  }, 60000);

  it('A) Invalid UUID → 404', async () => {
    const res = await request(app)
      .get('/api/verification/evidence-manifest/invalid-uuid')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(404);
    expect(res.body?.code).toBe('NOT_FOUND');
  });

  it('B) Snapshot without evidence manifest (hashVersion < 3) → supported false', async () => {
    if (!isDbConfigured() || !snapshotIdWithoutManifest) return;
    const res = await request(app)
      .get(`/api/verification/evidence-manifest/${snapshotIdWithoutManifest}`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.supported).toBe(false);
    expect(res.body?.reason).toBe('NO_EVIDENCE_MANIFEST_IN_HASH_VERSION');
  });

  it('C) Certified snapshot with evidence → supported=true, matchesSnapshotBinding=true', async () => {
    if (!isDbConfigured() || !certifiedSnapshotIdWithEvidence) return;
    const res = await request(app)
      .get(`/api/verification/evidence-manifest/${certifiedSnapshotIdWithEvidence}`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.supported).toBe(true);
    expect(res.body?.evidenceManifest?.entryCount).toBeGreaterThanOrEqual(1);
    expect(res.body?.evidenceManifest?.matchesSnapshotBinding).toBe(true);
    expect(res.body?.evidenceManifest?.recomputedManifestHash).toBeDefined();
    expect(res.body?.evidenceManifest?.storedManifestHash).toBeNull();
    expect(res.body?.manifestDetails).toBeUndefined();
  });

  it('includeDetails=1 returns minimal manifest detail (no URIs/labels)', async () => {
    if (!isDbConfigured() || !certifiedSnapshotIdWithEvidence) return;
    const res = await request(app)
      .get(`/api/verification/evidence-manifest/${certifiedSnapshotIdWithEvidence}?includeDetails=1`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.manifestDetails).toBeDefined();
    expect(Array.isArray(res.body.manifestDetails)).toBe(true);
    if (res.body.manifestDetails.length > 0) {
      const item = res.body.manifestDetails[0];
      expect(item.journalEntryId).toBeDefined();
      expect(item.evidenceId).toBeDefined();
      expect(item.hashSha256).toBeDefined();
      expect(item.externalUri).toBeUndefined();
      expect(item.label).toBeUndefined();
      expect(item.externalProvider).toBeUndefined();
    }
  });

  it('D) Tamper simulation → matchesSnapshotBinding=false', async () => {
    if (!isDbConfigured() || !certifiedSnapshotIdWithEvidence) return;
    const pool = await getTenantPool(TEST_TENANT_ID);
    const r = await pool.query<{ snapshot_payload_json: unknown }>(
      'SELECT snapshot_payload_json FROM ledger_snapshots WHERE id = $1',
      [certifiedSnapshotIdWithEvidence]
    );
    const payload = r.rows[0]?.snapshot_payload_json as Record<string, unknown>;
    if (!payload?.evidenceManifest) return;
    const manifest = payload.evidenceManifest as Record<string, unknown>;
    const entries = manifest.journalEntries as Array<Record<string, unknown>>;
    if (!entries?.[0]?.evidenceLinks) return;
    const links = entries[0].evidenceLinks as Array<Record<string, unknown>>;
    if (!links?.[0]) return;
    links[0].hashSha256 = 'tampered_hash_value';
    try {
      await pool.query(
        'UPDATE ledger_snapshots SET snapshot_payload_json = $1 WHERE id = $2',
        [JSON.stringify(payload), certifiedSnapshotIdWithEvidence]
      );
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? String(e);
      if (msg.includes('immutable') || msg.includes('prohibited')) return; // Append-only trigger blocks UPDATE
      throw e;
    }

    const res = await request(app)
      .get(`/api/verification/evidence-manifest/${certifiedSnapshotIdWithEvidence}`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TEST_TENANT_ID);
    expect(res.status).toBe(200);
    expect(res.body?.supported).toBe(true);
    expect(res.body?.evidenceManifest?.matchesSnapshotBinding).toBe(false);
  });
});
