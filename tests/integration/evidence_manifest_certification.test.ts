/**
 * Integration: Certified Evidence Manifest at certification time.
 * - Certify with JE + evidence → snapshot includes manifest and hash verifies.
 * - If no evidence exists → manifest empty but stable.
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
import { getLedgerSnapshotById } from '../../src/db/repositories/ledger_snapshot_repository.js';
import { verifySnapshotHash } from '../../src/services/ledger_snapshot_service.js';

const PERIOD_LABEL = '2025-06';
const PERIOD_START = '2025-06-01';
const PERIOD_END = '2025-06-30';
const BALANCED_TB_CSV = `AccountName,Debit,Credit
Cash,500,0
Retained Earnings,0,500`;

describe('Certified Evidence Manifest', () => {
  let testTenantId: string;
  let authToken: string;

  beforeAll(async () => {
    if (!isDbConfigured()) return;
    testTenantId = process.env.TEST_TENANT_ID ?? `evidence-manifest-tenant-${Date.now()}`;
    authToken = getTestAuthTokenWithRole(testTenantId, 'approver');
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [testTenantId, `Test ${testTenantId}`]
    );
  });

  it('certify with JE + evidence → snapshot includes manifest and hash verifies', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(testTenantId);

    const ingestPath =
      process.env.NODE_ENV === 'production'
        ? '/api/trial-balance/ingest'
        : '/api-dev/trial-balance/ingest';
    const tmpCsv = path.join(os.tmpdir(), `evidence-manifest-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_TB_CSV, 'utf8');
    try {
      const ingestRes = await request(app)
        .post(ingestPath)
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', testTenantId)
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
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        basis: 'accrual',
        standard: 'GAAP',
      });
    expect([200, 201]).toContain(createSessionRes.status);
    const closeSessionId = createSessionRes.body?.id;
    expect(closeSessionId).toBeDefined();

    let jeId: string;
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
    jeId = createJeRes.body?.id;
    expect(jeId).toBeDefined();

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

    const record = await createEvidenceRecord(pool, testTenantId, {
      hashSha256: 'manifest-test-hash-abc',
      sizeBytes: 1024,
      mimeType: 'application/pdf',
      externalUri: 'https://drive.example.com/manifest-file',
      externalProvider: 'google_drive',
      label: 'Supporting doc',
      attachedBy: 'user@test.com',
    });
    await linkEvidenceToJournalEntry(pool, testTenantId, {
      evidenceId: record.id,
      objectId: jeId,
      role: 'support',
      requiredness: 'optional',
      createdBy: 'user@test.com',
    });

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
      let res = await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      if (res.status !== 200) {
        res = await request(app)
          .post(`/api/close/checklist-items/${id}/skip`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({ completedBy: 'test-user' });
      }
      expect([200, 404]).toContain(res.status);
    }

    for (const status of ['in_progress', 'ready_for_review', 'finalized', 'locked']) {
      const patchRes = await request(app)
        .patch(`/api/close/sessions/${closeSessionId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ status });
      expect(patchRes.status).toBe(200);
    }

    const lockRes = await request(app)
      .post('/api/close/period-lock')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({
        periodLabel: PERIOD_LABEL,
        lockedBy: 'test-user',
        reason: 'Evidence manifest test',
      });
    expect(lockRes.status).toBe(200);

    const certifyRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test-user', periodLabel: PERIOD_LABEL });
    expect(certifyRes.status).toBe(200);
    expect(certifyRes.body?.status).toBe('certified');
    const certifiedSnapshotId = certifyRes.body?.certifiedSnapshotId;
    expect(certifiedSnapshotId).toBeDefined();

    const snapshot = await getLedgerSnapshotById(pool, certifiedSnapshotId);
    expect(snapshot).toBeDefined();
    expect(snapshot!.snapshotPayloadJson.evidenceManifest).toBeDefined();
    expect(snapshot!.snapshotPayloadJson.evidenceManifest!.journalEntries.length).toBeGreaterThanOrEqual(1);
    const jeWithEvidence = snapshot!.snapshotPayloadJson.evidenceManifest!.journalEntries.find(
      (e) => e.journalEntryId === jeId
    );
    expect(jeWithEvidence).toBeDefined();
    expect(jeWithEvidence!.evidenceLinks).toHaveLength(1);
    expect(jeWithEvidence!.evidenceLinks[0].evidenceId).toBe(record.id);
    expect(jeWithEvidence!.evidenceLinks[0].hashSha256).toBe('manifest-test-hash-abc');

    expect(verifySnapshotHash(snapshot!)).toBe(true);
  }, 30_000);

  it('if no evidence exists → manifest empty but stable', async () => {
    if (!isDbConfigured()) return;
    const pool = await getTenantPool(testTenantId);

    const ingestPath =
      process.env.NODE_ENV === 'production'
        ? '/api/trial-balance/ingest'
        : '/api-dev/trial-balance/ingest';
    const tmpCsv = path.join(os.tmpdir(), `evidence-manifest-empty-${Date.now()}.csv`);
    fs.writeFileSync(tmpCsv, BALANCED_TB_CSV, 'utf8');
    try {
      const ingestRes = await request(app)
        .post(ingestPath)
        .set('Authorization', `Bearer ${authToken}`)
        .field('tenantId', testTenantId)
        .field('periodLabel', '2025-07')
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
        periodStart: '2025-07-01',
        periodEnd: '2025-07-31',
        basis: 'accrual',
        standard: 'GAAP',
      });
    const closeSessionId = createSessionRes.body?.id;
    expect(closeSessionId).toBeDefined();

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
      let res = await request(app)
        .post(`/api/close/checklist-items/${id}/complete`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ completedBy: 'test-user' });
      if (res.status !== 200) {
        res = await request(app)
          .post(`/api/close/checklist-items/${id}/skip`)
          .set('Authorization', `Bearer ${authToken}`)
          .set('Content-Type', 'application/json')
          .send({ completedBy: 'test-user' });
      }
      expect([200, 404]).toContain(res.status);
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
      .send({
        periodLabel: '2025-07',
        lockedBy: 'test-user',
        reason: 'Empty manifest test',
      });

    const certifyRes = await request(app)
      .post(`/api/close/sessions/${closeSessionId}/certify`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send({ certifiedBy: 'test-user', periodLabel: '2025-07' });
    expect(certifyRes.status).toBe(200);
    const certifiedSnapshotId = certifyRes.body?.certifiedSnapshotId;
    expect(certifiedSnapshotId).toBeDefined();

    const snapshot = await getLedgerSnapshotById(pool, certifiedSnapshotId);
    expect(snapshot).toBeDefined();
    expect(snapshot!.snapshotPayloadJson.evidenceManifest).toBeDefined();
    expect(snapshot!.snapshotPayloadJson.evidenceManifest!.journalEntries).toEqual([]);

    expect(verifySnapshotHash(snapshot!)).toBe(true);
  }, 30_000);
});
